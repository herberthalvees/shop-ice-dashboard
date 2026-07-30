import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function redirecionar(origin: string, ok: boolean, erro?: string) {
  const destino = new URL("/configuracoes", origin);
  destino.searchParams.set("conectado", ok ? "1" : "0");
  if (erro) destino.searchParams.set("erro", erro);
  return Response.redirect(destino.toString(), 302);
}

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
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

export const Route = createFileRoute("/api/public/shopee/callback")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: corsHeaders }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const code = url.searchParams.get("code");
          const shopIdParam = url.searchParams.get("shop_id");

          if (!code || !shopIdParam) {
            return redirecionar(url.origin, false, "parametros ausentes no retorno da Shopee");
          }

          const partnerId = process.env.SHOPEE_PARTNER_ID;
          const partnerKey = process.env.SHOPEE_PARTNER_KEY;
          const apiBase = process.env.SHOPEE_API_BASE;

          if (!partnerId || !partnerKey || !apiBase) {
            return redirecionar(url.origin, false, "credenciais da Shopee ausentes");
          }

          const path = "/api/v2/auth/token/get";
          const timestamp = Math.floor(Date.now() / 1000);
          const stringBase = `${partnerId}${path}${timestamp}`;
          const sign = await hmacSha256Hex(partnerKey, stringBase);

          const endpoint =
            `${apiBase}${path}` +
            `?partner_id=${partnerId}` +
            `&timestamp=${timestamp}` +
            `&sign=${sign}`;

          // ATENCAO: o code vai no corpo, nao na assinatura
          const resposta = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: code,
              shop_id: Number(shopIdParam),
              partner_id: Number(partnerId),
            }),
          });

          const dados: any = await resposta.json();

          if (dados.error && dados.error !== "") {
            console.error("shopee recusou a troca do code", {
              error: dados.error,
              message: dados.message,
            });
            return redirecionar(url.origin, false, String(dados.message ?? dados.error));
          }

          if (!dados.access_token || !dados.refresh_token) {
            console.error("resposta sem tokens", { chaves: Object.keys(dados) });
            return redirecionar(url.origin, false, "resposta da Shopee sem tokens");
          }

          const segundos = Number(dados.expire_in ?? 14400);
          const expiraEm = new Date(Date.now() + segundos * 1000).toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { error: erroBanco } = await supabaseAdmin
            .from("shopee_connection")
            .upsert({
              app_tipo: "principal",
              partner_id: Number(partnerId),
              shop_id: Number(shopIdParam),
              access_token: dados.access_token,
              refresh_token: dados.refresh_token,
              token_expires_at: expiraEm,
              status: "ativa",
              updated_at: new Date().toISOString(),
            }, { onConflict: "app_tipo" });

          if (erroBanco) {
            console.error("falha ao gravar conexao", erroBanco.message);
            return redirecionar(url.origin, false, "falha ao gravar no banco");
          }

          console.log("loja conectada", {
            shop_id: Number(shopIdParam),
            expira_em: expiraEm,
          });

          return redirecionar(url.origin, true);
        } catch (erro) {
          console.error("erro no callback", String(erro));
          return responder({ ok: false, erro: "erro interno" }, 500);
        }
      },
    },
  },
});