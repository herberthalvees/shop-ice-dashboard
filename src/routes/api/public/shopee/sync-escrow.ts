import { createFileRoute } from '@tanstack/react-router';

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
) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const apiBase = process.env.SHOPEE_API_BASE!;

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

function normalizar(orderSn: string, detalhe: Record<string, any>) {
  const renda = detalhe?.order_income ?? {};
  return {
    order_sn: orderSn,
    valor_liquido: renda.escrow_amount ?? null,
    comissao: renda.commission_fee ?? null,
    taxa_servico: renda.service_fee ?? null,
    taxa_transacao: renda.seller_transaction_fee ?? null,
    payload: renda,
  };
}

async function handler({ request }: { request: Request }) {
  const inicioExecucao = Date.now();
  const erros: string[] = [];

  try {
    const url = new URL(request.url);
    const limite = Math.min(Number(url.searchParams.get('limite') ?? '300'), 1000);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: conexao, error: erroConexao } = await supabaseAdmin
      .from('shopee_connection')
      .select('shop_id, access_token, token_expires_at')
      .eq('id', 1)
      .single();

    if (erroConexao || !conexao?.access_token) {
      return responder({ ok: false, erro: 'nenhuma loja conectada' }, 400);
    }

    if (new Date(conexao.token_expires_at as string) < new Date()) {
      return responder({ ok: false, erro: 'access_token expirado' }, 400);
    }

    const shopId = Number(conexao.shop_id);
    const token = conexao.access_token as string;

    const { data: pendentes, error: erroFila } = await supabaseAdmin.rpc(
      'pedidos_escrow_pendentes' as any,
      { p_limite: limite },
    );

    if (erroFila) {
      return responder({ ok: false, erro: erroFila.message }, 500);
    }

    const sns: string[] = ((pendentes ?? []) as Array<{ order_sn: string }>).map(
      (r) => r.order_sn,
    );

    if (sns.length === 0) {
      return responder({
        ok: true,
        fila_vazia: true,
        mensagem: 'todos os pedidos ja tem escrow',
      });
    }

    let atualizados = 0;
    let usouFallback = false;

    for (let i = 0; i < sns.length; i += 50) {
      const lote = sns.slice(i, i + 50);
      const registros: Array<Record<string, unknown>> = [];

      const emLote = await chamarShopee(
        '/api/v2/payment/get_escrow_detail_batch',
        token,
        shopId,
        { metodo: 'POST', corpo: { order_sn_list: lote } },
      );

      const loteFuncionou = !emLote.error || emLote.error === '';

      if (loteFuncionou) {
        const lista = emLote.response ?? [];
        for (const item of lista) {
          const sn = item.order_sn ?? item.escrow_detail?.order_sn;
          const detalhe = item.escrow_detail ?? item;
          if (sn) registros.push(normalizar(sn, detalhe));
        }
      } else {
        usouFallback = true;
        for (const sn of lote) {
          const um = await chamarShopee(
            '/api/v2/payment/get_escrow_detail',
            token,
            shopId,
            { query: { order_sn: sn } },
          );

          if (!um.error || um.error === '') {
            registros.push(normalizar(sn, um.response ?? {}));
          } else {
            erros.push(`${sn}: ${um.error}`);
          }
        }
      }

      if (registros.length > 0) {
        const { data: qtd, error: erroAplicar } = await supabaseAdmin.rpc(
          'aplicar_escrow' as any,
          { p_dados: registros },
        );

        if (erroAplicar) {
          erros.push(`aplicar_escrow: ${erroAplicar.message}`);
        } else {
          atualizados += Number(qtd ?? 0);
        }
      }
    }

    const { count: restantes } = await supabaseAdmin
      .from('pedidos')
      .select('order_sn', { count: 'exact', head: true })
      .is('escrow_atualizado_em', null)
      .not('status', 'in', '("UNPAID","CANCELLED")');

    console.log('sync-escrow concluido', {
      processados: sns.length,
      atualizados: atualizados,
      restantes: restantes ?? null,
      erros: erros.length,
    });

    return responder({
      ok: erros.length === 0,
      processados: sns.length,
      atualizados: atualizados,
      ainda_pendentes: restantes ?? null,
      usou_fallback_individual: usouFallback,
      duracao_ms: Date.now() - inicioExecucao,
      erros: erros.slice(0, 20),
    });
  } catch (erro) {
    console.error('erro no sync-escrow', String(erro));
    return responder({ ok: false, erro: 'erro interno', erros }, 500);
  }
}

export const Route = createFileRoute('/api/public/shopee/sync-escrow')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});