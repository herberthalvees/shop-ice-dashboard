import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TIPOS_EVENTO: Record<number, string> = {
  1: "autorizacao_loja",
  2: "desautorizacao_loja",
  3: "atualizacao_status_pedido",
  4: "codigo_rastreio",
  5: "atualizacao_loja",
  6: "item_banido",
  7: "promocao_item",
  8: "alteracao_estoque_reservado",
  9: "atualizacao_promocao",
  10: "webchat",
  12: "expiracao_autorizacao",
  15: "atualizacao_rastreio",
};

async function hmacSha256Hex(chave: string, mensagem: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(mensagem),
  );
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handlePush(request: Request) {
  // IMPORTANTE: esta rota SEMPRE responde 200, mesmo em erro.
  // A Shopee desativa o push automaticamente apos falhas repetidas.
  try {
    // O corpo precisa ser lido como texto bruto.
    // Fazer parse e serializar de novo quebra a assinatura.
    const corpoBruto = await request.text();
    const assinaturaRecebida = (request.headers.get("authorization") ?? "").trim();

    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const pushUrl = process.env.SHOPEE_PUSH_URL;

    if (!partnerKey || !pushUrl) {
      console.error("secrets ausentes no webhook");
      return ok();
    }

    const assinaturaEsperada = await hmacSha256Hex(
      partnerKey,
      `${pushUrl}|${corpoBruto}`,
    );

    const assinaturaValida =
      assinaturaEsperada === assinaturaRecebida.toLowerCase();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(corpoBruto);
    } catch {
      payload = { corpo_nao_json: corpoBruto };
    }

    const code = Number(payload.code ?? 0);
    const shopId = payload.shop_id ? Number(payload.shop_id) : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: erroBanco } = await supabaseAdmin.from("eventos_log").insert({
      code,
      tipo_evento: TIPOS_EVENTO[code] ?? `desconhecido_${code}`,
      shop_id: shopId,
      payload,
      assinatura_valida: assinaturaValida,
    });

    if (erroBanco) {
      console.error("falha ao gravar evento", erroBanco.message);
    }

    if (!assinaturaValida) {
      console.warn("push com assinatura invalida", {
        code,
        shop_id: shopId,
        tinha_header: assinaturaRecebida.length > 0,
      });
    } else {
      console.log("push recebido", { code, shop_id: shopId });
    }

    return ok();
  } catch (erro) {
    console.error("erro no webhook", String(erro));
    return ok();
  }
}

export const Route = createFileRoute("/api/public/shopee/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: corsHeaders }),
      GET: async ({ request }) => handlePush(request),
      POST: async ({ request }) => handlePush(request),
    },
  },
});

export const Route = createFileRoute("/api/public/shopee/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = Object.fromEntries(request.headers.entries());
        console.log("[shopee-webhook]", { method: request.method, headers });
        return Response.json({ ok: true, rota: "webhook" }, { status: 200 });
      },
      GET: async ({ request }) => {
        const headers = Object.fromEntries(request.headers.entries());
        console.log("[shopee-webhook]", { method: request.method, headers });
        return Response.json({ ok: true, rota: "webhook" }, { status: 200 });
      },
    },
  },
});