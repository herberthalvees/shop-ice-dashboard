import { createFileRoute } from '@tanstack/react-router';
import { checkCronSecret } from '@/lib/cron-auth.server';
import { credenciais } from '@/lib/shopee-credenciais.server';

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hmacSha256Hex(chave: string, mensagem: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function chamarShopee(
  path: string,
  accessToken: string,
  shopId: number,
  query: Record<string, string> = {},
) {
  // credenciais do app de Ads (SHOPEE_ADS_PARTNER_ID / SHOPEE_ADS_PARTNER_KEY)
  const { partnerId, partnerKey, apiBase } = credenciais('ads');
  if (!partnerId || !partnerKey || !apiBase) throw new Error('credenciais Shopee Ads ausentes');

  const timestamp = Math.floor(Date.now() / 1000);
  const stringBase = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  const sign = await hmacSha256Hex(partnerKey, stringBase);

  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign,
    ...query,
  });

  const resposta = await fetch(`${apiBase}${path}?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const texto = await resposta.text();
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  return { json, texto: texto.slice(0, 1000), status: resposta.status };
}

function dataDDMMYYYY(d: Date) {
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}-${mes}-${d.getUTCFullYear()}`;
}

function diaISO(unixSeg: number) {
  return new Date(unixSeg * 1000).toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type Registro = {
  campaign_id: number;
  nome: string | null;
  item_id: number | null;
  status: string | null;
  data: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  ctr: number | null;
  pedidos: number;
  receita: number;
  roas: number | null;
  bruto: unknown;
};

function acumular(mapa: Map<string, Registro>, base: Omit<Registro, 'ctr' | 'roas'>) {
  const chave = `${base.campaign_id}|${base.data}`;
  const atual = mapa.get(chave);
  if (atual) {
    atual.investimento += base.investimento;
    atual.impressoes += base.impressoes;
    atual.cliques += base.cliques;
    atual.pedidos += base.pedidos;
    atual.receita += base.receita;
    atual.nome = atual.nome ?? base.nome;
    atual.item_id = atual.item_id ?? base.item_id;
    atual.status = atual.status ?? base.status;
  } else {
    mapa.set(chave, { ...base, ctr: null, roas: null });
  }
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  const inicio = Date.now();
  const erros: string[] = [];
  const tentativas: Array<{ endpoint: string; erro: string | null; itens: number }> = [];
  let primeiroErroCru: string | null = null;

  function registrarErro(contexto: string, mensagem: string, cru?: string) {
    erros.push(`${contexto}: ${mensagem}`);
    tentativas.push({ endpoint: contexto, erro: mensagem, itens: 0 });
    if (primeiroErroCru === null && cru) primeiroErroCru = cru;
  }

  try {
    const url = new URL(request.url);
    const agora = Math.floor(Date.now() / 1000);
    const deParam = Number(url.searchParams.get('de'));
    const ateParam = Number(url.searchParams.get('ate'));

    const ate = ateParam > 0 ? ateParam : agora;
    const de = deParam > 0 ? deParam : ate - 24 * 60 * 60;

    if (!(de > 0) || !(ate > de)) {
      return responder({ ok: false, erro: 'intervalo invalido' }, 400);
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: conexao, error: erroConexao } = await supabaseAdmin
      .from('shopee_connection')
      .select('shop_id, access_token, token_expires_at')
      .eq('app_tipo', 'ads')
      .maybeSingle();

    if (erroConexao || !conexao?.access_token) {
      return responder({ ok: false, erro: 'app de Ads nao conectado' }, 400);
    }
    if (conexao.token_expires_at && new Date(conexao.token_expires_at as string) < new Date()) {
      return responder({ ok: false, erro: 'access_token do app de Ads expirado' }, 400);
    }

    const shopId = Number(conexao.shop_id);
    const token = conexao.access_token as string;

    const inicioStr = dataDDMMYYYY(new Date(de * 1000));
    const fimStr = dataDDMMYYYY(new Date(ate * 1000));

    const mapa = new Map<string, Registro>();
    let endpointUsado: string | null = null;

    // ---- Tentativa 1: performance horaria de todos os anuncios CPC (nivel loja) ----
    // Retorna uma linha por hora do dia; agregamos por dia em uma campanha
    // sintetica (campaign_id = 0) representando o total de Ads da loja.
    let itensT1 = 0;
    let erroT1: string | null = null;
    const UM_DIA = 24 * 60 * 60;
    for (let dia = de; dia <= ate; dia += UM_DIA) {
      const dataDia = dataDDMMYYYY(new Date(dia * 1000));
      const t1 = await chamarShopee(
        '/api/v2/ads/get_all_cpc_ads_hourly_performance',
        token,
        shopId,
        { performance_date: dataDia },
      );
      if (t1.json?.error) {
        erroT1 = String(t1.json.error);
        registrarErro('get_all_cpc_ads_hourly_performance', erroT1, t1.texto);
        break;
      }
      const lista: any[] = Array.isArray(t1.json?.response) ? t1.json.response : [];
      itensT1 += lista.length;
      for (const h of lista) {
        const [dd, mm, yyyy] = String(h.date ?? dataDia).split('-');
        acumular(mapa, {
          campaign_id: 0,
          nome: 'Shopee Ads (total da loja)',
          item_id: null,
          status: null,
          data: `${yyyy}-${mm}-${dd}T00:00:00Z`,
          investimento: num(h.expense),
          impressoes: num(h.impression),
          cliques: num(h.clicks ?? h.click),
          pedidos: num(h.broad_order ?? h.direct_order),
          receita: num(h.broad_gmv ?? h.direct_gmv),
          bruto: { fonte: 'hourly_performance', dia: dataDia },
        });
      }
    }
    if (!erroT1) {
      tentativas.push({
        endpoint: 'get_all_cpc_ads_hourly_performance',
        erro: null,
        itens: itensT1,
      });
      if (mapa.size > 0) endpointUsado = 'get_all_cpc_ads_hourly_performance';
    }

    // ---- Tentativa 2: toggle info + lista de campanhas (get_all_cid) ----
    if (!endpointUsado) {
      const toggle = await chamarShopee('/api/v2/ads/get_shop_toggle_info', token, shopId);
      if (toggle.json?.error) {
        registrarErro('get_shop_toggle_info', String(toggle.json.error), toggle.texto);
      }

      const cid = await chamarShopee('/api/v2/ads/get_all_cid', token, shopId, {
        start_date: inicioStr,
        end_date: fimStr,
      });
      if (cid.json?.error) {
        registrarErro('get_all_cid', String(cid.json.error), cid.texto);
      } else {
        const campanhas: any[] =
          cid.json?.response?.campaign_list ??
          cid.json?.response?.cid_list ??
          (Array.isArray(cid.json?.response) ? cid.json.response : []);
        for (const c of campanhas) {
          const campaignId = Number(c.campaign_id ?? c.cid ?? 0);
          if (!campaignId) continue;
          acumular(mapa, {
            campaign_id: campaignId,
            nome: c.campaign_name ?? c.ads_name ?? null,
            item_id: c.item_id != null ? Number(c.item_id) : null,
            status: c.campaign_status ?? c.state ?? null,
            data: `${diaISO(de)}T00:00:00Z`,
            investimento: num(c.expense ?? c.cost),
            impressoes: num(c.impression),
            cliques: num(c.click),
            pedidos: num(c.order),
            receita: num(c.gmv ?? c.broad_gmv),
            bruto: c,
          });
        }
        tentativas.push({ endpoint: 'get_all_cid', erro: null, itens: campanhas.length });
        if (mapa.size > 0) endpointUsado = 'get_all_cid';
      }
    }

    // ---- Tentativa 3: lista de palavras-chave recomendadas (diagnostico) ----
    if (!endpointUsado) {
      const kw = await chamarShopee(
        '/api/v2/ads/get_recommended_keyword_list',
        token,
        shopId,
        { item_id: '0' },
      );
      if (kw.json?.error) {
        registrarErro('get_recommended_keyword_list', String(kw.json.error), kw.texto);
      } else {
        endpointUsado = 'get_recommended_keyword_list (sem dados de performance)';
      }
    }

    // ---- Calcula derivados e grava ----
    const registros = Array.from(mapa.values()).map((r) => ({
      campaign_id: r.campaign_id,
      nome: r.nome,
      item_id: r.item_id,
      status: r.status,
      data: r.data,
      investimento: r.investimento,
      impressoes: r.impressoes,
      cliques: r.cliques,
      ctr: r.impressoes > 0 ? Number(((100 * r.cliques) / r.impressoes).toFixed(2)) : 0,
      pedidos: r.pedidos,
      receita: r.receita,
      roas: r.investimento > 0 ? Number((r.receita / r.investimento).toFixed(2)) : 0,
      payload_bruto: r.bruto,
    }));

    let gravadas = 0;
    for (let i = 0; i < registros.length; i += 200) {
      const lote = registros.slice(i, i + 200);
      const { data, error } = await supabaseAdmin.rpc('aplicar_ads' as any, { p_dados: lote });
      if (error) {
        registrarErro('aplicar_ads', error.message);
      } else {
        gravadas += Number(data ?? 0);
      }
    }

    console.log('sync-ads concluido', {
      endpoint_usado: endpointUsado,
      campanhas: registros.length,
      gravadas,
      erros: erros.length,
    });

    return responder({
      ok: Boolean(endpointUsado) && erros.length === 0,
      endpoint_usado: endpointUsado,
      periodo: { de, ate, inicio: inicioStr, fim: fimStr },
      campanhas_encontradas: registros.length,
      gravadas,
      duracao_ms: Date.now() - inicio,
      tentativas,
      erros: erros.slice(0, 20),
      primeiro_erro_cru: primeiroErroCru,
    });
  } catch (erro) {
    console.error('erro no sync-ads', String(erro));
    return responder(
      { ok: false, erro: 'erro interno', erros, duracao_ms: Date.now() - inicio },
      500,
    );
  }
}

export const Route = createFileRoute('/api/public/shopee/sync-ads')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
