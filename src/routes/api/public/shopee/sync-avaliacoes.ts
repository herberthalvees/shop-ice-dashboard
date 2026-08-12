import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  try {
    const { processarAvaliacoesAutomaticas } = await import("@/lib/avaliacoes.server");
    const apenasGerar = new URL(request.url).searchParams.get("gerar") === "1";
    const r = await processarAvaliacoesAutomaticas(apenasGerar ? 1 : 15, apenasGerar);
    return responder(r, 200);
  } catch (erro) {
    console.error("erro no sync-avaliacoes", String(erro));
    const detalhe = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
    return responder({ ok: false, erro: "erro interno", detalhe: detalhe.slice(0, 400) }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/sync-avaliacoes")({
  server: {
    handlers: { GET: handler, POST: handler },
  },
});
