// Server-only: cliente da TikTok Shop Partner API (Open API v2, versões 202309+).
// Assinatura HMAC-SHA256 conforme https://partner.tiktokshop.com/docv2/page/sign-your-api-request

export const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";
export const TIKTOK_AUTH_BASE = "https://auth.tiktok-shops.com";
export const TIKTOK_AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";

export function credenciaisTiktok() {
  const appKey = process.env.TIKTOK_SHOP_APP_KEY;
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET;
  const serviceId = process.env.TIKTOK_SHOP_SERVICE_ID;
  const faltando: string[] = [];
  if (!appKey) faltando.push("TIKTOK_SHOP_APP_KEY");
  if (!appSecret) faltando.push("TIKTOK_SHOP_APP_SECRET");
  if (!serviceId) faltando.push("TIKTOK_SHOP_SERVICE_ID");
  return { appKey, appSecret, serviceId, faltando };
}

async function hmacSha256Hex(chave: string, mensagem: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Assinatura TikTok Shop:
 * 1. params (exceto sign e access_token) ordenados alfabeticamente -> "{chave}{valor}"
 * 2. prefixa o path da requisição
 * 3. concatena o body cru (quando não é multipart)
 * 4. envolve com o app_secret nas duas pontas
 * 5. HMAC-SHA256 usando o app_secret como chave
 */
export async function assinarTiktok(
  path: string,
  params: Record<string, string>,
  corpoCru: string,
  appSecret: string,
): Promise<string> {
  const chaves = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  let base = path;
  for (const k of chaves) base += `${k}${params[k]}`;
  base += corpoCru;
  return await hmacSha256Hex(appSecret, `${appSecret}${base}${appSecret}`);
}

export function urlAutorizacaoTiktok(state?: string): string {
  const { serviceId } = credenciaisTiktok();
  const params = new URLSearchParams({ service_id: String(serviceId) });
  if (state) params.set("state", state);
  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

type RespostaToken = {
  code?: number;
  message?: string;
  data?: {
    access_token?: string;
    access_token_expire_in?: number;
    refresh_token?: string;
    refresh_token_expire_in?: number;
    seller_name?: string;
  };
};

export async function trocarAuthCode(authCode: string): Promise<RespostaToken> {
  const { appKey, appSecret } = credenciaisTiktok();
  const url =
    `${TIKTOK_AUTH_BASE}/api/v2/token/get` +
    `?app_key=${encodeURIComponent(String(appKey))}` +
    `&app_secret=${encodeURIComponent(String(appSecret))}` +
    `&auth_code=${encodeURIComponent(authCode)}` +
    `&grant_type=authorized_code`;
  const res = await fetch(url);
  return (await res.json()) as RespostaToken;
}

export async function renovarTokenTiktok(refreshToken: string): Promise<RespostaToken> {
  const { appKey, appSecret } = credenciaisTiktok();
  const url =
    `${TIKTOK_AUTH_BASE}/api/v2/token/refresh` +
    `?app_key=${encodeURIComponent(String(appKey))}` +
    `&app_secret=${encodeURIComponent(String(appSecret))}` +
    `&refresh_token=${encodeURIComponent(refreshToken)}` +
    `&grant_type=refresh_token`;
  const res = await fetch(url);
  return (await res.json()) as RespostaToken;
}

/** Chamada genérica autenticada à Open API do TikTok Shop. */
export async function chamarTiktok(
  path: string,
  accessToken: string,
  opcoes: {
    metodo?: "GET" | "POST" | "PUT";
    query?: Record<string, string | number | undefined>;
    corpo?: unknown;
    shopCipher?: string | null;
  } = {},
): Promise<any> {
  const { appKey, appSecret } = credenciaisTiktok();
  if (!appKey || !appSecret) throw new Error("credenciais do TikTok Shop ausentes");

  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  if (opcoes.shopCipher) params.shop_cipher = opcoes.shopCipher;
  for (const [k, v] of Object.entries(opcoes.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params[k] = String(v);
  }

  const metodo = opcoes.metodo ?? "GET";
  const corpoCru = opcoes.corpo === undefined ? "" : JSON.stringify(opcoes.corpo);
  params.sign = await assinarTiktok(path, params, corpoCru, appSecret);

  const url = `${TIKTOK_API_BASE}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "x-tts-access-token": accessToken,
    },
    ...(corpoCru ? { body: corpoCru } : {}),
  });
  return await res.json();
}

/** Lojas autorizadas — devolve shop_id e o shop_cipher exigido nas demais chamadas. */
export async function listarLojasAutorizadas(accessToken: string) {
  return await chamarTiktok("/authorization/202309/shops", accessToken);
}

export async function buscarPedidosTiktok(
  accessToken: string,
  shopCipher: string,
  filtro: { criadoDe: number; criadoAte: number; pageToken?: string; pageSize?: number },
) {
  return await chamarTiktok("/order/202309/orders/search", accessToken, {
    metodo: "POST",
    shopCipher,
    query: {
      page_size: filtro.pageSize ?? 50,
      page_token: filtro.pageToken,
      sort_field: "create_time",
      sort_order: "DESC",
    },
    corpo: {
      create_time_ge: filtro.criadoDe,
      create_time_lt: filtro.criadoAte,
    },
  });
}

export async function detalharPedidosTiktok(
  accessToken: string,
  shopCipher: string,
  ids: string[],
) {
  return await chamarTiktok("/order/202309/orders", accessToken, {
    shopCipher,
    query: { ids: ids.join(",") },
  });
}

export async function buscarProdutosTiktok(
  accessToken: string,
  shopCipher: string,
  opcoes: { pageToken?: string; pageSize?: number } = {},
) {
  return await chamarTiktok("/product/202309/products/search", accessToken, {
    metodo: "POST",
    shopCipher,
    query: { page_size: opcoes.pageSize ?? 50, page_token: opcoes.pageToken },
    corpo: { status: "ALL" },
  });
}

export async function detalharProdutoTiktok(
  accessToken: string,
  shopCipher: string,
  productId: string,
) {
  return await chamarTiktok(`/product/202309/products/${productId}`, accessToken, {
    shopCipher,
  });
}

/** Repasses (settlements) por pedido — base do valor líquido e das taxas. */
export async function buscarStatementsTiktok(
  accessToken: string,
  shopCipher: string,
  opcoes: { pageToken?: string; pageSize?: number; statementTimeGe?: number; statementTimeLt?: number } = {},
) {
  return await chamarTiktok("/finance/202309/statements", accessToken, {
    shopCipher,
    query: {
      page_size: opcoes.pageSize ?? 50,
      page_token: opcoes.pageToken,
      statement_time_ge: opcoes.statementTimeGe,
      statement_time_lt: opcoes.statementTimeLt,
      sort_field: "statement_time",
    },
  });
}

export async function buscarTransacoesStatement(
  accessToken: string,
  shopCipher: string,
  statementId: string,
  pageToken?: string,
) {
  return await chamarTiktok(
    `/finance/202309/statements/${statementId}/statement_transactions`,
    accessToken,
    { shopCipher, query: { page_size: 100, page_token: pageToken } },
  );
}