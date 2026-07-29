import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shopee/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = Object.fromEntries(request.headers.entries());
        console.log("[shopee-webhook]", { method: request.method, headers });
        return Response.json({ ok: true, rota: "webhook" }, { status: 200 });
      },
      GET: async ({ request }) => {
        const headers = Object.fromEntries(request.headers.entries());
        console.log("[shopee-webhook]", { method: request.method, headers });
        return Response.json({ ok: true, rota: "webhook" }, { status: 200 });
      },
    },
  },
});