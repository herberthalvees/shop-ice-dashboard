import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Só notifica mensagens recentes, para não disparar um monte de push na 1ª execução.
const JANELA_MS = 30 * 60_000;

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  try {
    const { listarConversas } = await import("@/lib/chat.server");
    const { notificarNovoChat } = await import("@/lib/push.server");

    const r = await listarConversas();
    if (!r.ok) return responder({ ok: false, erro: r.error }, 200);

    const agora = Date.now();
    let notificadas = 0;

    for (const c of r.conversas) {
      if (c.nao_lidas <= 0) continue;
      const em = c.ultima_em ? new Date(c.ultima_em).getTime() : 0;
      if (!em || agora - em > JANELA_MS) continue;

      const res = await notificarNovoChat({
        referencia: `${c.conversation_id}-${em}`,
        comprador: c.to_name,
        texto: c.ultima_mensagem,
      });
      if (res.ok) notificadas++;
    }

    return responder({ ok: true, conversas: r.conversas.length, notificadas });
  } catch (erro) {
    console.error("erro no sync-chat", String(erro));
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/sync-chat")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
