import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(mensagem),
  );
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function chamarShopee(
  path: string,
  accessToken: string,
  shopId: number,
  parametros: Record<string, string> = {},
) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const apiBase = process.env.SHOPEE_API_BASE!;

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

  return await resposta.json();
}

async function handler() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conexao, error: erroBanco } = await supabaseAdmin
      .from("shopee_connection")
      .select("shop_id, access_token, token_expires_at, status")
      .eq("id", 1)
      .single();

    if (erroBanco || !conexao || !conexao.access_token) {
      return responder({
        ok: false,
        erro: "nenhuma loja conectada",
        dica: "rode o fluxo de autorizacao novamente",
      }, 400);
    }

    if (new Date(conexao.token_expires_at as string) < new Date()) {
      return responder({
        ok: false,
        erro: "access_token expirado",
        expirou_em: conexao.token_expires_at,
        dica: "reautorize a loja ou implemente o refresh",
      }, 400);
    }

    const shopId = Number(conexao.shop_id);
    const token = conexao.access_token as string;

    const infoLoja: any = await chamarShopee(
      "/api/v2/shop/get_shop_info",
      token,
      shopId,
    );

    if (infoLoja.error && infoLoja.error !== "") {
      console.error("erro no get_shop_info", {
        error: infoLoja.error,
        message: infoLoja.message,
      });
      return responder({
        ok: false,
        etapa: "get_shop_info",
        erro: infoLoja.error,
        mensagem: infoLoja.message,
      }, 400);
    }

    const nomeLoja = infoLoja.shop_name ?? null;

    if (nomeLoja) {
      await supabaseAdmin
        .from("shopee_connection")
        .update({ shop_name: nomeLoja, updated_at: new Date().toISOString() })
        .eq("id", 1);
    }

    const agora = Math.floor(Date.now() / 1000);
    const quinzeDias = 15 * 24 * 60 * 60;

    const listaPedidos: any = await chamarShopee(
      "/api/v2/order/get_order_list",
      token,
      shopId,
      {
        time_range_field: "create_time",
        time_from: String(agora - quinzeDias),
        time_to: String(agora),
        page_size: "20",
      },
    );

    if (listaPedidos.error && listaPedidos.error !== "") {
      console.error("erro no get_order_list", {
        error: listaPedidos.error,
        message: listaPedidos.message,
      });
      return responder({
        ok: false,
        etapa: "get_order_list",
        erro: listaPedidos.error,
        mensagem: listaPedidos.message,
        loja: nomeLoja,
      }, 400);
    }

    const listaSn: string[] = (listaPedidos.response?.order_list ?? [])
      .map((p: { order_sn: string }) => p.order_sn);

    let detalhes: unknown[] = [];

    if (listaSn.length > 0) {
      const retornoDetalhe: any = await chamarShopee(
        "/api/v2/order/get_order_detail",
        token,
        shopId,
        {
          order_sn_list: listaSn.join(","),
          response_optional_fields:
            "buyer_username,total_amount,item_list,pay_time,actual_shipping_fee",
        },
      );

      if (retornoDetalhe.error && retornoDetalhe.error !== "") {
        console.error("erro no get_order_detail", {
          error: retornoDetalhe.error,
          message: retornoDetalhe.message,
        });
      } else {
        detalhes = (retornoDetalhe.response?.order_list ?? []).map(
          (p: Record<string, unknown>) => ({
            order_sn: p.order_sn,
            status: p.order_status,
            valor_total: p.total_amount,
            moeda: p.currency,
            comprador: p.buyer_username,
            criado_em: p.create_time,
            qtd_itens: Array.isArray(p.item_list) ? p.item_list.length : 0,
          }),
        );
      }
    }

    return responder({
      ok: true,
      loja: {
        shop_id: shopId,
        nome: nomeLoja,
        regiao: infoLoja.region ?? null,
        status: infoLoja.status ?? null,
      },
      pedidos: {
        janela: "ultimos 15 dias",
        encontrados: listaSn.length,
        tem_mais_paginas: listaPedidos.response?.more ?? false,
        amostra: detalhes,
      },
    });
  } catch (erro) {
    console.error("erro no teste-api", String(erro));
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/teste-api")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: corsHeaders }),
      GET: handler,
      POST: handler,
    },
  },
});