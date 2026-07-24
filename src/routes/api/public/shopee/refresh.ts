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
        const result = await refreshTokenIfNeeded();
        return Response.json(result);
      },
    },
  },
});