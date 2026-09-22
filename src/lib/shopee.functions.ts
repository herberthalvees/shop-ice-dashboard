import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getShopeeAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { app?: string; lojaId?: number } | undefined) => ({
    app: data?.app === "ads" ? "ads" : "principal",
    lojaId: Number(data?.lojaId),
  }))
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.lojaId)) {
      throw new Error("loja inválida");
    }
    const { buildAuthUrl, originFromRequest } = await import("./shopee.server");
    return {
      url: await buildAuthUrl(originFromRequest(), data.app as "principal" | "ads", data.lojaId),
    };
  });

// Cada loja pode ter seu próprio app cadastrado na Shopee (CNPJs
// diferentes). Salva só partner_id/partner_key — nunca devolve a key de
// volta ao cliente depois.
export const salvarCredenciaisShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { lojaId: number; app?: string; partnerId: string; partnerKey: string }) => ({
      lojaId: Number(data.lojaId),
      app: data.app === "ads" ? "ads" : "principal",
      partnerId: data.partnerId.trim(),
      partnerKey: data.partnerKey.trim(),
    }),
  )
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.lojaId)) throw new Error("loja inválida");
    if (!data.partnerId || !data.partnerKey) throw new Error("informe partner id e partner key");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.from("shopee_connection").upsert(
      {
        loja_id: data.lojaId,
        app_tipo: data.app,
        partner_id: Number(data.partnerId),
        partner_key: data.partnerKey,
      },
      { onConflict: "loja_id,app_tipo" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Backfill de pedidos de UMA loja recém-conectada (o cron só sincroniza pra
// frente a partir de agora). Chama a própria rota /sync internamente com o
// CRON_SECRET do servidor — nunca expõe o secret pro navegador.
export const sincronizarPedidosHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { lojaId: number; dias?: number }) => ({
    lojaId: Number(data.lojaId),
    dias: Math.min(Math.max(Number(data.dias ?? 90), 1), 3650),
  }))
  .handler(async ({ data }) => {
    if (!Number.isFinite(data.lojaId)) throw new Error("loja inválida");

    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET não configurado");

    const { originFromRequest } = await import("./shopee.server");
    const agora = Math.floor(Date.now() / 1000);
    const de = agora - data.dias * 24 * 60 * 60;

    const url =
      `${originFromRequest()}/api/public/shopee/sync` +
      `?loja_id=${data.lojaId}&campo=create_time&de=${de}&ate=${agora}&s=${encodeURIComponent(secret)}`;

    const res = await fetch(url, { method: "POST" });
    const corpo = (await res.json()) as {
      ok: boolean;
      erro?: string;
      lojas?: Array<{ loja_id: number; ok: boolean; gravados?: number; erro?: string }>;
    };
    return corpo;
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
    const { obterLojaPadraoId } = await import("./lojas.server");
    const lojaId = await obterLojaPadraoId();
    if (!lojaId) return { ok: false, error: "nenhuma loja cadastrada" };
    return await refreshTokenIfNeeded(lojaId);
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

export const enviarResumoAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { data?: string } | undefined) => ({
    data:
      typeof data?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.data)
        ? data.data
        : undefined,
  }))
  .handler(async ({ data }) => {
    const { enviarResumoDiario, hojeSaoPaulo } = await import("./resumo-diario.server");
    return await enviarResumoDiario({
      dataRef: data.data ?? hojeSaoPaulo(),
      ignorarToggle: true,
    });
  });
