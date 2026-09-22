import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shopee/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { refreshTokenIfNeeded } = await import("@/lib/shopee-sync.server");
        const { obterLojaPadraoId } = await import("@/lib/lojas.server");
        const lojaId = await obterLojaPadraoId();
        if (!lojaId) return Response.json({ ok: false, error: "nenhuma loja cadastrada" });
        const result = await refreshTokenIfNeeded(lojaId);
        return Response.json(result);
      },
    },
  },
});
