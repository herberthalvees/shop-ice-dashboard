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
  parametros: Record<string, string> = {},
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
    ...parametros,
  });

  const resposta = await fetch(`${apiBase}${path}?${query.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  return (await resposta.json()) as any;
}

function paraIso(segundos: unknown): string | null {
  const n = Number(segundos);
  if (!n || Number.isNaN(n)) return null;
  return new Date(n * 1000).toISOString();
}

function tokenInvalido(resposta: { error?: string; message?: string } | null | undefined) {
  const texto = `${resposta?.error ?? ""} ${resposta?.message ?? ""}`.toLowerCase();
  return texto.includes("invalid_acceess_token") || texto.includes("invalid_access_token");
}

// Sincroniza os pedidos de UMA loja. Retorna o resumo dessa loja; os erros
// ficam no array `erros` (compartilhado com o handler só para o sync_log).
async function sincronizarLoja(
  lojaId: number,
  inicioOriginal: number,
  limite: number,
  campo: "create_time" | "update_time",
  inicioExecucao: number,
) {
  const erros: string[] = [];
  const { supabaseAdmin: supabaseAdminTyped } =
    await import("@/integrations/supabase/client.server");
  const supabaseAdmin = supabaseAdminTyped as any;

  const { data: conexao, error: erroBanco } = await supabaseAdmin
    .from("shopee_connection")
    .select("shop_id, access_token, refresh_token, token_expires_at")
    .eq("loja_id", lojaId)
    .eq("app_tipo", "principal")
    .maybeSingle();

  if (erroBanco || !conexao || !conexao.access_token) {
    return { loja_id: lojaId, ok: false, erro: "loja nao conectada" };
  }

  const shopId = Number(conexao.shop_id);
  let token = conexao.access_token as string;
  let tokenRenovadoNestaExecucao = false;

  const renovarERecarregarToken = async () => {
    if (tokenRenovadoNestaExecucao) return false;
    tokenRenovadoNestaExecucao = true;
    const { renovarTokenSeNecessario } = await import("@/lib/loja-conexao.server");
    const renovacao = await renovarTokenSeNecessario(lojaId, "principal");
    if (!renovacao.ok) {
      erros.push(`refresh_token: ${renovacao.error ?? "falha ao renovar"}`);
      return false;
    }
    const { data: atualizada } = await supabaseAdmin
      .from("shopee_connection")
      .select("access_token")
      .eq("loja_id", lojaId)
      .eq("app_tipo", "principal")
      .maybeSingle();
    if (!atualizada?.access_token) {
      erros.push("refresh_token: token renovado nao encontrado");
      return false;
    }
    token = atualizada.access_token;
    return true;
  };

  if (!conexao.token_expires_at || new Date(conexao.token_expires_at as string) <= new Date()) {
    const recuperado = await renovarERecarregarToken();
    if (!recuperado) {
      return { loja_id: lojaId, ok: false, erro: "access_token expirado", erros };
    }
  }

  const todosSn: string[] = [];
  let inicio = inicioOriginal;

  while (inicio < limite) {
    const fim = Math.min(inicio + 15 * 24 * 60 * 60, limite);
    let cursor = "";
    let temMais = true;
    let guarda = 0;

    while (temMais && guarda < 50) {
      guarda++;

      const parametros: Record<string, string> = {
        time_range_field: campo,
        time_from: String(inicio),
        time_to: String(fim),
        page_size: "100",
      };
      if (cursor) parametros.cursor = cursor;

      let lista = await chamarShopee(
        "/api/v2/order/get_order_list",
        token,
        shopId,
        lojaId,
        parametros,
      );

      if (tokenInvalido(lista) && (await renovarERecarregarToken())) {
        lista = await chamarShopee(
          "/api/v2/order/get_order_list",
          token,
          shopId,
          lojaId,
          parametros,
        );
      }

      if (lista.error && lista.error !== "") {
        erros.push(`get_order_list: ${lista.error} ${lista.message ?? ""}`);
        break;
      }

      const pagina = lista.response?.order_list ?? [];
      for (const p of pagina) todosSn.push(p.order_sn);

      temMais = Boolean(lista.response?.more);
      cursor = lista.response?.next_cursor ?? "";
      if (!cursor) temMais = false;
    }

    inicio = fim;
  }

  const unicos = Array.from(new Set(todosSn));
  let gravados = 0;

  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);

    let detalhe = await chamarShopee("/api/v2/order/get_order_detail", token, shopId, lojaId, {
      order_sn_list: lote.join(","),
      response_optional_fields:
        "buyer_username,total_amount,item_list,pay_time,actual_shipping_fee",
    });

    if (tokenInvalido(detalhe) && (await renovarERecarregarToken())) {
      detalhe = await chamarShopee("/api/v2/order/get_order_detail", token, shopId, lojaId, {
        order_sn_list: lote.join(","),
        response_optional_fields:
          "buyer_username,total_amount,item_list,pay_time,actual_shipping_fee",
      });
    }

    if (detalhe.error && detalhe.error !== "") {
      erros.push(`get_order_detail: ${detalhe.error} ${detalhe.message ?? ""}`);
      continue;
    }

    const linhas = (detalhe.response?.order_list ?? []).map((p: Record<string, unknown>) => ({
      loja_id: lojaId,
      order_sn: p.order_sn,
      status: p.order_status ?? null,
      valor_total: p.total_amount ?? null,
      moeda: p.currency ?? null,
      comprador_username: p.buyer_username ?? null,
      qtd_itens: Array.isArray(p.item_list) ? (p.item_list as unknown[]).length : 0,
      itens: p.item_list ?? null,
      data_criacao_pedido: paraIso(p.create_time),
      data_pagamento: paraIso(p.pay_time),
      frete_real: p.actual_shipping_fee ?? null,
      payload: p,
      updated_at: new Date().toISOString(),
    }));

    if (linhas.length > 0) {
      const { data: jaExistentes } = await supabaseAdmin
        .from("pedidos")
        .select("order_sn")
        .eq("loja_id", lojaId)
        .in(
          "order_sn",
          linhas.map((l: { order_sn: unknown }) => String(l.order_sn)),
        );
      const conhecidos = new Set((jaExistentes ?? []).map((p: { order_sn: string }) => p.order_sn));

      const { error: erroUpsert } = await supabaseAdmin
        .from("pedidos")
        .upsert(linhas as any, { onConflict: "loja_id,order_sn" });

      if (erroUpsert) {
        erros.push(`upsert: ${erroUpsert.message}`);
      } else {
        gravados += linhas.length;

        const novos = linhas.filter(
          (l: { order_sn: unknown }) => !conhecidos.has(String(l.order_sn)),
        );
        if (novos.length > 0) {
          try {
            const { notificarNovaVenda } = await import("@/lib/push.server");
            for (const novo of novos) {
              await notificarNovaVenda({
                order_sn: String(novo.order_sn),
                valor_total: Number(novo.valor_total ?? 0),
                itens: novo.itens ?? [],
              });
            }
          } catch (pushErro) {
            erros.push(`push_nova_venda: ${String(pushErro)}`);
          }
        }
      }
    }
  }

  try {
    await supabaseAdmin.from("sync_log").insert({
      loja_id: lojaId,
      campo,
      de: new Date(inicioOriginal * 1000).toISOString(),
      ate: new Date(limite * 1000).toISOString(),
      encontrados: unicos.length,
      gravados,
      duracao_ms: Date.now() - inicioExecucao,
      ok: erros.length === 0,
      erros: erros.length ? erros : null,
    });
  } catch (logErro) {
    console.error("falha ao gravar sync_log", lojaId, String(logErro));
  }

  return {
    loja_id: lojaId,
    ok: erros.length === 0,
    encontrados: unicos.length,
    gravados,
    erros,
  };
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;
  const inicioExecucao = Date.now();

  try {
    const url = new URL(request.url);
    const campo = url.searchParams.get("campo") === "update_time" ? "update_time" : "create_time";

    const agora = Math.floor(Date.now() / 1000);
    const deParam = url.searchParams.get("de");
    const ateParam = url.searchParams.get("ate");

    let inicio: number;
    let limite: number;

    if (deParam && ateParam) {
      inicio = Number(deParam);
      limite = Number(ateParam);
    } else {
      const dias = Math.min(Number(url.searchParams.get("dias") ?? "1"), 15);
      inicio = agora - Math.round(dias * 24 * 60 * 60);
      limite = agora;
    }

    if (!inicio || !limite || inicio >= limite) {
      return responder({ ok: false, erro: "faixa de datas invalida" }, 400);
    }

    const lojas = await listarLojasAtivas();
    if (lojas.length === 0) {
      return responder({ ok: false, erro: "nenhuma loja ativa cadastrada" }, 400);
    }

    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await sincronizarLoja(loja.id, inicio, limite, campo, inicioExecucao));
    }

    const ok = resultados.every((r) => r.ok);
    console.log("sync concluido", {
      campo,
      lojas: resultados.map((r) => ({
        loja_id: r.loja_id,
        ok: r.ok,
        gravados: (r as any).gravados,
      })),
    });

    return responder({
      ok,
      campo,
      de: new Date(inicio * 1000).toISOString(),
      ate: new Date(limite * 1000).toISOString(),
      lojas: resultados,
      duracao_ms: Date.now() - inicioExecucao,
    });
  } catch (erro) {
    console.error("erro no sync", String(erro));
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/sync")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
