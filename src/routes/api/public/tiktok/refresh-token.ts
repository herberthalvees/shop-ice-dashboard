import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

async function handler({ request }: { request: Request }) {
  const barrado = checkCronSecret(request);
  if (barrado) return barrado;
  const { renovarSeNecessario } = await import("@/lib/tiktok-sync.server");
  const r = await renovarSeNecessario(true);
  return new Response(JSON.stringify(r, null, 2), {
    status: r.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/tiktok/refresh-token")({
  server: { handlers: { GET: handler, POST: handler } },
});