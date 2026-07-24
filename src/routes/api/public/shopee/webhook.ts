import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shopee/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const authHeader = request.headers.get("authorization");
        const url = request.url;
        const { verifyWebhookSignature } = await import("@/lib/shopee.server");
        if (!verifyWebhookSignature(url, raw, authHeader)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let payload: any = {};
        try { payload = JSON.parse(raw); } catch { /* keep {} */ }
        const codeMap: Record<number, string> = {
          3: "novo_pedido",
          4: "pedido_enviado",
          5: "pedido_cancelado",
        };
        const tipo = codeMap[payload?.code] ?? `code_${payload?.code ?? "desconhecido"}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: logRow } = await supabaseAdmin
          .from("eventos_log")
          .insert({ tipo_evento: tipo, payload })
          .select("id")
          .single();

        const order = payload?.data ?? {};
        const orderSn: string | undefined = order.ordersn ?? order.order_sn;
        if (orderSn) {
          await supabaseAdmin.from("pedidos").upsert(
            {
              order_sn: orderSn,
              status: order.status ?? order.order_status ?? null,
              valor_total: Number(order.total_amount ?? 0) || null,
              comprador_username: order.buyer_username ?? null,
              itens: order.items ?? order.item_list ?? null,
              payload_json: payload,
              data_criacao_pedido: order.create_time
                ? new Date(order.create_time * 1000).toISOString()
                : null,
            },
            { onConflict: "order_sn" },
          );
        }

        try {
          const { data: cfg } = await supabaseAdmin.from("config").select("*").eq("id", 1).maybeSingle();
          const eventos = (cfg?.eventos as Record<string, boolean> | null) ?? {};
          if (cfg?.notificacoes_ativas && cfg.webhook_whatsapp_url && eventos[tipo]) {
            const notifPayload = {
              evento: tipo,
              order_sn: orderSn ?? null,
              status: order.status ?? order.order_status ?? null,
              valor_total: Number(order.total_amount ?? 0) || null,
              comprador: order.buyer_username ?? null,
              itens: order.items ?? order.item_list ?? null,
              timestamp: new Date().toISOString(),
            };
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            try {
              const res = await fetch(cfg.webhook_whatsapp_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(notifPayload),
                signal: ctrl.signal,
              });
              await supabaseAdmin
                .from("eventos_log")
                .update({ notificado: res.ok, erro: res.ok ? null : `HTTP ${res.status}` })
                .eq("id", logRow!.id);
            } finally {
              clearTimeout(t);
            }
          }
        } catch (e) {
          await supabaseAdmin
            .from("eventos_log")
            .update({ notificado: false, erro: (e as Error).message })
            .eq("id", logRow!.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});