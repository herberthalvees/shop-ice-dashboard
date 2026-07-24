// Server-only helpers para a API Shopee Open Platform.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SHOPEE_BASE = "https://partner.shopeemobile.com";

function partnerId(): string {
  const v = process.env.SHOPEE_PARTNER_ID;
  if (!v) throw new Error("SHOPEE_PARTNER_ID não configurado");
  return v;
}
function partnerKey(): string {
  const v = process.env.SHOPEE_PARTNER_KEY;
  if (!v) throw new Error("SHOPEE_PARTNER_KEY não configurado");
  return v;
}

function hmacHex(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

export function signPublic(path: string, timestamp: number): string {
  return hmacHex(partnerKey(), `${partnerId()}${path}${timestamp}`);
}

export function signShop(path: string, timestamp: number, accessToken: string, shopId: number | string): string {
  return hmacHex(partnerKey(), `${partnerId()}${path}${timestamp}${accessToken}${shopId}`);
}

export function getRedirectUri(origin: string): string {
  return `${origin}/api/public/shopee/callback`;
}

export function buildAuthUrl(origin: string): string {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signPublic(path, timestamp);
  const redirect = encodeURIComponent(getRedirectUri(origin));
  return `${SHOPEE_BASE}${path}?partner_id=${partnerId()}&timestamp=${timestamp}&sign=${sign}&redirect=${redirect}`;
}

export function verifyWebhookSignature(url: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = hmacHex(partnerKey(), `${url}|${body}`);
  const a = Buffer.from(header.trim().toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export async function exchangeCodeForToken(code: string, shopId: number) {
  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signPublic(path, timestamp);
  const url = `${SHOPEE_BASE}${path}?partner_id=${partnerId()}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, shop_id: shopId, partner_id: Number(partnerId()) }),
  });
  return (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expire_in?: number;
    error?: string;
    message?: string;
  };
}

export async function refreshAccessToken(refreshToken: string, shopId: number) {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signPublic(path, timestamp);
  const url = `${SHOPEE_BASE}${path}?partner_id=${partnerId()}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken, shop_id: shopId, partner_id: Number(partnerId()) }),
  });
  return (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expire_in?: number;
    error?: string;
    message?: string;
  };
}

function shopUrl(path: string, accessToken: string, shopId: number, extra: Record<string, string> = {}): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = signShop(path, timestamp, accessToken, shopId);
  const params = new URLSearchParams({
    partner_id: partnerId(),
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign,
    ...extra,
  });
  return `${SHOPEE_BASE}${path}?${params.toString()}`;
}

export async function getOrderList(accessToken: string, shopId: number, timeFromSec: number, timeToSec: number) {
  const path = "/api/v2/order/get_order_list";
  const url = shopUrl(path, accessToken, shopId, {
    time_range_field: "create_time",
    time_from: String(timeFromSec),
    time_to: String(timeToSec),
    page_size: "50",
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getOrderDetail(accessToken: string, shopId: number, orderSnList: string[]) {
  const path = "/api/v2/order/get_order_detail";
  const url = shopUrl(path, accessToken, shopId, {
    order_sn_list: orderSnList.join(","),
    response_optional_fields: "buyer_username,total_amount,order_status,item_list,create_time",
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getItemList(accessToken: string, shopId: number) {
  const path = "/api/v2/product/get_item_list";
  const url = shopUrl(path, accessToken, shopId, {
    offset: "0",
    page_size: "50",
    item_status: "NORMAL",
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getItemBaseInfo(accessToken: string, shopId: number, itemIds: number[]) {
  const path = "/api/v2/product/get_item_base_info";
  const url = shopUrl(path, accessToken, shopId, {
    item_id_list: itemIds.join(","),
  });
  const res = await fetch(url);
  return await res.json();
}