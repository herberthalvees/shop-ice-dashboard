import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler({ request }: { request: Request }) {
  const barrado = checkCronSecret(request);
  if (barrado) return barrado;
  const horas = Number(new URL(request.url).searchParams.get("horas") ?? 24);
  const { sincronizarPedidosTiktok } = await import("@/lib/tiktok-sync.server");
  const r = await sincronizarPedidosTiktok(Number.isFinite(horas) ? horas : 24);
  return responder(r, r.ok ? 200 : 500);
}

export const Route = createFileRoute("/api/public/tiktok/sync")({
  server: { handlers: { GET: handler, POST: handler } },
});