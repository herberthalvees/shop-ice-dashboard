// ---------------------------------------------------------------
// Gera o link de autorizacao da Shopee Open Platform
// Rota publica (sem JWT) - temporaria para testes via curl
// ---------------------------------------------------------------
import { createFileRoute } from "@tanstack/react-router";
import { credenciaisObrigatorias } from "@/lib/shopee-credenciais.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const assinatura = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function handler({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(request.url);
    const appTipo = reqUrl.searchParams.get("app") === "ads" ? "ads" : "principal";
    const lojaIdParam = reqUrl.searchParams.get("loja_id");
    const lojaId = lojaIdParam ? Number(lojaIdParam) : NaN;

    if (!Number.isFinite(lojaId)) {
      return new Response(JSON.stringify({ ok: false, erro: "informe ?loja_id=<id da loja>" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lojaExiste } = await supabaseAdmin
      .from("lojas" as any)
      .select("id")
      .eq("id", lojaId)
      .maybeSingle();
    if (!lojaExiste) {
      return new Response(JSON.stringify({ ok: false, erro: "loja nao encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { partnerId, partnerKey, apiBase, faltando } = credenciaisObrigatorias(appTipo);

    const origem = reqUrl.origin;
    const redirectBase =
      appTipo === "ads"
        ? `${origem}/api/public/shopee/callback-ads`
        : (process.env.SHOPEE_REDIRECT_URL ?? `${origem}/api/public/shopee/callback`);
    const redirectUrlObj = new URL(redirectBase);
    redirectUrlObj.searchParams.set("loja_id", String(lojaId));
    const redirectUrl = redirectUrlObj.toString();

    if (faltando.length > 0) {
      return new Response(JSON.stringify({ ok: false, erro: "secrets ausentes", faltando }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      app_tipo: appTipo,
      timestamp,
      path,
      tamanho_sign: sign.length,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        app: appTipo,
        auth_url: authUrl,
        timestamp,
        validade_segundos: 300,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (erro) {
    console.error("falha ao gerar link", String(erro));
    return new Response(JSON.stringify({ ok: false, erro: "falha ao gerar link" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/shopee/auth-url")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      OPTIONS: handler,
    },
  },
});
