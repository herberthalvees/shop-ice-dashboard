import { createFileRoute } from '@tanstack/react-router';
import { checkCronSecret } from '@/lib/cron-auth.server';

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TZ = 'America/Sao_Paulo';

function ontemSaoPaulo(): string {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  const [ano, mes, dia] = partes.split('-').map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function brl(valor: unknown): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(valor: unknown): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function dataExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!));
  const semana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'][d.getUTCDay()];
  const dd = String(dia).padStart(2, '0');
  const mm = String(mes).padStart(2, '0');
  return `${semana}, ${dd}/${mm}`;
}

async function executar(request: Request) {
  const negado = checkCronSecret(request);
  if (negado) return negado;

  const dataRef = ontemSaoPaulo();

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: cfg } = await supabaseAdmin
      .from('config')
      .select('webhook_whatsapp_url')
      .eq('id', 1)
      .maybeSingle();

    const webhook = cfg?.webhook_whatsapp_url?.trim();
    if (!webhook) {
      return responder({ ok: false, erro: 'webhook nao configurado' });
    }

    const { data: kpisRaw, error: erroKpis } = await supabaseAdmin.rpc('dashboard_kpis_periodo', {
      p_de: dataRef,
      p_ate: dataRef,
    } as never);

    if (erroKpis) {
      return responder({ ok: false, data_referencia: dataRef, enviado: false, erro: erroKpis.message });
    }

    const k = (Array.isArray(kpisRaw) ? kpisRaw[0] : kpisRaw) as Record<string, unknown> | null;
    if (!k) {
      return responder({ ok: false, data_referencia: dataRef, enviado: false, erro: 'sem dados para o periodo' });
    }

    let carteira: Record<string, unknown> | null = null;
    try {
      const { data: cRaw } = await supabaseAdmin.rpc('carteira_resumo', {
        p_de: dataRef,
        p_ate: dataRef,
      } as never);
      carteira = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as Record<string, unknown> | null;
    } catch {
      carteira = null;
    }

    const linhas = [
      `📊 *Resumo Dream Ice — ${dataExtenso(dataRef)}*`,
      '',
      `💰 Faturamento: R$ ${brl(k['faturamento'])}`,
      `📦 Vendas: ${Number(k['pedidos_validos'] ?? 0)} pedidos (${Number(k['unidades'] ?? 0)} unidades)`,
      `🎟️ Ticket medio: R$ ${brl(k['ticket_medio'])}`,
      `📉 Custos: R$ ${brl(k['custo_total'])} (${pct(k['custo_pct'])}%)`,
      `🏷️ Tarifas Shopee: R$ ${brl(k['taxas'])} (${pct(k['taxas_pct'])}%)`,
      `📢 Ads investido: R$ ${brl(k['ads_investimento'])} (${pct(k['ads_pct'])}%)`,
      `🧾 Impostos: R$ ${brl(k['imposto'])} (${pct(k['imposto_pct'])}%)`,
      `✅ Lucro (sem Ads): R$ ${brl(k['lucro_sem_ads'])} (${pct(k['lucro_sem_ads_pct'])}%)`,
      `✅ Lucro (com Ads): R$ ${brl(k['lucro_com_ads'])} (${pct(k['lucro_com_ads_pct'])}%)`,
      `❌ Cancelados: ${Number(k['pedidos_cancelados'] ?? 0)} (R$ ${brl(k['valor_cancelado'])})`,
      `↩️ Devolvidos: ${Number(k['pedidos_devolvidos'] ?? 0)} (R$ ${brl(k['valor_devolvido'])})`,
    ];

    if (carteira) {
      linhas.push('');
      linhas.push(`🏦 Entradas na carteira: R$ ${brl(carteira['entradas'])}`);
      linhas.push(`🚚 Em transito: R$ ${brl(carteira['em_transito'])}`);
    }

    const mensagem = linhas.join('\n');

    let enviado = false;
    let erro: string | null = null;

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'resumo_diario', mensagem, data: dataRef }),
      });
      enviado = res.ok;
      if (!res.ok) erro = `HTTP ${res.status}`;
    } catch (e) {
      erro = (e as Error).message;
    }

    await (supabaseAdmin.from('alertas_enviados') as any).upsert(
      {
        tipo: 'resumo_diario',
        chave: dataRef,
        enviado,
        erro,
        detalhe: { mensagem },
      },
      { onConflict: 'tipo,chave' },
    );

    console.log('resumo diario processado', { data_referencia: dataRef, enviado });

    return responder({ ok: enviado, data_referencia: dataRef, enviado, ...(erro ? { erro } : {}) });
  } catch (e) {
    console.error('erro no resumo diario', String(e));
    return responder(
      { ok: false, data_referencia: dataRef, enviado: false, erro: (e as Error).message },
      500,
    );
  }
}

export const Route = createFileRoute('/api/public/shopee/resumo-diario')({
  server: {
    handlers: {
      GET: async ({ request }) => executar(request),
      POST: async ({ request }) => executar(request),
    },
  },
});
