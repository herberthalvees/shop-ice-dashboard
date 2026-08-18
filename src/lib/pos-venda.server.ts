// Server-only: pós-venda (contatos alcançáveis, campanhas e fila de envio pelo chat da Shopee).
import { generateText } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { comRetry, enviarMensagem } from "./chat.server";
import { getConversationList } from "./shopee.server";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODELO = "openai/gpt-5.6-sol";
const CREDITOS_POR_1K_ENTRADA = 0.02;
const CREDITOS_POR_1K_SAIDA = 0.12;

function nanoParaIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e15 ? n / 1e6 : n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function paraNano(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e15) return String(Math.trunc(n));
  if (n > 1e12) return String(Math.trunc(n * 1e6));
  return String(Math.trunc(n * 1e9));
}

/** Varre a lista de conversas da Shopee (paginada) e guarda os contatos alcançáveis. */
export async function sincronizarContatos(paginas = 20, pageSize = 50) {
  let cursor: string | undefined;
  let gravados = 0;
  let lidos = 0;

  for (let i = 0; i < paginas; i++) {
    const r = await comRetry((c) =>
      getConversationList(c.access_token, c.shop_id, { pageSize, nextTimestampNano: cursor }),
    );
    if (!r.ok) return { ok: false as const, error: r.error, gravados, lidos };

    const lista = ((r.data as any)?.response?.conversations ?? []) as any[];
    if (lista.length === 0) break;
    lidos += lista.length;

    const linhas = lista
      .filter((c) => c.to_id)
      .map((c) => ({
        to_id: String(c.to_id),
        conversation_id: c.conversation_id ? String(c.conversation_id) : null,
        nome: c.to_name ?? null,
        comprador_username: c.to_name ?? null,
        ultima_em: nanoParaIso(c.last_message_timestamp),
        atualizado_em: new Date().toISOString(),
      }));

    if (linhas.length > 0) {
      const { error } = await supabaseAdmin.from("pv_contatos").upsert(linhas, { onConflict: "to_id" });
      if (error) return { ok: false as const, error: error.message, gravados, lidos };
      gravados += linhas.length;
    }

    const ultimo = lista[lista.length - 1];
    const proximo = paraNano(ultimo?.last_message_timestamp);
    if (!proximo || proximo === cursor) break;
    cursor = proximo;
    if (lista.length < pageSize) break;
  }

  return { ok: true as const, gravados, lidos };
}

type Cupom = {
  codigo: string | null;
  desconto: string | null;
  validade: string | null;
  pedido_minimo: number | null;
};

export function montarTexto(
  modelo: string,
  dados: { comprador?: string | null; produto?: string | null; cupom?: Cupom | null },
) {
  const validade = dados.cupom?.validade
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
        new Date(`${dados.cupom.validade}T12:00:00Z`),
      )
    : "";
  return modelo
    .replaceAll("{comprador}", (dados.comprador ?? "").trim())
    .replaceAll("{produto}", (dados.produto ?? "seu pedido").trim())
    .replaceAll("{cupom}", dados.cupom?.codigo ?? "")
    .replaceAll("{desconto}", dados.cupom?.desconto ?? "")
    .replaceAll("{validade}", validade)
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 800);
}

function sortear(variacoes: string[]) {
  const pool = variacoes.map((t) => t.trim()).filter(Boolean);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

async function enviadosHoje(campanhaId: string) {
  const inicio = new Date();
  inicio.setUTCHours(inicio.getUTCHours() - 3);
  inicio.setUTCHours(3, 0, 0, 0); // 00:00 BRT do dia corrente
  const { count } = await supabaseAdmin
    .from("pv_envios")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .eq("status", "enviado")
    .gte("enviado_em", inicio.toISOString());
  return count ?? 0;
}

/** Processa a fila das campanhas ativas respeitando ritmo e limite diário. */
export async function processarFila() {
  const agora = new Date().toISOString();
  const { data: campanhas, error } = await supabaseAdmin
    .from("pv_campanhas")
    .select("id, nome, status, ritmo, limite_diario, variacoes, agendada_para, cupom_id")
    .eq("status", "ativa")
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: error.message };

  const resultado: Array<{ campanha: string; enviados: number; erros: number; nota?: string }> = [];

  for (const c of campanhas ?? []) {
    if (c.agendada_para && c.agendada_para > agora) {
      resultado.push({ campanha: c.nome, enviados: 0, erros: 0, nota: "aguardando agendamento" });
      continue;
    }

    const variacoes = (c.variacoes ?? []) as string[];
    if (variacoes.length === 0) {
      resultado.push({ campanha: c.nome, enviados: 0, erros: 0, nota: "sem texto configurado" });
      continue;
    }

    const jaHoje = await enviadosHoje(c.id);
    const restanteDia = Math.max(0, Number(c.limite_diario ?? 0) - jaHoje);
    const lote = Math.max(0, Math.min(Number(c.ritmo ?? 0), restanteDia));
    if (lote === 0) {
      resultado.push({ campanha: c.nome, enviados: 0, erros: 0, nota: "limite diário atingido" });
      continue;
    }

    let cupom: Cupom | null = null;
    if (c.cupom_id) {
      const { data } = await supabaseAdmin
        .from("pv_cupons")
        .select("codigo, desconto, validade, pedido_minimo")
        .eq("id", c.cupom_id)
        .maybeSingle();
      cupom = (data as Cupom | null) ?? null;
    }

    const { data: pendentes } = await supabaseAdmin
      .from("pv_envios")
      .select("id, to_id, conversation_id, comprador, produto")
      .eq("campanha_id", c.id)
      .eq("status", "pendente")
      .limit(lote);

    let enviados = 0;
    let erros = 0;
    for (const e of pendentes ?? []) {
      const modelo = sortear(variacoes);
      if (!modelo) break;
      const texto = montarTexto(modelo, { comprador: e.comprador, produto: e.produto, cupom });
      const r = await enviarMensagem({
        toId: e.to_id,
        texto,
        conversationId: e.conversation_id ?? undefined,
        comprador: e.comprador ?? undefined,
      });
      await supabaseAdmin
        .from("pv_envios")
        .update({
          texto,
          status: r.ok ? "enviado" : "erro",
          erro: r.ok ? null : r.error,
          enviado_em: r.ok ? new Date().toISOString() : null,
        })
        .eq("id", e.id);
      if (r.ok) enviados++;
      else erros++;
      await new Promise((res) => setTimeout(res, 400));
    }

    const { count: sobrando } = await supabaseAdmin
      .from("pv_envios")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", c.id)
      .eq("status", "pendente");
    if ((sobrando ?? 0) === 0) {
      await supabaseAdmin
        .from("pv_campanhas")
        .update({ status: "concluida", updated_at: new Date().toISOString() })
        .eq("id", c.id);
    }

    resultado.push({ campanha: c.nome, enviados, erros });
  }

  return { ok: true as const, campanhas: resultado };
}

/** Envia uma mensagem de teste para um contato específico usando o texto da campanha. */
export async function enviarTeste(input: { toId: string; texto: string }) {
  return await enviarMensagem({ toId: input.toId, texto: input.texto.slice(0, 800) });
}

// ============ Envio individual (sub-aba Contatos) ============

export const REGRAS_MANUAL = {
  janelaDias: 30,
  limiteDia: 40,
  intervaloSegundos: 20,
  minCaracteres: 20,
  maxCaracteres: 800,
  semRepetirUltimos: 5,
} as const;

function inicioDoDiaBrt() {
  const agora = new Date();
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  const inicio = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0, 0);
  return new Date(inicio).toISOString();
}

function normalizar(t: string) {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Contadores das regras de envio individual (usados na tela e na validação). */
export async function statusManual() {
  const inicio = inicioDoDiaBrt();
  const { count } = await supabaseAdmin
    .from("pv_envios_manuais")
    .select("id", { count: "exact", head: true })
    .eq("ok", true)
    .gte("created_at", inicio);

  const { data: ultimos } = await supabaseAdmin
    .from("pv_envios_manuais")
    .select("texto, created_at")
    .eq("ok", true)
    .order("created_at", { ascending: false })
    .limit(REGRAS_MANUAL.semRepetirUltimos);

  const enviadosHoje = count ?? 0;
  const ultimoEnvioEm = ultimos?.[0]?.created_at ?? null;
  const esperaSegundos = ultimoEnvioEm
    ? Math.max(
        0,
        REGRAS_MANUAL.intervaloSegundos -
          Math.floor((Date.now() - new Date(ultimoEnvioEm).getTime()) / 1000),
      )
    : 0;

  return {
    ok: true as const,
    regras: REGRAS_MANUAL,
    enviadosHoje,
    restanteHoje: Math.max(0, REGRAS_MANUAL.limiteDia - enviadosHoje),
    ultimoEnvioEm,
    esperaSegundos,
    ultimosTextos: (ultimos ?? []).map((u) => u.texto),
  };
}

/** Envia uma mensagem individual aplicando automaticamente todas as regras de proteção. */
export async function enviarManual(input: {
  toId: string;
  texto: string;
  conversationId?: string | null;
  comprador?: string | null;
}) {
  const texto = input.texto.trim().slice(0, REGRAS_MANUAL.maxCaracteres);
  if (texto.length < REGRAS_MANUAL.minCaracteres) {
    return { ok: false as const, error: `A mensagem precisa ter ao menos ${REGRAS_MANUAL.minCaracteres} caracteres` };
  }

  const status = await statusManual();
  if (status.restanteHoje <= 0) {
    return { ok: false as const, error: `Limite diário de ${REGRAS_MANUAL.limiteDia} mensagens individuais atingido` };
  }
  if (status.esperaSegundos > 0) {
    return { ok: false as const, error: `Aguarde ${status.esperaSegundos}s entre envios para não parecer disparo em massa` };
  }
  if (status.ultimosTextos.some((t) => normalizar(t) === normalizar(texto))) {
    return {
      ok: false as const,
      error: `Esse texto é igual a um dos últimos ${REGRAS_MANUAL.semRepetirUltimos} enviados — varie a mensagem`,
    };
  }

  const comprador = (input.comprador ?? "").trim() || null;
  if (comprador) {
    const { data: bloqueio } = await supabaseAdmin
      .from("pv_optout")
      .select("comprador_username")
      .ilike("comprador_username", comprador)
      .maybeSingle();
    if (bloqueio) return { ok: false as const, error: "Cliente está na lista de opt-out" };
  }

  const limite = new Date(Date.now() - REGRAS_MANUAL.janelaDias * 86400_000).toISOString();
  const { count: manualRecente } = await supabaseAdmin
    .from("pv_envios_manuais")
    .select("id", { count: "exact", head: true })
    .eq("ok", true)
    .eq("to_id", input.toId)
    .gte("created_at", limite);
  if ((manualRecente ?? 0) > 0) {
    return {
      ok: false as const,
      error: `Este cliente já recebeu mensagem nos últimos ${REGRAS_MANUAL.janelaDias} dias`,
    };
  }
  if (comprador) {
    const { count: campanhaRecente } = await supabaseAdmin
      .from("pv_envios")
      .select("id", { count: "exact", head: true })
      .eq("status", "enviado")
      .ilike("comprador", comprador)
      .gte("enviado_em", limite);
    if ((campanhaRecente ?? 0) > 0) {
      return {
        ok: false as const,
        error: `Este cliente recebeu uma campanha nos últimos ${REGRAS_MANUAL.janelaDias} dias`,
      };
    }
  }

  const r = await enviarMensagem({
    toId: input.toId,
    texto,
    conversationId: input.conversationId ?? undefined,
    comprador: comprador ?? undefined,
  });

  await supabaseAdmin.from("pv_envios_manuais").insert({
    to_id: input.toId,
    conversation_id: input.conversationId ?? null,
    comprador,
    texto,
    ok: r.ok,
    erro: r.ok ? null : r.error,
  });

  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

/** Sugere variações de mensagem com IA, registrando o custo em ia_uso. */
export async function sugerirVariacoes(briefing: string, quantidade = 3) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false as const, error: "LOVABLE_API_KEY ausente" };

  const sistema = [
    "Você escreve mensagens curtas de pós-venda de uma loja brasileira da Shopee, enviadas pelo chat da plataforma.",
    "Tom simpático, direto, sem exageros e sem promessas que a loja não pode cumprir.",
    "Use no máximo 1 emoji, no máximo 400 caracteres por mensagem e nunca peça dados pessoais.",
    "Você pode usar as variáveis {comprador}, {produto}, {cupom}, {desconto} e {validade} — elas são trocadas pelos dados reais no envio.",
    `Devolva exatamente ${quantidade} variações, uma por linha, sem numeração, sem aspas e sem comentários.`,
  ].join("\n");

  try {
    const gateway = createLovableAiGatewayProvider(apiKey);
    const r = await generateText({ model: gateway(MODELO), system: sistema, prompt: briefing });

    const entrada = r.usage?.inputTokens ?? 0;
    const saida = r.usage?.outputTokens ?? 0;
    const raciocinio = (r.usage as { reasoningTokens?: number } | undefined)?.reasoningTokens ?? 0;
    const custo =
      (entrada / 1000) * CREDITOS_POR_1K_ENTRADA + (saida / 1000) * CREDITOS_POR_1K_SAIDA;
    const { error: erroUso } = await supabaseAdmin.from("ia_uso").insert({
      conversa_id: null,
      modelo: `${MODELO} · pós-venda`,
      tokens_entrada: entrada,
      tokens_saida: saida,
      tokens_raciocinio: raciocinio,
      passos: 1,
      custo_creditos: Number(custo.toFixed(6)),
    });
    if (erroUso) console.error("falha ao registrar uso ia (pós-venda)", erroUso.message);

    const variacoes = r.text
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").replace(/^["“]|["”]$/g, "").trim())
      .filter((l) => l.length > 10)
      .slice(0, quantidade);
    if (variacoes.length === 0) return { ok: false as const, error: "a IA não retornou texto" };
    return { ok: true as const, variacoes };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
