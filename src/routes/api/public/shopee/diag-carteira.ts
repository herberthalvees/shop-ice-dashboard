import { createFileRoute } from '@tanstack/react-router';
import { checkCronSecret } from '@/lib/cron-auth.server';

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

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;

  try {
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

    const agora = Math.floor(Date.now() / 1000);
    const seteDiasAtras = agora - 7 * 24 * 60 * 60;
    const trintaDiasAtras = agora - 30 * 24 * 60 * 60;

    let wallet: unknown;
    try {
      wallet = await chamarShopee(
        '/api/v2/payment/get_wallet_transaction_list',
        token,
        shopId,
        {
          query: {
            page_no: '0',
            page_size: '5',
            create_time_from: String(seteDiasAtras),
            create_time_to: String(agora),
          },
        },
      );
    } catch (e) {
      wallet = { erro: 'excecao', mensagem: String(e) };
    }

    let payout: unknown;
    try {
      payout = await chamarShopee(
        '/api/v2/payment/get_payout_detail',
        token,
        shopId,
        {
          query: {
            page_no: '0',
            page_size: '5',
            payout_time_from: String(trintaDiasAtras),
            payout_time_to: String(agora),
          },
        },
      );
    } catch (e) {
      payout = { erro: 'excecao', mensagem: String(e) };
    }

    return responder({ wallet, payout });
  } catch (erro) {
    return responder({ ok: false, erro: 'erro interno', detalhe: String(erro) }, 500);
  }
}

export const Route = createFileRoute('/api/public/shopee/diag-carteira')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});