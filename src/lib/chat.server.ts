// Server-only: acesso ao Seller Chat da Shopee com renovação automática de token.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChatMessages, getConversationList, sendChatMessage } from "./shopee.server";
import { conexaoValida, type ConexaoValida } from "./loja-conexao.server";
import { obterLojaPadraoId } from "./lojas.server";

async function resolverLojaId(lojaId?: number): Promise<number | null> {
  return lojaId ?? (await obterLojaPadraoId());
}

function ehTokenInvalido(r: any) {
  return `${r?.error ?? ""}`.toLowerCase().includes("access_token");
}

export async function comRetry<T>(
  fn: (c: ConexaoValida, lojaId: number) => Promise<T>,
  lojaId?: number,
) {
  const id = await resolverLojaId(lojaId);
  if (!id) return { ok: false as const, error: "nenhuma loja cadastrada" };

  const base = await conexaoValida(id, "principal");
  if (!base.ok) return { ok: false as const, error: base.error };
  let res: any = await fn(base.conn, id);
  if (ehTokenInvalido(res)) {
    const novo = await conexaoValida(id, "principal");
    if (!novo.ok) return { ok: false as const, error: novo.error };
    res = await fn(novo.conn, id);
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
  /** A última mensagem da conversa foi enviada pelo comprador (ou seja, ainda não respondida). */
  pendente: boolean;
};

function nanoParaIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // A Shopee retorna timestamps em segundos ou nanossegundos dependendo do campo.
  const ms = n > 1e15 ? n / 1e6 : n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export async function listarConversas(lojaId?: number) {
  const r = await comRetry(
    (c, id) => getConversationList(c.access_token, c.shop_id, id, { pageSize: 25 }),
    lojaId,
  );
  if (!r.ok) return r;
  const lista = ((r.data as any)?.response?.conversations ?? []) as any[];
  const conversas: Conversa[] = lista.map((c) => {
    const remetente =
      c.latest_message_from_id ?? c.last_message_from_id ?? c.latest_message_sender_id ?? null;
    const naoLidas = Number(c.unread_count ?? 0);
    const pendente =
      remetente !== null && remetente !== undefined
        ? String(remetente) === String(c.to_id ?? "")
        : naoLidas > 0;
    return {
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
      nao_lidas: naoLidas,
      ultima_em: nanoParaIso(c.last_message_timestamp),
      pendente,
    };
  });
  return { ok: true as const, conversas };
}

export type Mensagem = {
  id: string;
  de_loja: boolean;
  texto: string;
  tipo: string;
  em: string | null;
};

export async function listarMensagens(conversationId: string, buyerId?: string, lojaId?: number) {
  let shopId = 0;
  const r = await comRetry((c, id) => {
    shopId = c.shop_id;
    return getChatMessages(c.access_token, c.shop_id, id, conversationId, 40);
  }, lojaId);
  if (!r.ok) return r;
  const brutas = ((r.data as any)?.response?.messages ?? []) as any[];
  const comprador = String(buyerId ?? "").trim();
  const ehDoComprador = (m: any) => {
    const from = String(m.from_id ?? "");
    if (comprador && from) return from === comprador;
    // Sem o id do comprador: cai para o remetente diferente da loja.
    return !(from && Number(from) === shopId);
  };
  const mensagens: Mensagem[] = brutas
    .map((m) => ({
      id: String(m.message_id ?? ""),
      de_loja: !ehDoComprador(m),
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
  lojaId?: number;
}) {
  const lojaId = await resolverLojaId(input.lojaId);
  const r = await comRetry(
    (c, id) => sendChatMessage(c.access_token, c.shop_id, id, input.toId, input.texto),
    input.lojaId,
  );
  await supabaseAdmin.from("chat_envios").insert({
    loja_id: lojaId,
    conversation_id: input.conversationId ?? null,
    to_id: input.toId,
    comprador: input.comprador ?? null,
    texto: input.texto,
    ok: r.ok,
    erro: r.ok ? null : r.error,
  } as never);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}
