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

async function handler({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const forcar = url.searchParams.get('forcar') === '1';

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const apiBase = process.env.SHOPEE_API_BASE;

    if (!partnerId || !partnerKey || !apiBase) {
      return responder({ ok: false, erro: 'secrets ausentes' }, 500);
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: conexao, error: erroBanco } = await supabaseAdmin
      .from('shopee_connection')
      .select('shop_id, refresh_token, token_expires_at, status')
      .eq('id', 1)
      .single();

    if (erroBanco || !conexao || !conexao.refresh_token) {
      return responder(
        { ok: false, erro: 'nenhuma loja conectada', dica: 'rode o fluxo de autorizacao' },
        400,
      );
    }

    const faltaMs = new Date(conexao.token_expires_at as string).getTime() - Date.now();
    const umaHora = 60 * 60 * 1000;

    if (!forcar && faltaMs > umaHora) {
      return responder({
        ok: true,
        renovado: false,
        motivo: 'token ainda valido',
        expira_em: conexao.token_expires_at,
        falta_minutos: Math.round(faltaMs / 60000),
      });
    }

    const path = '/api/v2/auth/access_token/get';
    const timestamp = Math.floor(Date.now() / 1000);

    const stringBase = `${partnerId}${path}${timestamp}`;
    const sign = await hmacSha256Hex(partnerKey, stringBase);

    const endpoint =
      `${apiBase}${path}` +
      `?partner_id=${partnerId}` +
      `&timestamp=${timestamp}` +
      `&sign=${sign}`;

    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: conexao.refresh_token,
        partner_id: Number(partnerId),
        shop_id: Number(conexao.shop_id),
      }),
    });

    const dados = (await resposta.json()) as {
      error?: string;
      message?: string;
      access_token?: string;
      refresh_token?: string;
      expire_in?: number;
    };

    if (dados.error && dados.error !== '') {
      console.error('falha ao renovar token', { error: dados.error, message: dados.message });
      await supabaseAdmin
        .from('shopee_connection')
        .update({ status: 'expirada', updated_at: new Date().toISOString() })
        .eq('id', 1);
      return responder(
        { ok: false, erro: dados.error, mensagem: dados.message, dica: 'reautorize a loja' },
        400,
      );
    }

    if (!dados.access_token) {
      console.error('resposta sem access_token', { chaves: Object.keys(dados) });
      return responder({ ok: false, erro: 'resposta sem access_token' }, 500);
    }

    const segundos = Number(dados.expire_in ?? 14400);
    const expiraEm = new Date(Date.now() + segundos * 1000).toISOString();

    const novoRefresh = dados.refresh_token ?? conexao.refresh_token;

    const { error: erroUpdate } = await supabaseAdmin
      .from('shopee_connection')
      .update({
        access_token: dados.access_token,
        refresh_token: novoRefresh,
        token_expires_at: expiraEm,
        status: 'ativa',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (erroUpdate) {
      console.error('falha ao gravar token renovado', erroUpdate.message);
      return responder({ ok: false, erro: 'falha ao gravar no banco' }, 500);
    }

    console.log('token renovado', {
      shop_id: Number(conexao.shop_id),
      expira_em: expiraEm,
      refresh_rotacionou: novoRefresh !== conexao.refresh_token,
    });

    return responder({
      ok: true,
      renovado: true,
      expira_em: expiraEm,
      refresh_rotacionou: novoRefresh !== conexao.refresh_token,
    });
  } catch (erro) {
    console.error('erro no refresh', String(erro));
    return responder({ ok: false, erro: 'erro interno' }, 500);
  }
}

export const Route = createFileRoute('/api/public/shopee/refresh-token')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
