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
  const semana = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"][d.getUTCDay()];
  return `${semana}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

export function horaSaoPaulo(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export type ResultadoResumo = {
  ok: boolean;
  data_referencia: string;
  enviado: boolean;
  mensagem?: string;
  erro?: string;
};

export async function enviarResumoDiario(opts?: {
  dataRef?: string;
  ignorarToggle?: boolean;
  parcial?: boolean;
}): Promise<ResultadoResumo> {
  const parcial = !!opts?.parcial;
  const dataRef = opts?.dataRef ?? (parcial ? hojeSaoPaulo() : ontemSaoPaulo());
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      return { ok: false, data_referencia: dataRef, enviado: false, erro: "resumo diario desativado" };
    }
  }

  const { data: kpisRaw, error: erroKpis } = await supabaseAdmin.rpc("dashboard_kpis_periodo", {
    p_de: dataRef,
    p_ate: dataRef,
  } as never);
  if (erroKpis) {
    return { ok: false, data_referencia: dataRef, enviado: false, erro: erroKpis.message };
  }
  const k = (Array.isArray(kpisRaw) ? kpisRaw[0] : kpisRaw) as Record<string, unknown> | null;
  if (!k) {
    return { ok: false, data_referencia: dataRef, enviado: false, erro: "sem dados para o periodo" };
  }

  if (dataRef > hojeSaoPaulo()) {
    return {
      ok: false,
      data_referencia: dataRef,
      enviado: false,
      erro: "data no futuro — nao existem dados para essa data",
    };
  }

  const semMovimento =
    Number(k["pedidos_validos"] ?? 0) === 0 &&
    Number(k["pedidos_cancelados"] ?? 0) === 0 &&
    Number(k["faturamento"] ?? 0) === 0;
  if (semMovimento) {
    return {
      ok: false,
      data_referencia: dataRef,
      enviado: false,
      erro: "nenhum pedido registrado nessa data — resumo nao enviado para evitar valores zerados",
    };
  }

  let carteira: Record<string, unknown> | null = null;
  try {
    const { data: cRaw } = await supabaseAdmin.rpc("carteira_resumo", {
      p_de: dataRef,
      p_ate: dataRef,
    } as never);
    carteira = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as Record<string, unknown> | null;
  } catch {
    carteira = null;
  }

  const hora = horaSaoPaulo();
  const linhas = [
    parcial
      ? `⏱️ *Parcial Dream Ice — ${dataExtenso(dataRef)} às ${hora}*`
      : `📊 *Resumo Dream Ice — ${dataExtenso(dataRef)}*`,
    "",
    `💰 Faturamento: R$ ${brl(k["faturamento"])}`,
    `📦 Vendas: ${Number(k["pedidos_validos"] ?? 0)} pedidos (${Number(k["unidades"] ?? 0)} unidades)`,
    `🎟️ Ticket medio: R$ ${brl(k["ticket_medio"])}`,
    `📉 Custos: R$ ${brl(k["custo_total"])} (${pct(k["custo_pct"])}%)`,
    `🏷️ Tarifas Shopee: R$ ${brl(k["taxas"])} (${pct(k["taxas_pct"])}%)`,
    `📢 Ads investido: R$ ${brl(k["ads_investimento"])} (${pct(k["ads_pct"])}%)`,
    `🧾 Impostos: R$ ${brl(k["imposto"])} (${pct(k["imposto_pct"])}%)`,
    `✅ Lucro (sem Ads): R$ ${brl(k["lucro_sem_ads"])} (${pct(k["lucro_sem_ads_pct"])}%)`,
    `✅ Lucro (com Ads): R$ ${brl(k["lucro_com_ads"])} (${pct(k["lucro_com_ads_pct"])}%)`,
    `❌ Cancelados: ${Number(k["pedidos_cancelados"] ?? 0)} (R$ ${brl(k["valor_cancelado"])})`,
    `↩️ Devolvidos: ${Number(k["pedidos_devolvidos"] ?? 0)} (R$ ${brl(k["valor_devolvido"])})`,
  ];

  if (carteira) {
    linhas.push("");
    linhas.push(`🏦 Entradas na carteira: R$ ${brl(carteira["entradas"])}`);
    linhas.push(`🚚 Em transito: R$ ${brl(carteira["em_transito"])}`);
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

  await (supabaseAdmin.from("alertas_enviados") as any).upsert(
    {
      tipo: parcial ? "resumo_parcial" : "resumo_diario",
      chave: parcial ? `${dataRef} ${hora}` : dataRef,
      enviado,
      erro,
      detalhe: { mensagem, webhook: respostaWebhook },
    },
    { onConflict: "tipo,chave" },
  );

  return {
    ok: enviado,
    data_referencia: dataRef,
    enviado,
    mensagem,
    ...(erro ? { erro } : {}),
  };
}
