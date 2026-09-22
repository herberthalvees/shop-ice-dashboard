// Server-only helpers para a API Shopee Open Platform.
import { getRequestHeader } from "@tanstack/react-start/server";
import { credenciaisLoja, credenciaisPorShopId, type AppTipo } from "./shopee-credenciais.server";
import { comparacaoSegura, hmacSha256Hex } from "./hmac-sha256";

export const SHOPEE_BASE = "https://partner.shopeemobile.com";

// Cada loja pode ter seu próprio app cadastrado na Shopee (CNPJs diferentes),
// então partner_id/partner_key sempre são resolvidos por loja — nunca globais.
async function creds(lojaId: number, appTipo: AppTipo = "principal") {
  const c = await credenciaisLoja(lojaId, appTipo);
  if (!c.partnerId) throw new Error("partner id da Shopee não configurado para esta loja");
  if (!c.partnerKey) throw new Error("partner key da Shopee não configurada para esta loja");
  return { partnerId: c.partnerId, partnerKey: c.partnerKey };
}

function hmacHex(key: string, message: string): string {
  return hmacSha256Hex(key, message);
}

export async function signPublic(
  path: string,
  timestamp: number,
  lojaId: number,
  appTipo: AppTipo = "principal",
): Promise<{ sign: string; partnerId: string }> {
  const { partnerId, partnerKey } = await creds(lojaId, appTipo);
  return { sign: hmacHex(partnerKey, `${partnerId}${path}${timestamp}`), partnerId };
}

export async function signShop(
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: number | string,
  lojaId: number,
  appTipo: AppTipo = "principal",
): Promise<{ sign: string; partnerId: string }> {
  const { partnerId, partnerKey } = await creds(lojaId, appTipo);
  return {
    sign: hmacHex(partnerKey, `${partnerId}${path}${timestamp}${accessToken}${shopId}`),
    partnerId,
  };
}

export function getRedirectUri(
  origin: string,
  appTipo: string = "principal",
  lojaId?: number,
): string {
  // A Shopee valida o domínio do `redirect` contra o "Redirect URL Domain"
  // cadastrado no console do app — que é fixo por app (principal/ads) e não
  // muda conforme o domínio pelo qual o navegador acessou o painel (preview,
  // domínio customizado etc.). Por isso a origem vem, de preferência, de uma
  // variável de ambiente fixa; `origin` (derivado da requisição) só serve de
  // fallback para ambientes sem essa variável configurada (ex.: dev local).
  const origemFixa =
    appTipo === "ads" ? process.env.SHOPEE_ADS_REDIRECT_ORIGIN : process.env.SHOPEE_REDIRECT_ORIGIN;
  const origemBase = origemFixa || origin;
  const base =
    appTipo === "ads"
      ? `${origemBase}/api/public/shopee/callback-ads`
      : `${origemBase}/api/public/shopee/callback`;
  if (lojaId === undefined) return base;
  const url = new URL(base);
  url.searchParams.set("loja_id", String(lojaId));
  return url.toString();
}

export async function buildAuthUrl(
  origin: string,
  appTipo: AppTipo = "principal",
  lojaId: number,
): Promise<string> {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const { sign, partnerId } = await signPublic(path, timestamp, lojaId, appTipo);
  const redirect = encodeURIComponent(getRedirectUri(origin, appTipo, lojaId));
  return `${SHOPEE_BASE}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${redirect}`;
}

// A Shopee assina o push do webhook com o partner_key do app que autorizou
// aquela loja; o payload só traz o shop_id, daí resolver por ele em vez de
// receber loja_id/app_tipo prontos.
export async function verifyWebhookSignatureForShop(
  shopId: number,
  url: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  const { partnerKey } = await credenciaisPorShopId(shopId);
  if (!partnerKey) return false;
  const expected = hmacHex(partnerKey, `${url}|${body}`);
  return comparacaoSegura(header.trim().toLowerCase(), expected.toLowerCase());
}

export async function exchangeCodeForToken(code: string, shopId: number, lojaId: number) {
  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const { sign, partnerId } = await signPublic(path, timestamp, lojaId);
  const url = `${SHOPEE_BASE}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, shop_id: shopId, partner_id: Number(partnerId) }),
  });
  return (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expire_in?: number;
    error?: string;
    message?: string;
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  shopId: number,
  lojaId: number,
  appTipo: AppTipo = "principal",
) {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const { sign, partnerId } = await signPublic(path, timestamp, lojaId, appTipo);
  const url = `${SHOPEE_BASE}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: shopId,
      partner_id: Number(partnerId),
    }),
  });
  return (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expire_in?: number;
    error?: string;
    message?: string;
  };
}

async function shopUrl(
  path: string,
  accessToken: string,
  shopId: number,
  lojaId: number,
  extra: Record<string, string> = {},
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const { sign, partnerId } = await signShop(path, timestamp, accessToken, shopId, lojaId);
  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign,
    ...extra,
  });
  return `${SHOPEE_BASE}${path}?${params.toString()}`;
}

export async function getOrderList(
  accessToken: string,
  shopId: number,
  lojaId: number,
  timeFromSec: number,
  timeToSec: number,
) {
  const path = "/api/v2/order/get_order_list";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    time_range_field: "create_time",
    time_from: String(timeFromSec),
    time_to: String(timeToSec),
    page_size: "50",
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getOrderDetail(
  accessToken: string,
  shopId: number,
  lojaId: number,
  orderSnList: string[],
) {
  const path = "/api/v2/order/get_order_detail";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    order_sn_list: orderSnList.join(","),
    response_optional_fields: "buyer_username,total_amount,order_status,item_list,create_time",
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getItemList(accessToken: string, shopId: number, lojaId: number) {
  const path = "/api/v2/product/get_item_list";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    offset: "0",
    page_size: "50",
    item_status: "NORMAL",
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getItemBaseInfo(
  accessToken: string,
  shopId: number,
  lojaId: number,
  itemIds: number[],
) {
  const path = "/api/v2/product/get_item_base_info";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    item_id_list: itemIds.join(","),
  });
  const res = await fetch(url);
  return await res.json();
}
export function originFromRequest(): string {
  const forwardedProto = getRequestHeader("x-forwarded-proto");
  const forwardedHost = getRequestHeader("x-forwarded-host");
  const host = getRequestHeader("host");
  const proto = forwardedProto ?? "https";
  const h = forwardedHost ?? host;
  if (!h) throw new Error("Não foi possível determinar a origem da requisição");
  return `${proto}://${h}`;
}

// ---------- Seller Chat (sellerchat) ----------

export async function getConversationList(
  accessToken: string,
  shopId: number,
  lojaId: number,
  opts: { tipo?: string; pageSize?: number; nextTimestampNano?: string } = {},
) {
  const path = "/api/v2/sellerchat/get_conversation_list";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    type: opts.tipo ?? "all",
    // "older" = da mais recente para as antigas. Com "latest" a Shopee devolve
    // as conversas mais ANTIGAS primeiro (de 2025), escondendo as de hoje.
    direction: "older",
    page_size: String(opts.pageSize ?? 25),
    ...(opts.nextTimestampNano ? { next_timestamp_nano: opts.nextTimestampNano } : {}),
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getChatMessages(
  accessToken: string,
  shopId: number,
  lojaId: number,
  conversationId: string,
  pageSize = 30,
) {
  const path = "/api/v2/sellerchat/get_message";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    conversation_id: conversationId,
    page_size: String(pageSize),
  });
  const res = await fetch(url);
  return await res.json();
}

export async function getUnreadConversationCount(
  accessToken: string,
  shopId: number,
  lojaId: number,
) {
  const path = "/api/v2/sellerchat/get_unread_conversation_count";
  const url = await shopUrl(path, accessToken, shopId, lojaId);
  const res = await fetch(url);
  return await res.json();
}

export async function sendChatMessage(
  accessToken: string,
  shopId: number,
  lojaId: number,
  toId: string,
  texto: string,
) {
  const path = "/api/v2/sellerchat/send_message";
  const url = await shopUrl(path, accessToken, shopId, lojaId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_id: Number(toId),
      message_type: "text",
      content: { text: texto },
    }),
  });
  return await res.json();
}

// ---------- Avaliações (product comment) ----------

export async function getComments(
  accessToken: string,
  shopId: number,
  lojaId: number,
  opts: { cursor?: string; pageSize?: number } = {},
) {
  const path = "/api/v2/product/get_comment";
  const url = await shopUrl(path, accessToken, shopId, lojaId, {
    cursor: opts.cursor ?? "",
    page_size: String(opts.pageSize ?? 50),
  });
  const res = await fetch(url);
  return await res.json();
}

export async function replyComment(
  accessToken: string,
  shopId: number,
  lojaId: number,
  respostas: { comment_id: number; comment: string }[],
) {
  const path = "/api/v2/product/reply_comment";
  const url = await shopUrl(path, accessToken, shopId, lojaId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment_list: respostas }),
  });
  return await res.json();
}
