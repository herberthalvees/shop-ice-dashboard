// Server-only: resolve e mantém válida a conexão Shopee de UMA loja
// específica (loja_id + app_tipo), em vez de assumir a loja "principal".
// `loja_id` ainda não está no types.ts gerado, daí o `as any` no client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { refreshAccessToken } from "./shopee.server";

const db = supabaseAdmin as any;

export type AppTipo = "principal" | "ads";

async function obterConexao(lojaId: number, appTipo: AppTipo) {
  const { data } = await db
    .from("shopee_connection")
    .select("*")
    .eq("loja_id", lojaId)
    .eq("app_tipo", appTipo)
    .maybeSingle();
  return data;
}

export async function renovarTokenSeNecessario(lojaId: number, appTipo: AppTipo = "principal") {
  const conn = await obterConexao(lojaId, appTipo);
  if (!conn?.refresh_token || !conn.shop_id) return { ok: false as const, error: "sem conexão" };

  const r = await refreshAccessToken(conn.refresh_token, Number(conn.shop_id), lojaId, appTipo);
  if (!r.access_token) {
    await db
      .from("shopee_connection")
      .update({ status: "expirada" })
      .eq("loja_id", lojaId)
      .eq("app_tipo", appTipo);
    return { ok: false as const, error: r.message ?? r.error ?? "falha ao renovar" };
  }

  const expiresAt = new Date(Date.now() + (r.expire_in ?? 3600) * 1000).toISOString();
  await db
    .from("shopee_connection")
    .update({
      access_token: r.access_token,
      refresh_token: r.refresh_token ?? conn.refresh_token,
      token_expires_at: expiresAt,
      status: "ativa",
    })
    .eq("loja_id", lojaId)
    .eq("app_tipo", appTipo);
  return { ok: true as const };
}

export type ConexaoValida = { access_token: string; shop_id: number };

export async function conexaoValida(
  lojaId: number,
  appTipo: AppTipo = "principal",
): Promise<{ ok: true; conn: ConexaoValida } | { ok: false; error: string }> {
  let conn = await obterConexao(lojaId, appTipo);
  if (!conn?.access_token || !conn.shop_id) {
    return { ok: false, error: "sem conexão ativa com a Shopee" };
  }
  if (
    !conn.token_expires_at ||
    new Date(conn.token_expires_at).getTime() <= Date.now() + 5 * 60_000
  ) {
    const r = await renovarTokenSeNecessario(lojaId, appTipo);
    if (!r.ok) return { ok: false, error: r.error };
    conn = await obterConexao(lojaId, appTipo);
    if (!conn?.access_token || !conn.shop_id)
      return { ok: false, error: "token renovado indisponível" };
  }
  return { ok: true, conn: { access_token: conn.access_token, shop_id: Number(conn.shop_id) } };
}
