import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { credenciais } from "@/lib/shopee-credenciais.server";
import { listarLojasAtivas } from "@/lib/lojas.server";

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(chave: string, mensagem: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function chamarShopee(
  path: string,
  accessToken: string,
  shopId: number,
  query: Record<string, string> = {},
) {
  // credenciais do app de Ads (SHOPEE_ADS_PARTNER_ID / SHOPEE_ADS_PARTNER_KEY)
  const { partnerId, partnerKey, apiBase } = credenciais("ads");
  if (!partnerId || !partnerKey || !apiBase) throw new Error("credenciais Shopee Ads ausentes");

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
    method: "GET",
    headers: { "Content-Type": "application/json" },
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
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}-${mes}-${d.getUTCFullYear()}`;
}

function diaISO(unixSeg: number) {
  return new Date(unixSeg * 1000).toISOString().slice(0, 10);
}

function dataShopeeParaISO(valor: unknown, fallback: string) {
  const texto = String(valor ?? fallback);
  const partes = texto.split("-");
  if (partes.length === 3 && partes[0].length === 2) {
    return `${partes[2]}-${partes[1]}-${partes[0]}T00:00:00Z`;
  }
  return `${texto.slice(0, 10)}T00:00:00Z`;
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

function acumular(mapa: Map<string, Registro>, base: Omit<Registro, "ctr" | "roas">) {
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

// Sincroniza os anúncios (Ads) de UMA loja.
async function sincronizarLoja(
  lojaId: number,
  de: number,
  ate: number,
  inicioStr: string,
  fimStr: string,
) {
  const erros: string[] = [];
  const tentativas: Array<{ endpoint: string; erro: string | null; itens: number }> = [];
  let primeiroErroCru: string | null = null;

  function registrarErro(contexto: string, mensagem: string, cru?: string) {
    erros.push(`${contexto}: ${mensagem}`);
    tentativas.push({ endpoint: contexto, erro: mensagem, itens: 0 });
    if (primeiroErroCru === null && cru) primeiroErroCru = cru;
  }

  const { supabaseAdmin: supabaseAdminTyped } =
    await import("@/integrations/supabase/client.server");
  const supabaseAdmin = supabaseAdminTyped as any;

  const { data: conexao, error: erroConexao } = await supabaseAdmin
    .from("shopee_connection")
    .select("shop_id, access_token, token_expires_at")
    .eq("loja_id", lojaId)
    .eq("app_tipo", "ads")
    .maybeSingle();

  if (erroConexao || !conexao?.access_token) {
    return { loja_id: lojaId, ok: false, erro: "app de Ads nao conectado" };
  }
  if (conexao.token_expires_at && new Date(conexao.token_expires_at as string) < new Date()) {
    return { loja_id: lojaId, ok: false, erro: "access_token do app de Ads expirado" };
  }

  const shopId = Number(conexao.shop_id);
  const token = conexao.access_token as string;

  const mapa = new Map<string, Registro>();
  let endpointUsado: string | null = null;

  // ---- Tentativa 1: performance horaria de todos os anuncios CPC (nivel loja) ----
  let itensT1 = 0;
  let erroT1: string | null = null;
  const UM_DIA = 24 * 60 * 60;
  for (let dia = de; dia <= ate; dia += UM_DIA) {
    const dataDia = dataDDMMYYYY(new Date(dia * 1000));
    const t1 = await chamarShopee("/api/v2/ads/get_all_cpc_ads_hourly_performance", token, shopId, {
      performance_date: dataDia,
    });
    if (t1.json?.error) {
      erroT1 = String(t1.json.error);
      registrarErro("get_all_cpc_ads_hourly_performance", erroT1, t1.texto);
      break;
    }
    const lista: any[] = Array.isArray(t1.json?.response) ? t1.json.response : [];
    itensT1 += lista.length;
    for (const h of lista) {
      const [dd, mm, yyyy] = String(h.date ?? dataDia).split("-");
      acumular(mapa, {
        campaign_id: 0,
        nome: "Shopee Ads (total da loja)",
        item_id: null,
        status: null,
        data: `${yyyy}-${mm}-${dd}T00:00:00Z`,
        investimento: num(h.expense),
        impressoes: num(h.impression),
        cliques: num(h.clicks ?? h.click),
        pedidos: num(h.broad_order ?? h.direct_order),
        receita: num(h.broad_gmv ?? h.direct_gmv),
        bruto: { fonte: "hourly_performance", dia: dataDia },
      });
    }
  }
  if (!erroT1) {
    tentativas.push({ endpoint: "get_all_cpc_ads_hourly_performance", erro: null, itens: itensT1 });
    if (mapa.size > 0) endpointUsado = "get_all_cpc_ads_hourly_performance";
  }

  // ---- Performance por campanha de produto ----
  const campanhas: Array<{ campaign_id: number; ad_type: string | null }> = [];
  let offset = 0;
  const limite = 500;
  for (let pagina = 0; pagina < 100; pagina += 1) {
    const listaCampanhas = await chamarShopee(
      "/api/v2/ads/get_product_level_campaign_id_list",
      token,
      shopId,
      { ad_type: "all", offset: String(offset), limit: String(limite) },
    );
    if (listaCampanhas.json?.error) {
      registrarErro(
        "get_product_level_campaign_id_list",
        String(listaCampanhas.json.error),
        listaCampanhas.texto,
      );
      break;
    }
    const lote: any[] = listaCampanhas.json?.response?.campaign_list ?? [];
    for (const campanha of lote) {
      const campaignId = Number(campanha.campaign_id ?? 0);
      if (campaignId) {
        campanhas.push({ campaign_id: campaignId, ad_type: campanha.ad_type ?? null });
      }
    }
    if (!listaCampanhas.json?.response?.has_next_page || lote.length === 0) break;
    offset += lote.length;
  }
  tentativas.push({
    endpoint: "get_product_level_campaign_id_list",
    erro: null,
    itens: campanhas.length,
  });

  const itemPorCampanha = new Map<
    number,
    { item_id: number; nome: string | null; status: string | null }
  >();
  for (let i = 0; i < campanhas.length; i += 100) {
    const ids = campanhas
      .slice(i, i + 100)
      .map((c) => c.campaign_id)
      .join(",");
    if (!ids) continue;
    const configuracoes = await chamarShopee(
      "/api/v2/ads/get_product_level_campaign_setting_info",
      token,
      shopId,
      { info_type_list: "1,4", campaign_id_list: ids },
    );
    if (configuracoes.json?.error) {
      registrarErro(
        "get_product_level_campaign_setting_info",
        String(configuracoes.json.error),
        configuracoes.texto,
      );
      continue;
    }
    const lista: any[] = configuracoes.json?.response?.campaign_list ?? [];
    for (const configuracao of lista) {
      const campaignId = Number(configuracao.campaign_id ?? 0);
      const comum = configuracao.common_info ?? {};
      const autoProdutos: any[] = configuracao.auto_product_ads_info ?? [];
      const idsItens: unknown[] = Array.isArray(comum.item_id_list) ? comum.item_id_list : [];
      const itemId = Number(autoProdutos[0]?.item_id ?? idsItens[0] ?? 0);
      const quantidadeItens = autoProdutos.length || idsItens.length;
      if (campaignId && itemId && quantidadeItens === 1) {
        itemPorCampanha.set(campaignId, {
          item_id: itemId,
          nome: autoProdutos[0]?.product_name ?? comum.ad_name ?? null,
          status: autoProdutos[0]?.status ?? comum.campaign_status ?? null,
        });
      }
    }
  }

  let campanhasComProduto = 0;
  for (let i = 0; i < campanhas.length; i += 100) {
    const loteCampanhas = campanhas.slice(i, i + 100);
    const ids = loteCampanhas.map((c) => c.campaign_id).join(",");
    if (!ids) continue;
    const performance = await chamarShopee(
      "/api/v2/ads/get_product_campaign_daily_performance",
      token,
      shopId,
      { start_date: inicioStr, end_date: fimStr, campaign_id_list: ids },
    );
    if (performance.json?.error) {
      registrarErro(
        "get_product_campaign_daily_performance",
        String(performance.json.error),
        performance.texto,
      );
      continue;
    }
    const respostas: any[] = Array.isArray(performance.json?.response)
      ? performance.json.response
      : [performance.json?.response].filter(Boolean);
    for (const resposta of respostas) {
      const lista: any[] = resposta?.campaign_list ?? [];
      for (const campanha of lista) {
        const campaignId = Number(campanha.campaign_id ?? 0);
        const produto = itemPorCampanha.get(campaignId);
        if (!produto) continue;
        campanhasComProduto += 1;
        const metricas: any[] = campanha.metrics_list ?? [];
        for (const metrica of metricas) {
          acumular(mapa, {
            campaign_id: campaignId,
            nome: produto.nome ?? campanha.ad_name ?? null,
            item_id: produto.item_id,
            status: produto.status,
            data: dataShopeeParaISO(metrica.date, diaISO(de)),
            investimento: num(metrica.expense),
            impressoes: num(metrica.impression),
            cliques: num(metrica.clicks ?? metrica.click),
            pedidos: num(metrica.broad_order ?? metrica.direct_order),
            receita: num(metrica.broad_gmv ?? metrica.direct_gmv),
            bruto: { fonte: "product_campaign_daily_performance", campanha, metrica },
          });
        }
      }
    }
  }
  tentativas.push({
    endpoint: "get_product_campaign_daily_performance",
    erro: null,
    itens: campanhasComProduto,
  });
  if (campanhasComProduto > 0)
    endpointUsado = "hourly_performance + product_campaign_daily_performance";

  if (!endpointUsado) {
    const kw = await chamarShopee("/api/v2/ads/get_recommended_keyword_list", token, shopId, {
      item_id: "0",
    });
    if (kw.json?.error) {
      registrarErro("get_recommended_keyword_list", String(kw.json.error), kw.texto);
    } else {
      endpointUsado = "get_recommended_keyword_list (sem dados de performance)";
    }
  }

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
    const { data, error } = await supabaseAdmin.rpc("aplicar_ads", {
      p_dados: lote,
      p_loja_id: lojaId,
    });
    if (error) {
      registrarErro("aplicar_ads", error.message);
    } else {
      gravadas += Number(data ?? 0);
    }
  }

  return {
    loja_id: lojaId,
    ok: Boolean(endpointUsado) && erros.length === 0,
    endpoint_usado: endpointUsado,
    campanhas_encontradas: registros.length,
    gravadas,
    tentativas,
    erros: erros.slice(0, 20),
    primeiro_erro_cru: primeiroErroCru,
  };
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  const inicio = Date.now();

  try {
    const url = new URL(request.url);
    const agora = Math.floor(Date.now() / 1000);
    const deParam = Number(url.searchParams.get("de"));
    const ateParam = Number(url.searchParams.get("ate"));

    const ate = ateParam > 0 ? ateParam : agora;
    const de = deParam > 0 ? deParam : ate - 24 * 60 * 60;

    if (!(de > 0) || !(ate > de)) {
      return responder({ ok: false, erro: "intervalo invalido" }, 400);
    }

    const inicioStr = dataDDMMYYYY(new Date(de * 1000));
    const fimStr = dataDDMMYYYY(new Date(ate * 1000));

    const lojas = await listarLojasAtivas();
    if (lojas.length === 0) {
      return responder({ ok: false, erro: "nenhuma loja ativa cadastrada" }, 400);
    }

    const resultados = [];
    for (const loja of lojas) {
      resultados.push(await sincronizarLoja(loja.id, de, ate, inicioStr, fimStr));
    }

    const ok = resultados.every((r) => r.ok);
    console.log("sync-ads concluido", {
      lojas: resultados.map((r) => ({
        loja_id: r.loja_id,
        ok: r.ok,
        gravadas: (r as any).gravadas,
      })),
      duracao_ms: Date.now() - inicio,
    });

    return responder({
      ok,
      periodo: { de, ate, inicio: inicioStr, fim: fimStr },
      lojas: resultados,
      duracao_ms: Date.now() - inicio,
    });
  } catch (erro) {
    console.error("erro no sync-ads", String(erro));
    return responder({ ok: false, erro: "erro interno", duracao_ms: Date.now() - inicio }, 500);
  }
}

export const Route = createFileRoute("/api/public/shopee/sync-ads")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
