// ---------------------------------------------------------------
// Gera o link de autorizacao da Shopee Open Platform
// Rota publica (sem JWT) - temporaria para testes via curl
// ---------------------------------------------------------------
import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function handler({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const apiBase = process.env.SHOPEE_API_BASE;
    const redirectUrl = process.env.SHOPEE_REDIRECT_URL;

    const faltando: string[] = [];
    if (!partnerId) faltando.push("SHOPEE_PARTNER_ID");
    if (!partnerKey) faltando.push("SHOPEE_PARTNER_KEY");
    if (!apiBase) faltando.push("SHOPEE_API_BASE");
    if (!redirectUrl) faltando.push("SHOPEE_REDIRECT_URL");

    if (faltando.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, erro: "secrets ausentes", faltando }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);

    // ATENCAO: o redirect NAO entra na string base da assinatura
    const stringBase = `${partnerId}${path}${timestamp}`;
    const sign = await hmacSha256Hex(partnerKey!, stringBase);

    const authUrl =
      `${apiBase}${path}` +
      `?partner_id=${partnerId}` +
      `&timestamp=${timestamp}` +
      `&sign=${sign}` +
      `&redirect=${encodeURIComponent(redirectUrl!)}`;

    console.log("link de autorizacao gerado", {
      partner_id: partnerId,
      timestamp,
      path,
      tamanho_sign: sign.length,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        auth_url: authUrl,
        timestamp,
        validade_segundos: 300,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (erro) {
    console.error("falha ao gerar link", String(erro));
    return new Response(
      JSON.stringify({ ok: false, erro: "falha ao gerar link" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}

export const Route = createFileRoute("/api/public/shopee/auth-url")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      OPTIONS: handler,
    },
  },
});