import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getOrderList,
  getOrderDetail,
  refreshAccessToken,
} from "./shopee.server";

async function getConnection() {
  const { data } = await supabaseAdmin.from("shopee_connection").select("*").eq("app_tipo", "principal").maybeSingle();
  return data;
}

export async function refreshTokenIfNeeded() {
  const conn = await getConnection();
  if (!conn?.refresh_token || !conn.shop_id) return { ok: false, error: "sem conexão" };
  const r = await refreshAccessToken(conn.refresh_token, Number(conn.shop_id));
  if (!r.access_token) {
    await supabaseAdmin.from("shopee_connection").update({ status: "expirada" }).eq("app_tipo", "principal");
    return { ok: false, error: r.message ?? r.error ?? "falha ao renovar" };
  }
  const expiresAt = new Date(Date.now() + (r.expire_in ?? 3600) * 1000).toISOString();
  await supabaseAdmin.from("shopee_connection").update({
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? conn.refresh_token,
    token_expires_at: expiresAt,
    status: "ativa",
  }).eq("app_tipo", "principal");
  return { ok: true };
}

export async function runSync() {
  let conn = await getConnection();
  if (!conn?.access_token || !conn.shop_id) return { ok: false, error: "sem conexão ativa" };
  if (!conn.token_expires_at || new Date(conn.token_expires_at).getTime() <= Date.now() + 5 * 60_000) {
    const refresh = await refreshTokenIfNeeded();
    if (!refresh.ok) return refresh;
    conn = await getConnection();
    if (!conn?.access_token || !conn.shop_id) return { ok: false, error: "token renovado indisponível" };
  }
  const now = Math.floor(Date.now() / 1000);
  const from = now - 24 * 3600;
  const shopId = Number(conn.shop_id);

  let ordersImported = 0;
  try {
    let list = (await getOrderList(conn.access_token, shopId, from, now)) as any;
    const erroLista = `${list?.error ?? ''} ${list?.message ?? ''}`.toLowerCase();
    if (erroLista.includes("invalid_acceess_token") || erroLista.includes("invalid_access_token")) {
      const refresh = await refreshTokenIfNeeded();
      if (!refresh.ok) return refresh;
      conn = await getConnection();
      if (!conn?.access_token) return { ok: false, error: "token renovado indisponível" };
      list = (await getOrderList(conn.access_token, shopId, from, now)) as any;
    }
    const orderSns: string[] = (list?.response?.order_list ?? []).map((o: any) => o.order_sn).filter(Boolean);
    for (let i = 0; i < orderSns.length; i += 50) {
      const chunk = orderSns.slice(i, i + 50);
      const det = (await getOrderDetail(conn.access_token, shopId, chunk)) as any;
      const orders = det?.response?.order_list ?? [];
      for (const o of orders) {
        await supabaseAdmin.from("pedidos").upsert(
          {
            order_sn: o.order_sn,
            status: o.order_status,
            valor_total: Number(o.total_amount ?? 0),
            comprador_username: o.buyer_username,
            itens: o.item_list ?? [],
            payload_json: o,
            data_criacao_pedido: o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
          },
          { onConflict: "order_sn" },
        );
        ordersImported++;
      }
    }
  } catch (e) {
    console.error("[sync] pedidos", e);
  }

  // Sincronização de catálogo/estoque agora vive em /api/public/shopee/sync-produtos
  return { ok: true, pedidos: ordersImported };
}