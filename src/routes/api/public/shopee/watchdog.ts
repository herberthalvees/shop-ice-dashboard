import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  const secret = process.env.CRON_SECRET;
  if (!secret) return responder({ ok: false, erro: "configuracao ausente" }, 500);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ultimoOk }, { data: conexoes }] = await Promise.all([
      supabaseAdmin
        .from("sync_log" as any)
        .select("created_at")
        .eq("ok", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("shopee_connection")
        .select("token_expires_at, status")
        .eq("app_tipo", "principal"),
    ]);

    const ultimaExecucao = (ultimoOk as { created_at?: string } | null)?.created_at;
    const minutosSemSucesso = ultimaExecucao
      ? (Date.now() - new Date(ultimaExecucao).getTime()) / 60_000
      : Number.POSITIVE_INFINITY;
    // Qualquer loja com o token perto de expirar ou desconectada já dispara a recuperação.
    const lista = (conexoes ?? []) as Array<{
      token_expires_at: string | null;
      status: string | null;
    }>;
    const precisaRecuperar =
      minutosSemSucesso >= 15 ||
      lista.length === 0 ||
      lista.some((c) => {
        const expiraEmMs = c.token_expires_at
          ? new Date(c.token_expires_at).getTime() - Date.now()
          : -1;
        return expiraEmMs <= 15 * 60_000 || c.status !== "ativa";
      });

    if (!precisaRecuperar) {
      return responder({
        ok: true,
        recuperacao: false,
        minutos_sem_sucesso: Math.floor(minutosSemSucesso),
      });
    }

    const origin = new URL(request.url).origin;
    const querySecret = encodeURIComponent(secret);
    const refresh = await fetch(
      `${origin}/api/public/shopee/refresh-token?forcar=1&s=${querySecret}`,
    );
    const refreshBody = await refresh.json().catch(() => null);
    if (!refresh.ok && refresh.status !== 207) {
      return responder(
        { ok: false, recuperacao: true, etapa: "refresh", resposta: refreshBody },
        502,
      );
    }

    const sync = await fetch(
      `${origin}/api/public/shopee/sync?dias=0.05&campo=update_time&s=${querySecret}`,
    );
    const syncBody = await sync.json().catch(() => null);
    return responder(
      {
        ok: sync.ok,
        recuperacao: true,
        minutos_sem_sucesso: Math.floor(minutosSemSucesso),
        sync: syncBody,
      },
      sync.ok ? 200 : 502,
    );
  } catch (erro) {
    console.error("watchdog shopee falhou", String(erro));
    return responder({ ok: false, erro: "falha no monitor de sincronizacao" }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/watchdog")({
  server: { handlers: { GET: handler, POST: handler } },
});
