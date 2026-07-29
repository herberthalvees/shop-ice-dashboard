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
  opcoes: {
    metodo?: string;
    query?: Record<string, string>;
    corpo?: unknown;
  } = {},
  appTipo: string = 'principal',
) {
  const { partnerId, partnerKey, apiBase } = credenciais(appTipo);
  if (!partnerId || !partnerKey || !apiBase) throw new Error('credenciais Shopee ausentes');

  const timestamp = Math.floor(Date.now() / 1000);
  const stringBase = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  const sign = await hmacSha256Hex(partnerKey, stringBase);

  const query = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign: sign,
    ...(opcoes.query ?? {}),
  });

  const init: RequestInit = {
    method: opcoes.metodo ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (opcoes.corpo !== undefined) {
    init.body = JSON.stringify(opcoes.corpo);
  }

  const resposta = await fetch(`${apiBase}${path}?${query.toString()}`, init);
  return (await resposta.json()) as any;
}

type Linha = {
  item_id: number;
  model_id: number;
  sku: string | null;
  produto: string | null;
  variacao: string | null;
  preco_atual: number | null;
  preco_original: number | null;
  estoque_disponivel: number | null;
  estoque_reservado: number | null;
  status_item: string | null;
  imagem_url: string | null;
};

function extrairEstoque(container: any, erros: string[], contexto: string): { disp: number | null; res: number | null } {
  const v2 = container?.stock_info_v2?.summary_info;
  if (v2) {
    return {
      disp: v2.total_available_stock ?? null,
      res: v2.total_reserved_stock ?? null,
    };
  }
  const legacy = container?.stock_info?.[0];
  if (legacy) {
    erros.push(`${contexto}: usando stock_info legacy`);
    return {
      disp: legacy.current_stock ?? null,
      res: legacy.reserved_stock ?? null,
    };
  }
  return { disp: null, res: null };
}

async function handler(_ctx: { request: Request }) {
  const unauth = checkCronSecret(_ctx.request); if (unauth) return unauth;
  const inicioExecucao = Date.now();
  const erros: string[] = [];

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: conexao, error: erroConexao } = await supabaseAdmin
      .from('shopee_connection')
      .select('shop_id, access_token, token_expires_at')
      .eq('app_tipo', 'principal')
      .single();

    if (erroConexao || !conexao?.access_token) {
      return responder({ ok: false, erro: 'nenhuma loja conectada' }, 400);
    }
    if (new Date(conexao.token_expires_at as string) < new Date()) {
      return responder({ ok: false, erro: 'access_token expirado' }, 400);
    }

    const shopId = Number(conexao.shop_id);
    const token = conexao.access_token as string;

    // 1) Paginar item_list
    const itemIds: number[] = [];
    let offset = 0;
    for (let pagina = 0; pagina < 50; pagina++) {
      const resp = await chamarShopee('/api/v2/product/get_item_list', token, shopId, {
        query: {
          offset: String(offset),
          page_size: '100',
          item_status: 'NORMAL',
        },
      });
      if (resp?.error) {
        erros.push(`get_item_list offset=${offset}: ${resp.error}`);
        break;
      }
      const items = resp?.response?.item ?? [];
      for (const it of items) {
        if (it?.item_id) itemIds.push(Number(it.item_id));
      }
      const hasNext = Boolean(resp?.response?.has_next_page);
      if (!hasNext) break;
      offset = Number(resp?.response?.next_offset ?? offset + items.length);
    }

    // 2) Detalhes em lotes de 50
    const linhas: Linha[] = [];
    let comVariacao = 0;

    for (let i = 0; i < itemIds.length; i += 50) {
      const lote = itemIds.slice(i, i + 50);
      const resp = await chamarShopee('/api/v2/product/get_item_base_info', token, shopId, {
        query: { item_id_list: lote.join(',') },
      });
      if (resp?.error) {
        erros.push(`get_item_base_info lote ${i}: ${resp.error}`);
        continue;
      }
      const items = resp?.response?.item_list ?? [];
      for (const it of items) {
        const item_id = Number(it.item_id);
        const nome = it.item_name ?? null;
        const status = it.item_status ?? null;
        const imagem = it.image?.image_url_list?.[0] ?? null;
        const priceInfo = it.price_info?.[0] ?? {};
        const precoItem = priceInfo.current_price ?? null;
        const precoOrigItem = priceInfo.original_price ?? null;

        if (it.has_model) {
          // 3) get_model_list
          comVariacao++;
          const respM = await chamarShopee('/api/v2/product/get_model_list', token, shopId, {
            query: { item_id: String(item_id) },
          });
          if (respM?.error) {
            erros.push(`get_model_list item=${item_id}: ${respM.error}`);
            continue;
          }
          const models = respM?.response?.model ?? [];
          for (const m of models) {
            const priceInfoM = m.price_info?.[0] ?? {};
            const { disp, res } = extrairEstoque(m, erros, `item ${item_id} model ${m.model_id}`);
            linhas.push({
              item_id,
              model_id: Number(m.model_id ?? 0),
              sku: m.model_sku ?? null,
              produto: nome,
              variacao: m.model_name ?? null,
              preco_atual: priceInfoM.current_price ?? precoItem,
              preco_original: priceInfoM.original_price ?? precoOrigItem,
              estoque_disponivel: disp,
              estoque_reservado: res,
              status_item: status,
              imagem_url: imagem,
            });
          }
        } else {
          const { disp, res } = extrairEstoque(it, erros, `item ${item_id}`);
          linhas.push({
            item_id,
            model_id: 0,
            sku: it.item_sku ?? null,
            produto: nome,
            variacao: null,
            preco_atual: precoItem,
            preco_original: precoOrigItem,
            estoque_disponivel: disp,
            estoque_reservado: res,
            status_item: status,
            imagem_url: imagem,
          });
        }
      }
    }

    // 4) Aplicar em lotes de 200
    let gravadas = 0;
    for (let i = 0; i < linhas.length; i += 200) {
      const lote = linhas.slice(i, i + 200);
      const { data: qtd, error: erroAplicar } = await supabaseAdmin.rpc(
        'aplicar_produtos' as any,
        { p_dados: lote },
      );
      if (erroAplicar) {
        erros.push(`aplicar_produtos lote ${i}: ${erroAplicar.message}`);
      } else {
        gravadas += Number(qtd ?? 0);
      }
    }

    console.log('sync-produtos concluido', {
      itens_encontrados: itemIds.length,
      linhas_geradas: linhas.length,
      linhas_gravadas: gravadas,
      itens_com_variacao: comVariacao,
      erros: erros.length,
      duracao_ms: Date.now() - inicioExecucao,
    });

    return responder({
      ok: erros.length === 0,
      itens_encontrados: itemIds.length,
      linhas_gravadas: gravadas,
      itens_com_variacao: comVariacao,
      duracao_ms: Date.now() - inicioExecucao,
      erros: erros.slice(0, 20),
    });
  } catch (erro) {
    console.error('erro no sync-produtos', String(erro));
    return responder({ ok: false, erro: 'erro interno', erros }, 500);
  }
}

export const Route = createFileRoute('/api/public/shopee/sync-produtos')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});