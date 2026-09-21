import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { listarLojasAtivas } from "@/lib/lojas.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sincronizarLoja(lojaId: number, acao: string) {
  if (acao === "contatos") {
    const { sincronizarContatos } = await import("@/lib/pos-venda.server");
    return { loja_id: lojaId, ...(await sincronizarContatos(20, 50, lojaId)) };
  }
  const { processarFila } = await import("@/lib/pos-venda.server");
  return { loja_id: lojaId, ...(await processarFila(lojaId)) };
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  try {
    const acao = new URL(request.url).searchParams.get("acao") ?? "fila";

    const lojas = await listarLojasAtivas();
    if (lojas.length === 0) {
      return responder({ ok: false, erro: "nenhuma loja ativa cadastrada" }, 400);
    }

    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await sincronizarLoja(loja.id, acao));
    }

    return responder({ ok: resultados.every((r) => r.ok), lojas: resultados });
  } catch (erro) {
    console.error("erro no pos-venda", String(erro));
    const detalhe = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
    return responder({ ok: false, erro: "erro interno", detalhe: detalhe.slice(0, 400) }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/pos-venda")({
  server: {
    handlers: { GET: handler, POST: handler },
  },
});
