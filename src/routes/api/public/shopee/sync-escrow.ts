import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { credenciaisLoja } from "@/lib/shopee-credenciais.server";
import { listarLojasAtivas } from "@/lib/lojas.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(chave: string, mensagem: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function chamarShopee(
  path: string,
  accessToken: string,
  shopId: number,
  lojaId: number,
  opcoes: {
    metodo?: string;
    query?: Record<string, string>;
    corpo?: unknown;
  } = {},
  appTipo: "principal" | "ads" = "principal",
) {
  const { partnerId, partnerKey, apiBase } = await credenciaisLoja(lojaId, appTipo);
  if (!partnerId || !partnerKey || !apiBase) throw new Error("credenciais Shopee ausentes");

  const timestamp = Math.floor(Date.now() / 1000);
  const stringBase = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  const sign = await hmacSha256Hex(partnerKey, stringBase);

  const query = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign: sign,
    ...(opcoes.query ?? {}),
  });

  const init: RequestInit = {
    method: opcoes.metodo ?? "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (opcoes.corpo !== undefined) {
    init.body = JSON.stringify(opcoes.corpo);
  }

  const resposta = await fetch(`${apiBase}${path}?${query.toString()}`, init);
  return (await resposta.json()) as any;
}

function normalizar(orderSn: string, detalhe: Record<string, any>) {
  const renda = detalhe?.order_income ?? {};
  return {
    order_sn: orderSn,
    valor_liquido: renda.escrow_amount ?? null,
    comissao: renda.commission_fee ?? null,
    taxa_servico: renda.service_fee ?? null,
    taxa_transacao: renda.seller_transaction_fee ?? null,
    payload: renda,
  };
}

// Preenche o escrow dos pedidos pendentes de UMA loja.
async function sincronizarLoja(lojaId: number, limite: number) {
  const erros: string[] = [];
  const { supabaseAdmin: supabaseAdminTyped } =
    await import("@/integrations/supabase/client.server");
  const supabaseAdmin = supabaseAdminTyped as any;

  const { data: conexao, error: erroConexao } = await supabaseAdmin
    .from("shopee_connection")
    .select("shop_id, access_token, token_expires_at")
    .eq("loja_id", lojaId)
    .eq("app_tipo", "principal")
    .maybeSingle();

  if (erroConexao || !conexao?.access_token) {
    return { loja_id: lojaId, ok: false, erro: "loja nao conectada" };
  }
  if (new Date(conexao.token_expires_at as string) < new Date()) {
    return { loja_id: lojaId, ok: false, erro: "access_token expirado" };
  }

  const shopId = Number(conexao.shop_id);
  const token = conexao.access_token as string;

  const { data: pendentes, error: erroFila } = await supabaseAdmin.rpc("pedidos_escrow_pendentes", {
    p_limite: limite,
    p_loja_id: lojaId,
  });

  if (erroFila) {
    return { loja_id: lojaId, ok: false, erro: erroFila.message };
  }

  const sns: string[] = ((pendentes ?? []) as Array<{ order_sn: string }>).map((r) => r.order_sn);

  if (sns.length === 0) {
    return { loja_id: lojaId, ok: true, fila_vazia: true };
  }

  let atualizados = 0;
  let usouFallback = false;

  for (let i = 0; i < sns.length; i += 50) {
    const lote = sns.slice(i, i + 50);
    const registros: Array<Record<string, unknown>> = [];

    const emLote = await chamarShopee(
      "/api/v2/payment/get_escrow_detail_batch",
      token,
      shopId,
      lojaId,
      {
        metodo: "POST",
        corpo: { order_sn_list: lote },
      },
    );

    const loteFuncionou = !emLote.error || emLote.error === "";

    if (loteFuncionou) {
      const lista = emLote.response ?? [];
      for (const item of lista) {
        const sn = item.order_sn ?? item.escrow_detail?.order_sn;
        const detalhe = item.escrow_detail ?? item;
        if (sn) registros.push(normalizar(sn, detalhe));
      }
    } else {
      usouFallback = true;
      for (const sn of lote) {
        const um = await chamarShopee("/api/v2/payment/get_escrow_detail", token, shopId, lojaId, {
          query: { order_sn: sn },
        });

        if (!um.error || um.error === "") {
          registros.push(normalizar(sn, um.response ?? {}));
        } else {
          erros.push(`${sn}: ${um.error}`);
        }
      }
    }

    if (registros.length > 0) {
      const { data: qtd, error: erroAplicar } = await supabaseAdmin.rpc("aplicar_escrow", {
        p_dados: registros,
        p_loja_id: lojaId,
      });

      if (erroAplicar) {
        erros.push(`aplicar_escrow: ${erroAplicar.message}`);
      } else {
        atualizados += Number(qtd ?? 0);
      }
    }
  }

  const { count: restantes } = await supabaseAdmin
    .from("pedidos")
    .select("order_sn", { count: "exact", head: true })
    .eq("loja_id", lojaId)
    .is("escrow_atualizado_em", null)
    .not("status", "in", '("UNPAID","CANCELLED")');

  return {
    loja_id: lojaId,
    ok: erros.length === 0,
    processados: sns.length,
    atualizados,
    ainda_pendentes: restantes ?? null,
    usou_fallback_individual: usouFallback,
    erros: erros.slice(0, 20),
  };
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;
  const inicioExecucao = Date.now();

  try {
    const url = new URL(request.url);
    const limite = Math.min(Number(url.searchParams.get("limite") ?? "300"), 1000);

    const lojas = await listarLojasAtivas();
    if (lojas.length === 0) {
      return responder({ ok: false, erro: "nenhuma loja ativa cadastrada" }, 400);
    }

    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await sincronizarLoja(loja.id, limite));
    }

    const ok = resultados.every((r) => r.ok);
    console.log("sync-escrow concluido", {
      lojas: resultados.map((r) => ({
        loja_id: r.loja_id,
        ok: r.ok,
        atualizados: (r as any).atualizados,
      })),
      duracao_ms: Date.now() - inicioExecucao,
    });

    return responder({
      ok,
      lojas: resultados,
      duracao_ms: Date.now() - inicioExecucao,
    });
  } catch (erro) {
    console.error("erro no sync-escrow", String(erro));
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/sync-escrow")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
