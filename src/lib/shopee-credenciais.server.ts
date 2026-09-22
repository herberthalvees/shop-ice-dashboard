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
  if (!c.partnerId)
    faltando.push(appTipo === "ads" ? "SHOPEE_ADS_PARTNER_ID" : "SHOPEE_PARTNER_ID");
  if (!c.partnerKey)
    faltando.push(appTipo === "ads" ? "SHOPEE_ADS_PARTNER_KEY" : "SHOPEE_PARTNER_KEY");
  if (!c.apiBase) faltando.push("SHOPEE_API_BASE");
  return { ...c, faltando };
}

// Cada loja pode ter seu próprio app cadastrado na Shopee (CNPJs diferentes
// = apps diferentes). `shopee_connection.partner_id/partner_key` guardam a
// credencial daquela loja+app específicos; quando ainda não foram
// preenchidos (caso da loja histórica, conectada antes de existir
// multi-loja), cai para as variáveis de ambiente globais de sempre.
export async function credenciaisLoja(lojaId: number, appTipo: AppTipo) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("shopee_connection")
    .select("partner_id, partner_key")
    .eq("loja_id", lojaId)
    .eq("app_tipo", appTipo)
    .maybeSingle();

  const apiBase = process.env.SHOPEE_API_BASE;
  if (data?.partner_id && data?.partner_key) {
    return { partnerId: String(data.partner_id), partnerKey: data.partner_key as string, apiBase };
  }
  return credenciais(appTipo);
}

export async function credenciaisLojaObrigatorias(lojaId: number, appTipo: AppTipo) {
  const c = await credenciaisLoja(lojaId, appTipo);
  const faltando: string[] = [];
  if (!c.partnerId) faltando.push("partner_id (cadastre a credencial da loja em /lojas)");
  if (!c.partnerKey) faltando.push("partner_key (cadastre a credencial da loja em /lojas)");
  if (!c.apiBase) faltando.push("SHOPEE_API_BASE");
  return { ...c, faltando };
}

// Usado pelo webhook: a Shopee assina o push com o partner_key do app que
// autorizou aquela loja, e o payload só traz o shop_id (não o loja_id/app_tipo).
// Resolve a credencial certa a partir do shop_id; sem conexão conhecida para
// esse shop_id, cai para o app "principal" global (comportamento de antes).
export async function credenciaisPorShopId(shopId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("shopee_connection")
    .select("partner_key")
    .eq("shop_id", shopId)
    .not("partner_key", "is", null)
    .maybeSingle();
  if (data?.partner_key) return { partnerKey: data.partner_key as string };
  return { partnerKey: credenciais("principal").partnerKey };
}
