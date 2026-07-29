// Credenciais por app da Shopee (principal ou ads). Server-only.
export type AppTipo = "principal" | "ads";

export function normalizarAppTipo(valor: unknown): AppTipo {
  return valor === "ads" ? "ads" : "principal";
}

export function credenciais(appTipo: string) {
  const ehAds = appTipo === "ads";
  const partnerId = process.env[ehAds ? "SHOPEE_ADS_PARTNER_ID" : "SHOPEE_PARTNER_ID"];
  const partnerKey = process.env[ehAds ? "SHOPEE_ADS_PARTNER_KEY" : "SHOPEE_PARTNER_KEY"];
  const apiBase = process.env.SHOPEE_API_BASE;
  return { partnerId, partnerKey, apiBase };
}

export function credenciaisObrigatorias(appTipo: string) {
  const c = credenciais(appTipo);
  const faltando: string[] = [];
  if (!c.partnerId) faltando.push(appTipo === "ads" ? "SHOPEE_ADS_PARTNER_ID" : "SHOPEE_PARTNER_ID");
  if (!c.partnerKey) faltando.push(appTipo === "ads" ? "SHOPEE_ADS_PARTNER_KEY" : "SHOPEE_PARTNER_KEY");
  if (!c.apiBase) faltando.push("SHOPEE_API_BASE");
  return { ...c, faltando };
}
