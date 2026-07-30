import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getShopeeAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { app?: string } | undefined) => ({
    app: data?.app === "ads" ? "ads" : "principal",
  }))
  .handler(async ({ data }) => {
    const { buildAuthUrl, originFromRequest } = await import("./shopee.server");
    return { url: buildAuthUrl(originFromRequest(), data.app) };
  });

export const runShopeeSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runSync } = await import("./shopee-sync.server");
    return await runSync();
  });

export const runShopeeRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { refreshTokenIfNeeded } = await import("./shopee-sync.server");
    return await refreshTokenIfNeeded();
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin.from("config").select("*").eq("id", 1).maybeSingle();
    if (!cfg?.webhook_whatsapp_url) return { ok: false, error: "URL do webhook não configurada" };
    const payload = {
      evento: "teste",
      order_sn: "TESTE-000",
      status: "TEST",
      valor_total: 0,
      comprador: "dream-ice",
      itens: [],
      timestamp: new Date().toISOString(),
    };
    try {
      const res = await fetch(cfg.webhook_whatsapp_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await supabaseAdmin.from("eventos_log").insert({
        tipo_evento: "teste",
        payload,
        notificado: res.ok,
        erro: res.ok ? null : `HTTP ${res.status}`,
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      await supabaseAdmin.from("eventos_log").insert({
        tipo_evento: "teste",
        payload,
        notificado: false,
        erro: (e as Error).message,
      });
      return { ok: false, error: (e as Error).message };
    }
  });