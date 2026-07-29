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
  parametros: Record<string, string> = {},
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
    ...parametros,
  });

  const resposta = await fetch(`${apiBase}${path}?${query.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  return (await resposta.json()) as any;
}

function paraIso(segundos: unknown): string | null {
  const n = Number(segundos);
  if (!n || Number.isNaN(n)) return null;
  return new Date(n * 1000).toISOString();
}

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request); if (unauth) return unauth;
  const inicioExecucao = Date.now();
  const erros: string[] = [];

  try {
    const url = new URL(request.url);
    const campo =
      url.searchParams.get('campo') === 'update_time' ? 'update_time' : 'create_time';

    const agora = Math.floor(Date.now() / 1000);
    const JANELA = 15 * 24 * 60 * 60; // limite da Shopee

    const deParam = url.searchParams.get('de');
    const ateParam = url.searchParams.get('ate');

    let inicio: number;
    let limite: number;

    if (deParam && ateParam) {
      inicio = Number(deParam);
      limite = Number(ateParam);
    } else {
      const dias = Math.min(Number(url.searchParams.get('dias') ?? '1'), 15);
      inicio = agora - Math.round(dias * 24 * 60 * 60);
      limite = agora;
    }

    if (!inicio || !limite || inicio >= limite) {
      return responder({ ok: false, erro: 'faixa de datas invalida' }, 400);
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: conexao, error: erroBanco } = await supabaseAdmin
      .from('shopee_connection')
      .select('shop_id, access_token, token_expires_at')
      .eq('app_tipo', 'principal')
      .single();

    if (erroBanco || !conexao || !conexao.access_token) {
      return responder({ ok: false, erro: 'nenhuma loja conectada' }, 400);
    }

    if (new Date(conexao.token_expires_at as string) < new Date()) {
      return responder({ ok: false, erro: 'access_token expirado' }, 400);
    }

    const shopId = Number(conexao.shop_id);
    const token = conexao.access_token as string;

    const todosSn: string[] = [];
    const inicioOriginal = inicio;

    while (inicio < limite) {
      const fim = Math.min(inicio + JANELA, limite);
      let cursor = '';
      let temMais = true;
      let guarda = 0;

      while (temMais && guarda < 50) {
        guarda++;

        const parametros: Record<string, string> = {
          time_range_field: campo,
          time_from: String(inicio),
          time_to: String(fim),
          page_size: '100',
        };
        if (cursor) parametros.cursor = cursor;

        const lista = await chamarShopee(
          '/api/v2/order/get_order_list',
          token,
          shopId,
          parametros,
        );

        if (lista.error && lista.error !== '') {
          erros.push(`get_order_list: ${lista.error} ${lista.message ?? ''}`);
          break;
        }

        const pagina = lista.response?.order_list ?? [];
        for (const p of pagina) todosSn.push(p.order_sn);

        temMais = Boolean(lista.response?.more);
        cursor = lista.response?.next_cursor ?? '';
        if (!cursor) temMais = false;
      }

      inicio = fim;
    }

    const unicos = Array.from(new Set(todosSn));
    let gravados = 0;

    for (let i = 0; i < unicos.length; i += 50) {
      const lote = unicos.slice(i, i + 50);

      const detalhe = await chamarShopee(
        '/api/v2/order/get_order_detail',
        token,
        shopId,
        {
          order_sn_list: lote.join(','),
          response_optional_fields:
            'buyer_username,total_amount,item_list,pay_time,actual_shipping_fee',
        },
      );

      if (detalhe.error && detalhe.error !== '') {
        erros.push(`get_order_detail: ${detalhe.error} ${detalhe.message ?? ''}`);
        continue;
      }

      const linhas = (detalhe.response?.order_list ?? []).map(
        (p: Record<string, unknown>) => ({
          order_sn: p.order_sn,
          status: p.order_status ?? null,
          valor_total: p.total_amount ?? null,
          moeda: p.currency ?? null,
          comprador_username: p.buyer_username ?? null,
          qtd_itens: Array.isArray(p.item_list) ? (p.item_list as unknown[]).length : 0,
          itens: p.item_list ?? null,
          data_criacao_pedido: paraIso(p.create_time),
          data_pagamento: paraIso(p.pay_time),
          frete_real: p.actual_shipping_fee ?? null,
          payload: p,
          updated_at: new Date().toISOString(),
        }),
      );

      if (linhas.length > 0) {
        const { error: erroUpsert } = await supabaseAdmin
          .from('pedidos')
          .upsert(linhas as any, { onConflict: 'order_sn' });

        if (erroUpsert) {
          erros.push(`upsert: ${erroUpsert.message}`);
        } else {
          gravados += linhas.length;
        }
      }
    }

    console.log('sync concluido', {
      campo,
      encontrados: unicos.length,
      gravados,
      erros: erros.length,
    });

    try {
      await supabaseAdmin.from('sync_log' as any).insert({
        campo,
        de: new Date(inicioOriginal * 1000).toISOString(),
        ate: new Date(limite * 1000).toISOString(),
        encontrados: unicos.length,
        gravados,
        duracao_ms: Date.now() - inicioExecucao,
        ok: erros.length === 0,
        erros: erros.length ? erros : null,
      });
    } catch (logErro) {
      console.error('falha ao gravar sync_log', String(logErro));
    }

    return responder({
      ok: erros.length === 0,
      campo: campo,
      de: new Date(inicioOriginal * 1000).toISOString(),
      ate: new Date(limite * 1000).toISOString(),
      pedidos_encontrados: unicos.length,
      pedidos_gravados: gravados,
      duracao_ms: Date.now() - inicioExecucao,
      erros,
    });
  } catch (erro) {
    console.error('erro no sync', String(erro));
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await supabaseAdmin.from('sync_log' as any).insert({
        campo: null,
        encontrados: 0,
        gravados: 0,
        duracao_ms: Date.now() - inicioExecucao,
        ok: false,
        erros: [String(erro), ...erros],
      });
    } catch (logErro) {
      console.error('falha ao gravar sync_log (catch)', String(logErro));
    }
    return responder({ ok: false, erro: 'erro interno', erros }, 500);
  }
}

export const Route = createFileRoute('/api/public/shopee/sync')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});