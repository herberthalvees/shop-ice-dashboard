import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function executar(request: Request) {
  const negado = checkCronSecret(request);
  if (negado) return negado;

  const { enviarResumoDiario, ontemSaoPaulo } = await import("@/lib/resumo-diario.server");
  const url = new URL(request.url);
  const dataParam = url.searchParams.get("data") ?? undefined;
  const forcar = url.searchParams.get("forcar") === "1";
  const parcial = url.searchParams.get("parcial") === "1";

  try {
    const r = await enviarResumoDiario({ dataRef: dataParam, ignorarToggle: forcar, parcial });
    const { mensagem: _omitida, ...resto } = r;
    console.log("resumo diario processado", {
      data_referencia: r.data_referencia,
      enviado: r.enviado,
    });
    return responder(resto);
  } catch (e) {
    console.error("erro no resumo diario", String(e));
    return responder(
      {
        ok: false,
        data_referencia: dataParam ?? ontemSaoPaulo(),
        enviado: false,
        erro: (e as Error).message,
      },
      500,
    );
  }
}

export const Route = createFileRoute("/api/public/shopee/resumo-diario")({
  server: {
    handlers: {
      GET: async ({ request }) => executar(request),
      POST: async ({ request }) => executar(request),
    },
  },
});
