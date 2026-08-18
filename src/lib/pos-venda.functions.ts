import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FiltrosPublico = {
  data_de?: string | null;
  data_ate?: string | null;
  pedidos_min?: number | null;
  pedidos_max?: number | null;
  gasto_min?: number | null;
  ticket_min?: number | null;
  ticket_max?: number | null;
  inativo_dias?: number | null;
  avaliacao?: "positiva" | "negativa" | "sem" | null;
  sku?: string | null;
  janela_dias?: number | null;
};

export type AmostraPublico = {
  comprador: string | null;
  alcancavel: boolean;
  pedidos: number;
  total_gasto: number;
  ultimo_em: string | null;
  ultimo_produto: string | null;
};

export type PreviewPublico = {
  total: number;
  alcancaveis: number;
  amostra: AmostraPublico[];
};

export type ResultadoCampanha = {
  total: number;
  enviados: number;
  pendentes: number;
  erros: number;
  pedidos_pos: number;
  receita_pos: number;
};

function limparFiltros(f: unknown): Record<string, unknown> {
  const src = (f ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

function validarUuid(v: unknown) {
  const id = String(v ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("campanha inválida");
  }
  return id;
}

export const previewPublicoPosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { filtros: FiltrosPublico }) => ({ filtros: limparFiltros(data?.filtros) }))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pv_publico_preview", {
      _f: data.filtros as never,
    });
    if (error) throw new Error(error.message);
    return res as unknown as PreviewPublico;
  });

export const materializarPublicoPosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campanhaId: string }) => ({ campanhaId: validarUuid(data?.campanhaId) }))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pv_materializar_publico", {
      _campanha: data.campanhaId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, pendentes: Number(res ?? 0) };
  });

export const resultadoCampanhaPosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campanhaId: string }) => ({ campanhaId: validarUuid(data?.campanhaId) }))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pv_campanha_resultado", {
      _campanha: data.campanhaId,
    });
    if (error) throw new Error(error.message);
    return res as unknown as ResultadoCampanha;
  });

export const sincronizarContatosPosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sincronizarContatos } = await import("./pos-venda.server");
    return await sincronizarContatos();
  });

export const processarFilaPosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processarFila } = await import("./pos-venda.server");
    return await processarFila();
  });

export const enviarTestePosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { toId: string; texto: string }) => {
    const toId = String(data?.toId ?? "").trim();
    const texto = String(data?.texto ?? "").trim();
    if (!toId) throw new Error("contato inválido");
    if (texto.length < 1) throw new Error("texto vazio");
    return { toId, texto };
  })
  .handler(async ({ data }) => {
    const { enviarTeste } = await import("./pos-venda.server");
    return await enviarTeste(data);
  });

export const sugerirVariacoesPosVenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { briefing: string }) => {
    const briefing = String(data?.briefing ?? "").trim();
    if (briefing.length < 5) throw new Error("descreva a mensagem que você quer");
    return { briefing: briefing.slice(0, 600) };
  })
  .handler(async ({ data }) => {
    const { sugerirVariacoes } = await import("./pos-venda.server");
    return await sugerirVariacoes(data.briefing, 3);
  });
