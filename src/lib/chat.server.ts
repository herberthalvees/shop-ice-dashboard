// Server-only: acesso ao Seller Chat da Shopee com renovação automática de token.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getChatMessages,
  getConversationList,
  sendChatMessage,
} from "./shopee.server";
import { refreshTokenIfNeeded } from "./shopee-sync.server";

async function conexao() {
  const { data } = await supabaseAdmin
    .from("shopee_connection")
    .select("*")
    .eq("app_tipo", "principal")
    .maybeSingle();
  return data;
}

type Conn = { access_token: string; shop_id: number };

async function conexaoValida(): Promise<{ ok: true; conn: Conn } | { ok: false; error: string }> {
  let conn = await conexao();
  if (!conn?.access_token || !conn.shop_id) return { ok: false, error: "sem conexão ativa com a Shopee" };
  if (!conn.token_expires_at || new Date(conn.token_expires_at).getTime() <= Date.now() + 5 * 60_000) {
    const r = await refreshTokenIfNeeded();
    if (!r.ok) return { ok: false, error: r.error ?? "falha ao renovar token" };
    conn = await conexao();
    if (!conn?.access_token || !conn.shop_id) return { ok: false, error: "token renovado indisponível" };
  }
  return { ok: true, conn: { access_token: conn.access_token, shop_id: Number(conn.shop_id) } };
}

function ehTokenInvalido(r: any) {
  return `${r?.error ?? ""}`.toLowerCase().includes("access_token");
}

async function comRetry<T>(fn: (c: Conn) => Promise<T>) {
  const base = await conexaoValida();
  if (!base.ok) return { ok: false as const, error: base.error };
  let res: any = await fn(base.conn);
  if (ehTokenInvalido(res)) {
    const r = await refreshTokenIfNeeded();
    if (!r.ok) return { ok: false as const, error: r.error ?? "falha ao renovar token" };
    const novo = await conexaoValida();
    if (!novo.ok) return { ok: false as const, error: novo.error };
    res = await fn(novo.conn);
  }
  if (res?.error) return { ok: false as const, error: `${res.error}: ${res.message ?? ""}`.trim() };
  return { ok: true as const, data: res as T };
}

export type Conversa = {
  conversation_id: string;
  to_id: string;
  to_name: string;
  to_avatar: string | null;
  ultima_mensagem: string;
  nao_lidas: number;
  ultima_em: string | null;
};

function nanoParaIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // A Shopee retorna timestamps em segundos ou nanossegundos dependendo do campo.
  const ms = n > 1e15 ? n / 1e6 : n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export async function listarConversas() {
  const r = await comRetry((c) => getConversationList(c.access_token, c.shop_id, { pageSize: 25 }));
  if (!r.ok) return r;
  const lista = ((r.data as any)?.response?.conversations ?? []) as any[];
  const conversas: Conversa[] = lista.map((c) => ({
    conversation_id: String(c.conversation_id ?? ""),
    to_id: String(c.to_id ?? ""),
    to_name: c.to_name ?? "Comprador",
    to_avatar: c.to_avatar ?? null,
    ultima_mensagem:
      typeof c.latest_message_content?.text === "string"
        ? c.latest_message_content.text
        : c.latest_message_type
          ? `[${c.latest_message_type}]`
          : "",
    nao_lidas: Number(c.unread_count ?? 0),
    ultima_em: nanoParaIso(c.last_message_timestamp),
  }));
  return { ok: true as const, conversas };
}

export type Mensagem = {
  id: string;
  de_loja: boolean;
  texto: string;
  tipo: string;
  em: string | null;
};

export async function listarMensagens(conversationId: string) {
  const r = await comRetry((c) => getChatMessages(c.access_token, c.shop_id, conversationId, 40));
  if (!r.ok) return r;
  const brutas = ((r.data as any)?.response?.messages ?? []) as any[];
  const mensagens: Mensagem[] = brutas
    .map((m) => ({
      id: String(m.message_id ?? ""),
      de_loja: m.from_shop_id != null && Number(m.from_shop_id) > 0,
      texto:
        typeof m.content?.text === "string"
          ? m.content.text
          : m.message_type
            ? `[${m.message_type}]`
            : "",
      tipo: String(m.message_type ?? "text"),
      em: nanoParaIso(m.created_timestamp),
    }))
    .sort((a, b) => (a.em ?? "").localeCompare(b.em ?? ""));
  return { ok: true as const, mensagens };
}

export async function enviarMensagem(input: {
  toId: string;
  texto: string;
  conversationId?: string;
  comprador?: string;
}) {
  const r = await comRetry((c) => sendChatMessage(c.access_token, c.shop_id, input.toId, input.texto));
  await supabaseAdmin.from("chat_envios").insert({
    conversation_id: input.conversationId ?? null,
    to_id: input.toId,
    comprador: input.comprador ?? null,
    texto: input.texto,
    ok: r.ok,
    erro: r.ok ? null : r.error,
  });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}
