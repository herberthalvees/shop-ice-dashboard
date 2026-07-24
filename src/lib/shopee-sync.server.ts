import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getOrderList,
  getOrderDetail,
  getItemList,
  getItemBaseInfo,
  refreshAccessToken,
} from "./shopee.server";

async function getConnection() {
  const { data } = await supabaseAdmin.from("shopee_connection").select("*").eq("id", 1).maybeSingle();
  return data;
}

export async function refreshTokenIfNeeded() {
  const conn = await getConnection();
  if (!conn?.refresh_token || !conn.shop_id) return { ok: false, error: "sem conexão" };
  const r = await refreshAccessToken(conn.refresh_token, Number(conn.shop_id));
  if (!r.access_token) {
    await supabaseAdmin.from("shopee_connection").update({ status: "expirada" }).eq("id", 1);
    return { ok: false, error: r.message ?? r.error ?? "falha ao renovar" };
  }
  const expiresAt = new Date(Date.now() + (r.expire_in ?? 3600) * 1000).toISOString();
  await supabaseAdmin.from("shopee_connection").update({
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? conn.refresh_token,
    token_expires_at: expiresAt,
    status: "ativa",
  }).eq("id", 1);
  return { ok: true };
}

export async function runSync() {
  const conn = await getConnection();
  if (!conn?.access_token || !conn.shop_id) return { ok: false, error: "sem conexão ativa" };
  const now = Math.floor(Date.now() / 1000);
  const from = now - 24 * 3600;
  const shopId = Number(conn.shop_id);

  let ordersImported = 0;
  try {
    const list = (await getOrderList(conn.access_token, shopId, from, now)) as any;
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

  let productsImported = 0;
  try {
    const list = (await getItemList(conn.access_token, shopId)) as any;
    const itemIds: number[] = (list?.response?.item ?? []).map((i: any) => i.item_id).filter(Boolean);
    for (let i = 0; i < itemIds.length; i += 50) {
      const chunk = itemIds.slice(i, i + 50);
      const info = (await getItemBaseInfo(conn.access_token, shopId, chunk)) as any;
      const items = info?.response?.item_list ?? [];
      for (const it of items) {
        const price = it.price_info?.[0]?.current_price ?? it.price_info?.[0]?.original_price ?? 0;
        const stock =
          it.stock_info_v2?.summary_info?.total_available_stock ??
          it.stock_info?.[0]?.current_stock ??
          0;
        await supabaseAdmin.from("produtos").upsert(
          {
            item_id: it.item_id,
            nome: it.item_name,
            sku: it.item_sku,
            preco: Number(price),
            estoque: Number(stock),
            status: it.item_status,
          },
          { onConflict: "item_id" },
        );
        productsImported++;
      }
    }
  } catch (e) {
    console.error("[sync] produtos", e);
  }

  return { ok: true, pedidos: ordersImported, produtos: productsImported };
}