import { createFileRoute } from "@tanstack/react-router";

function redirecionar(origin: string, ok: boolean, erro?: string) {
  const destino = new URL("/configuracoes", origin);
  destino.searchParams.set("tiktok", ok ? "1" : "0");
  if (erro) destino.searchParams.set("erro", erro);
  return Response.redirect(destino.toString(), 302);
}

export const Route = createFileRoute("/api/public/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const authCode = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
          if (!authCode) return redirecionar(url.origin, false, "código de autorização ausente");

          const { credenciaisTiktok, trocarAuthCode, listarLojasAutorizadas } = await import(
            "@/lib/tiktok.server"
          );
          const { faltando } = credenciaisTiktok();
          if (faltando.length > 0) {
            return redirecionar(url.origin, false, `credenciais ausentes: ${faltando.join(", ")}`);
          }

          const r = await trocarAuthCode(authCode);
          const token = r.data?.access_token;
          if (!token) {
            console.error("[tiktok] troca do auth_code recusada", r.code, r.message);
            return redirecionar(url.origin, false, r.message ?? "TikTok recusou o código");
          }

          let shopId: string | null = null;
          let shopName: string | null = null;
          let shopCipher: string | null = null;
          try {
            const lojas = await listarLojasAutorizadas(token);
            const loja = lojas?.data?.shops?.[0];
            if (loja) {
              shopId = loja.id ? String(loja.id) : null;
              shopName = loja.name ?? null;
              shopCipher = loja.cipher ?? null;
            }
          } catch (e) {
            console.error("[tiktok] falha ao listar lojas", String(e));
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("tiktok_connection")
            .update({
              shop_id: shopId,
              shop_name: shopName,
              shop_cipher: shopCipher,
              seller_name: r.data?.seller_name ?? null,
              access_token: token,
              refresh_token: r.data?.refresh_token ?? null,
              token_expires_at: r.data?.access_token_expire_in
                ? new Date(r.data.access_token_expire_in * 1000).toISOString()
                : null,
              refresh_expires_at: r.data?.refresh_token_expire_in
                ? new Date(r.data.refresh_token_expire_in * 1000).toISOString()
                : null,
              status: "ativa",
              updated_at: new Date().toISOString(),
            })
            .eq("id", 1);

          if (error) {
            console.error("[tiktok] falha ao gravar conexão", error.message);
            return redirecionar(url.origin, false, "falha ao gravar no banco");
          }

          return redirecionar(url.origin, true);
        } catch (e) {
          console.error("[tiktok] erro no callback", String(e));
          return redirecionar(url.origin, false, "erro interno");
        }
      },
    },
  },
});