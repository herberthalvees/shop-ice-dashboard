import { createFileRoute } from "@tanstack/react-router";
import { credenciaisObrigatorias } from "@/lib/shopee-credenciais.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
  const assinatura = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/shopee/callback-ads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: corsHeaders }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const code = url.searchParams.get("code");
          const shopIdParam = url.searchParams.get("shop_id");

          if (!code || !shopIdParam) {
            return responder({ ok: false, erro: "parametros ausentes", esperado: ["code", "shop_id"] }, 400);
          }

          const { partnerId, partnerKey, apiBase, faltando } = credenciaisObrigatorias("ads");
          if (faltando.length > 0) {
            return responder({ ok: false, erro: "secrets ausentes", faltando }, 500);
          }

          const path = "/api/v2/auth/token/get";
          const timestamp = Math.floor(Date.now() / 1000);
          const sign = await hmacSha256Hex(partnerKey!, `${partnerId}${path}${timestamp}`);

          const resposta = await fetch(
            `${apiBase}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code,
                shop_id: Number(shopIdParam),
                partner_id: Number(partnerId),
              }),
            },
          );

          const dados: any = await resposta.json();

          if (dados.error && dados.error !== "") {
            console.error("shopee ads recusou a troca do code", { error: dados.error, message: dados.message });
            return responder({ ok: false, erro: dados.error, mensagem: dados.message }, 400);
          }
          if (!dados.access_token || !dados.refresh_token) {
            return responder({ ok: false, erro: "resposta sem tokens" }, 500);
          }

          const segundos = Number(dados.expire_in ?? 14400);
          const expiraEm = new Date(Date.now() + segundos * 1000).toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const registro = {
            app_tipo: "ads",
            partner_id: Number(partnerId),
            shop_id: Number(shopIdParam),
            access_token: dados.access_token,
            refresh_token: dados.refresh_token,
            token_expires_at: expiraEm,
            status: "ativa",
            updated_at: new Date().toISOString(),
          };

          const { data: existente } = await supabaseAdmin
            .from("shopee_connection")
            .select("id")
            .eq("app_tipo", "ads")
            .maybeSingle();

          let erroBanco = null as { message: string } | null;
          if (existente) {
            const { error } = await supabaseAdmin
              .from("shopee_connection")
              .update(registro)
              .eq("id", existente.id);
            erroBanco = error;
          } else {
            const { data: maiores } = await supabaseAdmin
              .from("shopee_connection")
              .select("id")
              .order("id", { ascending: false })
              .limit(1);
            const novoId = (maiores?.[0]?.id ?? 0) + 1;
            const { error } = await supabaseAdmin
              .from("shopee_connection")
              .insert({ id: novoId, ...registro });
            erroBanco = error;
          }

          if (erroBanco) {
            console.error("falha ao gravar conexao ads", erroBanco.message);
            return responder({ ok: false, erro: "falha ao gravar no banco" }, 500);
          }

          return responder({
            ok: true,
            mensagem: "app de Ads conectado com sucesso",
            app_tipo: "ads",
            shop_id: Number(shopIdParam),
            token_expira_em: expiraEm,
          });
        } catch (erro) {
          console.error("erro no callback ads", String(erro));
          return responder({ ok: false, erro: "erro interno" }, 500);
        }
      },
    },
  },
});
