import { createFileRoute } from "@tanstack/react-router";
import { credenciaisLojaObrigatorias } from "@/lib/shopee-credenciais.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function redirecionar(origin: string, ok: boolean, erro?: string) {
  const destino = new URL("/lojas", origin);
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
          const lojaIdParam = url.searchParams.get("loja_id");
          const lojaId = lojaIdParam ? Number(lojaIdParam) : NaN;

          if (!code || !shopIdParam) {
            return redirecionar(url.origin, false, "parametros ausentes no retorno da Shopee");
          }
          if (!Number.isFinite(lojaId)) {
            return redirecionar(url.origin, false, "loja nao identificada no retorno da Shopee");
          }

          const { supabaseAdmin: supabaseAdminCheck } =
            await import("@/integrations/supabase/client.server");
          const { data: lojaExiste } = await supabaseAdminCheck
            .from("lojas" as any)
            .select("id")
            .eq("id", lojaId)
            .maybeSingle();
          if (!lojaExiste) {
            return redirecionar(url.origin, false, "loja nao encontrada");
          }

          const { partnerId, partnerKey, apiBase, faltando } = await credenciaisLojaObrigatorias(
            lojaId,
            "ads",
          );
          if (faltando.length > 0) {
            return redirecionar(url.origin, false, `credenciais ausentes: ${faltando.join(", ")}`);
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
            console.error("shopee ads recusou a troca do code", {
              error: dados.error,
              message: dados.message,
            });
            return redirecionar(url.origin, false, String(dados.message ?? dados.error));
          }
          if (!dados.access_token || !dados.refresh_token) {
            return redirecionar(url.origin, false, "resposta da Shopee sem tokens");
          }

          const segundos = Number(dados.expire_in ?? 14400);
          const expiraEm = new Date(Date.now() + segundos * 1000).toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const registro = {
            loja_id: lojaId,
            app_tipo: "ads",
            partner_id: Number(partnerId),
            shop_id: Number(shopIdParam),
            access_token: dados.access_token,
            refresh_token: dados.refresh_token,
            token_expires_at: expiraEm,
            status: "ativa",
            updated_at: new Date().toISOString(),
          };

          const { error: erroBanco } = await supabaseAdmin
            .from("shopee_connection" as any)
            .upsert(registro, { onConflict: "loja_id,app_tipo" });

          if (erroBanco) {
            console.error("falha ao gravar conexao ads", erroBanco.message);
            return redirecionar(url.origin, false, "falha ao gravar no banco");
          }

          return redirecionar(url.origin, true);
        } catch (erro) {
          console.error("erro no callback ads", String(erro));
          return responder({ ok: false, erro: "erro interno" }, 500);
        }
      },
    },
  },
});
