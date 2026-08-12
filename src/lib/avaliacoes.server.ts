// Server-only: avaliações da Shopee + geração de resposta pelo DreamAI.
import { generateText } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { comRetry } from "./chat.server";
import { getComments, replyComment } from "./shopee.server";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODELO = "openai/gpt-5.6-sol";
const CREDITOS_POR_1K_ENTRADA = 0.02;
const CREDITOS_POR_1K_SAIDA = 0.12;

function segParaIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e15 ? n / 1e6 : n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export type Avaliacao = {
  comment_id: number;
  order_sn: string | null;
  item_id: number | null;
  model_id: number | null;
  produto: string | null;
  comprador: string | null;
  rating: number | null;
  comentario: string | null;
  criado_em: string | null;
  resposta_shopee: string | null;
  respondida: boolean;
  resposta_gerada: string | null;
  status: string;
  erro: string | null;
  enviada_em: string | null;
};

/** Busca as avaliações na Shopee e grava/atualiza no banco. */
export async function sincronizarAvaliacoes(paginas = 3) {
  let cursor = "";
  let encontradas = 0;
  const novas: number[] = [];

  for (let i = 0; i < paginas; i++) {
    const cur = cursor;
    const r = await comRetry((c) => getComments(c.access_token, c.shop_id, { cursor: cur, pageSize: 50 }));
    if (!r.ok) return { ok: false as const, error: r.error };

    const resp = (r.data as any)?.response ?? {};
    const lista = (resp.item_comment_list ?? []) as any[];
    if (lista.length === 0) break;
    encontradas += lista.length;

    const itemIds = [...new Set(lista.map((c) => Number(c.item_id)).filter(Boolean))];
    const nomes = new Map<number, string>();
    if (itemIds.length) {
      const { data } = await supabaseAdmin
        .from("produtos")
        .select("item_id, produto")
        .in("item_id", itemIds);
      for (const p of data ?? []) if (p.produto) nomes.set(Number(p.item_id), p.produto);
    }

    const { data: existentes } = await supabaseAdmin
      .from("avaliacoes")
      .select("comment_id")
      .in("comment_id", lista.map((c) => Number(c.comment_id)));
    const jaTem = new Set((existentes ?? []).map((e) => Number(e.comment_id)));

    const linhas = lista.map((c) => {
      const respostaLoja =
        typeof c.comment_reply?.reply === "string" && c.comment_reply.reply.trim().length > 0
          ? String(c.comment_reply.reply)
          : null;
      const commentId = Number(c.comment_id);
      if (!jaTem.has(commentId) && !respostaLoja) novas.push(commentId);
      return {
        comment_id: commentId,
        order_sn: c.order_sn ? String(c.order_sn) : null,
        item_id: c.item_id ? Number(c.item_id) : null,
        model_id: c.model_id ? Number(c.model_id) : null,
        produto: nomes.get(Number(c.item_id)) ?? null,
        comprador: c.buyer_username ? String(c.buyer_username) : null,
        rating: c.rating_star ? Number(c.rating_star) : null,
        comentario: typeof c.comment === "string" ? c.comment : null,
        criado_em: segParaIso(c.create_time),
        resposta_shopee: respostaLoja,
        respondida: Boolean(respostaLoja),
        status: respostaLoja ? "respondida" : "pendente",
        payload: c as unknown,
      };
    });

    // Não sobrescreve o que já foi gerado/enviado por aqui.
    for (const l of linhas) {
      if (jaTem.has(l.comment_id)) {
        await supabaseAdmin
          .from("avaliacoes")
          .update({
            resposta_shopee: l.resposta_shopee,
            respondida: l.respondida,
            produto: l.produto,
            payload: l.payload as never,
            ...(l.respondida ? { status: "respondida" } : {}),
          })
          .eq("comment_id", l.comment_id);
      } else {
        await supabaseAdmin.from("avaliacoes").insert(l as never);
      }
    }

    const proximo = String(resp.next_cursor ?? "");
    if (!proximo || proximo === cursor) break;
    cursor = proximo;
    if (!resp.more) break;
  }

  return { ok: true as const, encontradas, novas: novas.length };
}

async function configAvaliacoes() {
  const { data } = await supabaseAdmin
    .from("config")
    .select("avaliacoes_auto_ativo, avaliacoes_prompt")
    .eq("id", 1)
    .maybeSingle();
  return {
    auto: Boolean(data?.avaliacoes_auto_ativo),
    prompt: data?.avaliacoes_prompt ?? "",
  };
}

async function exemplos(estrelas: number) {
  const { data } = await supabaseAdmin
    .from("avaliacoes_exemplos")
    .select("texto, estrelas")
    .eq("ativo", true)
    .in("estrelas", [estrelas]);
  return (data ?? []).map((e) => e.texto);
}

/** Escolhe uma resposta pronta da aba "Respostas de referência" (sem IA). */
export async function gerarRespostaAvaliacao(commentId: number) {
  const { data: av } = await supabaseAdmin
    .from("avaliacoes")
    .select("*")
    .eq("comment_id", commentId)
    .maybeSingle();
  if (!av) return { ok: false as const, error: "avaliação não encontrada" };

  const estrelas = Number(av.rating ?? 5);
  const modelos = (await exemplos(estrelas))
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length > 0);

  if (modelos.length === 0) {
    const erro = `sem respostas de referência cadastradas para ${estrelas} estrela(s)`;
    await supabaseAdmin
      .from("avaliacoes")
      .update({ status: "erro", erro })
      .eq("comment_id", commentId);
    return { ok: false as const, error: erro };
  }

  // Evita repetir os textos usados nas últimas respostas.
  const { data: recentes } = await supabaseAdmin
    .from("avaliacoes")
    .select("resposta_gerada")
    .not("resposta_gerada", "is", null)
    .order("enviada_em", { ascending: false })
    .limit(5);
  const usados = new Set((recentes ?? []).map((r) => (r.resposta_gerada ?? "").trim()));
  const disponiveis = modelos.filter((t) => !usados.has(t));
  const pool = disponiveis.length > 0 ? disponiveis : modelos;
  const texto = pool[Math.floor(Math.random() * pool.length)]!.slice(0, 500);

  await supabaseAdmin
    .from("avaliacoes")
    .update({ resposta_gerada: texto, status: "gerada", erro: null })
    .eq("comment_id", commentId);

  return { ok: true as const, texto };
}

/** Envia a resposta para a Shopee. */
export async function enviarRespostaAvaliacao(commentId: number, texto: string) {
  const corpo = texto.trim();
  if (!corpo) return { ok: false as const, error: "texto vazio" };

  const r = await comRetry((c) =>
    replyComment(c.access_token, c.shop_id, [{ comment_id: commentId, comment: corpo }]),
  );

  if (!r.ok) {
    await supabaseAdmin
      .from("avaliacoes")
      .update({ status: "erro", erro: r.error.slice(0, 400), resposta_gerada: corpo })
      .eq("comment_id", commentId);
    return { ok: false as const, error: r.error };
  }

  const falha = ((r.data as any)?.response?.result_list ?? []).find(
    (x: any) => x?.fail_error || x?.fail_message,
  );
  if (falha) {
    const erro = `${falha.fail_error ?? ""} ${falha.fail_message ?? ""}`.trim();
    await supabaseAdmin
      .from("avaliacoes")
      .update({ status: "erro", erro: erro.slice(0, 400), resposta_gerada: corpo })
      .eq("comment_id", commentId);
    return { ok: false as const, error: erro || "a Shopee recusou a resposta" };
  }

  await supabaseAdmin
    .from("avaliacoes")
    .update({
      resposta_gerada: corpo,
      resposta_shopee: corpo,
      respondida: true,
      status: "enviada",
      erro: null,
      enviada_em: new Date().toISOString(),
    })
    .eq("comment_id", commentId);

  return { ok: true as const };
}

/** Rotina do cron: sincroniza e responde automaticamente o que estiver pendente. */
export async function processarAvaliacoesAutomaticas(limite = 10, apenasGerar = false) {
  const sync = await sincronizarAvaliacoes(2);
  if (!sync.ok) return { ok: false as const, error: sync.error };

  const { auto } = await configAvaliacoes();
  if (!auto && !apenasGerar)
    return {
      ok: true as const,
      encontradas: sync.encontradas,
      novas: sync.novas,
      respondidas: 0,
      automatico: false,
      erros: [] as string[],
    };

  const { data: pendentes } = await supabaseAdmin
    .from("avaliacoes")
    .select("comment_id")
    .eq("respondida", false)
    .in("status", ["pendente", "gerada"])
    .order("criado_em", { ascending: false })
    .limit(limite);

  let respondidas = 0;
  const erros: string[] = [];
  for (const p of pendentes ?? []) {
    const id = Number(p.comment_id);
    const g = await gerarRespostaAvaliacao(id);
    if (!g.ok) {
      erros.push(`${id}: ${g.error}`);
      continue;
    }
    if (apenasGerar) {
      respondidas++;
      continue;
    }
    const e = await enviarRespostaAvaliacao(id, g.texto);
    if (e.ok) respondidas++;
    else erros.push(`${id}: ${e.error}`);
  }

  return {
    ok: true as const,
    encontradas: sync.encontradas,
    novas: sync.novas,
    respondidas,
    automatico: !apenasGerar,
    erros: erros.slice(0, 10),
  };
}
