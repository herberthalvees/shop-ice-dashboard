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

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request); if (unauth) return unauth;
  try {
    const url = new URL(request.url);
    const forcar = url.searchParams.get('forcar') === '1';
    const filtroApp = url.searchParams.get('app');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    let consulta = supabaseAdmin
      .from('shopee_connection')
      .select('id, app_tipo, shop_id, refresh_token, token_expires_at, status');
    if (filtroApp) consulta = consulta.eq('app_tipo', filtroApp);

    const { data: conexoes, error: erroBanco } = await consulta;

    if (erroBanco) {
      console.error('falha ao ler conexoes', erroBanco.message);
      return responder({ ok: false, erro: 'falha ao ler conexoes' }, 500);
    }
    if (!conexoes || conexoes.length === 0) {
      return responder({ ok: false, erro: 'nenhuma loja conectada', dica: 'rode o fluxo de autorizacao' }, 400);
    }

    const resultados: unknown[] = [];

    for (const conexao of conexoes) {
      const appTipo = (conexao.app_tipo as string) ?? 'principal';

      if (!conexao.refresh_token || !conexao.shop_id) {
        resultados.push({ app_tipo: appTipo, ok: false, erro: 'conexao incompleta' });
        continue;
      }

      const { partnerId, partnerKey, apiBase } = credenciais(appTipo);
      if (!partnerId || !partnerKey || !apiBase) {
        resultados.push({ app_tipo: appTipo, ok: false, erro: 'secrets ausentes' });
        continue;
      }

      const faltaMs = conexao.token_expires_at
        ? new Date(conexao.token_expires_at as string).getTime() - Date.now()
        : -1;
      const umaHora = 60 * 60 * 1000;

      if (!forcar && faltaMs > umaHora) {
        resultados.push({
          app_tipo: appTipo,
          ok: true,
          renovado: false,
          motivo: 'token ainda valido',
          expira_em: conexao.token_expires_at,
          falta_minutos: Math.round(faltaMs / 60000),
        });
        continue;
      }

      const path = '/api/v2/auth/access_token/get';
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${timestamp}`);

      const resposta = await fetch(
        `${apiBase}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: conexao.refresh_token,
            partner_id: Number(partnerId),
            shop_id: Number(conexao.shop_id),
          }),
        },
      );

      const dados = (await resposta.json()) as {
        error?: string;
        message?: string;
        access_token?: string;
        refresh_token?: string;
        expire_in?: number;
      };

      if (dados.error && dados.error !== '') {
        console.error('falha ao renovar token', { app_tipo: appTipo, error: dados.error });
        await supabaseAdmin
          .from('shopee_connection')
          .update({ status: 'expirada', updated_at: new Date().toISOString() })
          .eq('id', conexao.id);
        resultados.push({
          app_tipo: appTipo,
          ok: false,
          erro: dados.error,
          mensagem: dados.message,
          dica: 'reautorize a loja',
        });
        continue;
      }

      if (!dados.access_token) {
        resultados.push({ app_tipo: appTipo, ok: false, erro: 'resposta sem access_token' });
        continue;
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
          partner_id: Number(partnerId),
          status: 'ativa',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conexao.id);

      if (erroUpdate) {
        console.error('falha ao gravar token renovado', erroUpdate.message);
        resultados.push({ app_tipo: appTipo, ok: false, erro: 'falha ao gravar no banco' });
        continue;
      }

      console.log('token renovado', { app_tipo: appTipo, expira_em: expiraEm });

      resultados.push({
        app_tipo: appTipo,
        ok: true,
        renovado: true,
        expira_em: expiraEm,
        refresh_rotacionou: novoRefresh !== conexao.refresh_token,
      });
    }

    const ok = resultados.every((r: any) => r.ok);
    return responder({ ok, apps: resultados }, ok ? 200 : 207);
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
