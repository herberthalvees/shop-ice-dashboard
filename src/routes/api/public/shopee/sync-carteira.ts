import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { credenciais } from "@/lib/shopee-credenciais.server";
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
  opcoes: {
    metodo?: string;
    query?: Record<string, string>;
    corpo?: unknown;
  } = {},
  appTipo: string = "principal",
) {
  const { partnerId, partnerKey, apiBase } = credenciais(appTipo);
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

const JANELA_MAX_SEG = 15 * 24 * 60 * 60; // 15 dias
const PAGE_SIZE = 100;
const MAX_PAGINAS = 200;
const LOTE_GRAVACAO = 200;

// Sincroniza a carteira (wallet) de UMA loja.
async function sincronizarLoja(lojaId: number, de: number, ate: number) {
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

  let encontradas = 0;
  let gravadas = 0;
  let saldoMaisRecente: number | null = null;
  let saldoTs = 0;
  const mapa = new Map<string, any>();

  async function flush() {
    if (mapa.size === 0) return;
    const lote = Array.from(mapa.values());
    mapa.clear();
    const { data, error } = await supabaseAdmin.rpc("aplicar_carteira", {
      p_dados: lote,
      p_loja_id: lojaId,
    });
    if (error) {
      erros.push(`aplicar_carteira: ${error.message}`);
    } else {
      gravadas += Number(data ?? 0);
    }
  }

  for (let janelaDe = de; janelaDe < ate; janelaDe += JANELA_MAX_SEG) {
    const janelaAte = Math.min(janelaDe + JANELA_MAX_SEG, ate);

    for (let page = 0; page < MAX_PAGINAS; page++) {
      const resp = await chamarShopee(
        "/api/v2/payment/get_wallet_transaction_list",
        token,
        shopId,
        {
          query: {
            page_no: String(page),
            page_size: String(PAGE_SIZE),
            create_time_from: String(janelaDe),
            create_time_to: String(janelaAte),
          },
        },
      );

      if (resp.error && resp.error !== "") {
        erros.push(`janela ${janelaDe}-${janelaAte} pag ${page}: ${resp.error}`);
        break;
      }

      const lista: any[] = resp.response?.transaction_list ?? [];

      for (const t of lista) {
        const id = t?.transaction_id;
        if (id == null) continue;
        const ts = Number(t.create_time ?? 0);
        const saldo =
          t.current_balance != null && t.current_balance !== "" ? Number(t.current_balance) : null;
        if (saldo != null && ts > saldoTs) {
          saldoTs = ts;
          saldoMaisRecente = saldo;
        }
        const chave = String(id);
        const existente = mapa.get(chave);
        if (!existente || Number(existente.create_time ?? 0) < ts) {
          mapa.set(chave, t);
        }
        if (mapa.size >= LOTE_GRAVACAO) {
          await flush();
        }
      }
      encontradas += lista.length;

      const temMais = Boolean(resp.response?.more);
      if (!temMais || lista.length === 0) break;
    }
  }

  await flush();

  return {
    loja_id: lojaId,
    ok: erros.length === 0,
    transacoes_encontradas: encontradas,
    gravadas,
    saldo_mais_recente: saldoMaisRecente,
    erros: erros.slice(0, 20),
  };
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  const inicio = Date.now();

  try {
    const url = new URL(request.url);
    const agora = Math.floor(Date.now() / 1000);

    const deParam = url.searchParams.get("de");
    const ateParam = url.searchParams.get("ate");
    const horas = Number(url.searchParams.get("horas") ?? "3");

    let de: number;
    let ate: number;
    if (deParam && ateParam) {
      de = Number(deParam);
      ate = Number(ateParam);
    } else {
      ate = agora;
      de = agora - Math.max(1, horas) * 60 * 60;
    }

    if (!(de > 0) || !(ate > de)) {
      return responder({ ok: false, erro: "intervalo invalido" }, 400);
    }

    const lojas = await listarLojasAtivas();
    if (lojas.length === 0) {
      return responder({ ok: false, erro: "nenhuma loja ativa cadastrada" }, 400);
    }

    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await sincronizarLoja(loja.id, de, ate));
    }

    const ok = resultados.every((r) => r.ok);
    console.log("sync-carteira concluido", {
      janela_seg: ate - de,
      lojas: resultados.map((r) => ({
        loja_id: r.loja_id,
        ok: r.ok,
        gravadas: (r as any).gravadas,
      })),
      duracao_ms: Date.now() - inicio,
    });

    return responder({
      ok,
      lojas: resultados,
      duracao_ms: Date.now() - inicio,
    });
  } catch (erro) {
    console.error("erro no sync-carteira", String(erro));
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/sync-carteira")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
