import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shopee/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = Object.fromEntries(request.headers.entries());
        console.log("[shopee-callback]", { method: request.method, headers });
        return Response.json({ ok: true, rota: "callback" }, { status: 200 });
      },
    },
  },
});