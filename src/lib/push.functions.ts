import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getVapidPublicKey } = await import("./push.server");
    const chave = getVapidPublicKey();
    return { publicKey: chave, configurado: Boolean(chave) };
  });

export const salvarDispositivoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; apelido?: string; userAgent?: string }) => {
    if (!data?.endpoint || !data.p256dh || !data.auth) throw new Error("assinatura inválida");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_dispositivos").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        apelido: data.apelido ?? null,
        user_agent: data.userAgent ?? null,
        ativo: true,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const removerDispositivoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint?: string; id?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("push_dispositivos").delete().eq("user_id", context.userId);
    if (data.id) q = q.eq("id", data.id);
    else if (data.endpoint) q = q.eq("endpoint", data.endpoint);
    else return { ok: false, error: "informe o dispositivo" };
    const { error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const enviarPushTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { enviarPush } = await import("./push.server");
    return await enviarPush({
      titulo: "Dream Ice · teste",
      corpo: "Se você está vendo isso, as notificações estão funcionando.",
      url: "/dashboard",
      tipo: "teste",
      tag: "teste",
    });
  });