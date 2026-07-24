import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shopee/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const shopIdRaw = url.searchParams.get("shop_id");
        if (!code || !shopIdRaw) {
          return new Response("Parâmetros inválidos", { status: 400 });
        }
        const shopId = Number(shopIdRaw);
        const { exchangeCodeForToken } = await import("@/lib/shopee.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tok = await exchangeCodeForToken(code, shopId);
        if (!tok.access_token) {
          console.error("[shopee-callback] token error", tok);
          return Response.redirect(`${url.origin}/configuracoes?conectado=0`, 302);
        }
        const expiresAt = new Date(Date.now() + (tok.expire_in ?? 3600) * 1000).toISOString();
        await supabaseAdmin.from("shopee_connection").upsert({
          id: 1,
          shop_id: shopId,
          access_token: tok.access_token,
          refresh_token: tok.refresh_token ?? null,
          token_expires_at: expiresAt,
          status: "ativa",
        });
        return Response.redirect(`${url.origin}/configuracoes?conectado=1`, 302);
      },
    },
  },
});