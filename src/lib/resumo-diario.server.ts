// Monta e envia o resumo diario para o webhook de WhatsApp. Server-only.
const TZ = "America/Sao_Paulo";

export function hojeSaoPaulo(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return partes;
}

export function ontemSaoPaulo(): string {
  const [ano, mes, dia] = hojeSaoPaulo().split("-").map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function brl(valor: unknown): string {
  return Number(valor ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(valor: unknown): string {
  return Number(valor ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function dataExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
  const semana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][
    d.getUTCDay()
  ];
  return `${semana}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

const LARGURA = 15;

function linha(rotulo: string, valor: string): string {
  const base = `${rotulo} `;
  const pontos = Math.max(1, LARGURA - base.length);
  return `${base}${".".repeat(pontos)} ${valor}`;
}

export function horaSaoPaulo(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export type ResultadoResumoLoja = {
  loja_id: number;
  loja_nome: string;
  ok: boolean;
  enviado: boolean;
  erro?: string;
};

export type ResultadoResumo = {
  ok: boolean;
  data_referencia: string;
  enviado: boolean;
  lojas?: ResultadoResumoLoja[];
  mensagem?: string;
  erro?: string;
};

async function enviarResumoLoja(opts: {
  dataRef: string;
  parcial: boolean;
  ignorarToggle?: boolean;
  webhook: string;
  lojaId: number;
  lojaNome: string;
  sufixoTitulo: string;
}): Promise<ResultadoResumoLoja & { mensagem?: string }> {
  const { dataRef, parcial, ignorarToggle, webhook, lojaId, lojaNome, sufixoTitulo } = opts;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const hora = horaSaoPaulo();
  const tipoAlerta = parcial ? "resumo_parcial" : "resumo_diario";
  const chaveAlerta = parcial ? `${dataRef} ${hora} loja${lojaId}` : `${dataRef} loja${lojaId}`;

  // Reivindica a chave antes de gastar tempo montando a mensagem: se essa
  // janela (mesma data+loja, ou mesma data+hora+loja no caso parcial) já foi
  // reivindicada por outra execução — reentrega da plataforma, corrida entre
  // duas invocações etc. — não manda de novo. `insert` (não upsert) porque a
  // unicidade de (tipo, chave) é o que garante o envio único. `ignorarToggle`
  // (envio manual/teste) pode sobrescrever uma janela já reivindicada.
  const { error: erroReivindicar } = await (supabaseAdmin.from("alertas_enviados") as any)[
    ignorarToggle ? "upsert" : "insert"
  ](
    { tipo: tipoAlerta, chave: chaveAlerta, loja_id: lojaId, enviado: false },
    ignorarToggle ? { onConflict: "tipo,chave" } : undefined,
  );
  if (erroReivindicar) {
    if (erroReivindicar.code === "23505") {
      return {
        loja_id: lojaId,
        loja_nome: lojaNome,
        ok: true,
        enviado: false,
        erro: "ja enviado para esta janela (idempotente)",
      };
    }
    console.error("falha ao reivindicar alerta de resumo", erroReivindicar.message);
  }

  const { data: kpisRaw, error: erroKpis } = await supabaseAdmin.rpc("dashboard_kpis_periodo", {
    p_de: dataRef,
    p_ate: dataRef,
    p_loja_id: lojaId,
  } as never);
  async function abortar(motivo: string) {
    await (supabaseAdmin.from("alertas_enviados") as any)
      .update({ erro: motivo })
      .eq("tipo", tipoAlerta)
      .eq("chave", chaveAlerta);
    return { loja_id: lojaId, loja_nome: lojaNome, ok: false, enviado: false, erro: motivo };
  }

  if (erroKpis) {
    return await abortar(erroKpis.message);
  }
  const k = (Array.isArray(kpisRaw) ? kpisRaw[0] : kpisRaw) as Record<string, unknown> | null;
  if (!k) {
    return await abortar("sem dados para o periodo");
  }

  const semMovimento =
    Number(k["pedidos_validos"] ?? 0) === 0 &&
    Number(k["pedidos_cancelados"] ?? 0) === 0 &&
    Number(k["faturamento"] ?? 0) === 0;
  if (semMovimento) {
    return await abortar(
      "nenhum pedido registrado nessa data — resumo nao enviado para evitar valores zerados",
    );
  }

  let carteira: Record<string, unknown> | null = null;
  try {
    const { data: cRaw } = await supabaseAdmin.rpc("carteira_resumo", {
      p_de: dataRef,
      p_ate: dataRef,
      p_loja_id: lojaId,
    } as never);
    carteira = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as Record<string, unknown> | null;
  } catch {
    carteira = null;
  }

  const pedidos = Number(k["pedidos_validos"] ?? 0);
  const cancelados = Number(k["pedidos_cancelados"] ?? 0);
  const devolvidos = Number(k["pedidos_devolvidos"] ?? 0);
  const lucroComAds = Number(k["lucro_com_ads"] ?? 0);
  const lucroPorPedido = pedidos > 0 ? lucroComAds / pedidos : 0;

  const linhas: string[] = parcial
    ? [`⏱️ *PARCIAL DREAM ICE${sufixoTitulo}* — ${dataCurta(dataRef)} às ${hora}`]
    : [`📊 *RESUMO DREAM ICE${sufixoTitulo}*`, `📅 ${dataExtenso(dataRef)}`];

  linhas.push(
    "",
    "*💰 VENDAS*",
    linha("Faturamento", `R$ ${brl(k["faturamento"])}`),
    linha("Pedidos", `${pedidos} (${Number(k["unidades"] ?? 0)} un.)`),
    linha("Ticket médio", `R$ ${brl(k["ticket_medio"])}`),
    "",
    "*📉 CUSTOS*",
    linha("Produtos", `R$ ${brl(k["custo_total"])} (${pct(k["custo_pct"])}%)`),
    linha("Tarifas Shopee", `R$ ${brl(k["taxas"])} (${pct(k["taxas_pct"])}%)`),
    linha("Ads", `R$ ${brl(k["ads_investimento"])} (${pct(k["ads_pct"])}%)`),
    linha("Impostos", `R$ ${brl(k["imposto"])} (${pct(k["imposto_pct"])}%)`),
    "",
    "*✅ LUCRO*",
    linha("Sem Ads", `R$ ${brl(k["lucro_sem_ads"])} (${pct(k["lucro_sem_ads_pct"])}%)`),
    linha("Com Ads", `R$ ${brl(lucroComAds)} (${pct(k["lucro_com_ads_pct"])}%)`),
    linha("Por pedido", `R$ ${brl(lucroPorPedido)}`),
  );

  if (cancelados > 0 || devolvidos > 0) {
    linhas.push("", "*⚠️ PERDAS*");
    if (cancelados > 0)
      linhas.push(linha("Cancelados", `${cancelados} (R$ ${brl(k["valor_cancelado"])})`));
    if (devolvidos > 0)
      linhas.push(linha("Devolvidos", `${devolvidos} (R$ ${brl(k["valor_devolvido"])})`));
  }

  if (
    carteira &&
    (Number(carteira["entradas"] ?? 0) !== 0 || Number(carteira["em_transito"] ?? 0) !== 0)
  ) {
    linhas.push(
      "",
      "*🏦 CARTEIRA*",
      linha("Entradas", `R$ ${brl(carteira["entradas"])}`),
      linha("Em trânsito", `R$ ${brl(carteira["em_transito"])}`),
    );
  }

  if (parcial) {
    linhas.push("", "_Dados parciais do dia em andamento_");
  }

  const mensagem = linhas.join("\n");

  let enviado = false;
  let erro: string | null = null;
  let respostaWebhook: { status?: number; corpo?: string } = {};
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento: "resumo_diario",
        tipo: "resumo_diario",
        parcial,
        mensagem,
        data: dataRef,
        data_referencia: dataRef,
      }),
    });
    const corpo = (await res.text()).slice(0, 2_000);
    respostaWebhook = { status: res.status, corpo };
    enviado = res.ok;
    if (!res.ok) erro = `Webhook respondeu HTTP ${res.status}${corpo ? `: ${corpo}` : ""}`;
  } catch (e) {
    erro = (e as Error).message;
  }

  await (supabaseAdmin.from("alertas_enviados") as any)
    .update({ enviado, erro, detalhe: { mensagem, webhook: respostaWebhook } })
    .eq("tipo", tipoAlerta)
    .eq("chave", chaveAlerta);

  return {
    loja_id: lojaId,
    loja_nome: lojaNome,
    ok: enviado,
    enviado,
    mensagem,
    ...(erro ? { erro } : {}),
  };
}

export async function enviarResumoDiario(opts?: {
  dataRef?: string;
  ignorarToggle?: boolean;
  parcial?: boolean;
}): Promise<ResultadoResumo> {
  const parcial = !!opts?.parcial;
  const dataRef = opts?.dataRef ?? (parcial ? hojeSaoPaulo() : ontemSaoPaulo());
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (dataRef > hojeSaoPaulo()) {
    return {
      ok: false,
      data_referencia: dataRef,
      enviado: false,
      erro: "data no futuro — nao existem dados para essa data",
    };
  }

  const { data: cfg } = await supabaseAdmin
    .from("config")
    .select("webhook_whatsapp_url, eventos, notificacoes_ativas")
    .eq("id", 1)
    .maybeSingle();

  const webhook = cfg?.webhook_whatsapp_url?.trim();
  if (!webhook) {
    return { ok: false, data_referencia: dataRef, enviado: false, erro: "webhook nao configurado" };
  }

  if (!opts?.ignorarToggle) {
    const eventos = (cfg?.eventos ?? {}) as Record<string, unknown>;
    const chaveEvento = parcial ? "resumo_parcial" : "resumo_diario";
    if (eventos[chaveEvento] === false) {
      return {
        ok: false,
        data_referencia: dataRef,
        enviado: false,
        erro: "resumo diario desativado",
      };
    }
  }

  const { listarLojasAtivas } = await import("./lojas.server");
  const lojas = await listarLojasAtivas();
  if (lojas.length === 0) {
    return { ok: false, data_referencia: dataRef, enviado: false, erro: "nenhuma loja cadastrada" };
  }

  const resultados = await Promise.all(
    lojas.map((loja) =>
      enviarResumoLoja({
        dataRef,
        parcial,
        ignorarToggle: opts?.ignorarToggle,
        webhook,
        lojaId: loja.id,
        lojaNome: loja.nome,
        sufixoTitulo: lojas.length > 1 ? ` — ${loja.nome}` : "",
      }),
    ),
  );

  return {
    ok: resultados.every((r) => r.ok),
    data_referencia: dataRef,
    enviado: resultados.some((r) => r.enviado),
    lojas: resultados.map(({ mensagem: _omitida, ...resto }) => resto),
  };
}
