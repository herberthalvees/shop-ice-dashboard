import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { listarLojasAtivas } from "@/lib/lojas.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sincronizarLoja(
  lojaId: number,
  limite: number,
  apenasGerar: boolean,
  paginas: number,
) {
  const { processarAvaliacoesAutomaticas } = await import("@/lib/avaliacoes.server");
  const r = await processarAvaliacoesAutomaticas(limite, apenasGerar, lojaId, paginas);
  return { loja_id: lojaId, ...r };
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  try {
    const url = new URL(request.url);
    const apenasGerar = url.searchParams.get("gerar") === "1";
    const limite = apenasGerar ? 1 : 15;
    const paginas = Math.min(Number(url.searchParams.get("paginas") ?? "2"), 50);

    const lojas = await listarLojasAtivas();
    if (lojas.length === 0) {
      return responder({ ok: false, erro: "nenhuma loja ativa cadastrada" }, 400);
    }

    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await sincronizarLoja(loja.id, limite, apenasGerar, paginas));
    }

    return responder({ ok: resultados.every((r) => r.ok), lojas: resultados });
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
