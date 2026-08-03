// Server-only: rotinas de sincronização do TikTok Shop -> banco (marketplace = 'tiktok').
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buscarPedidosTiktok,
  buscarProdutosTiktok,
  buscarStatementsTiktok,
  buscarTransacoesStatement,
  detalharPedidosTiktok,
  listarLojasAutorizadas,
  renovarTokenTiktok,
} from "./tiktok.server";

const MKT = "tiktok" as const;

export type Conexao = {
  shop_id: string | null;
  shop_cipher: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
};

export async function conexaoTiktok(): Promise<Conexao | null> {
  const { data } = await supabaseAdmin
    .from("tiktok_connection")
    .select("shop_id, shop_cipher, access_token, refresh_token, token_expires_at, status")
    .eq("id", 1)
    .maybeSingle();
  return (data as Conexao | null) ?? null;
}

export async function renovarSeNecessario(forcar = false) {
  const conn = await conexaoTiktok();
  if (!conn?.refresh_token) return { ok: false, erro: "sem conexão com o TikTok Shop" };

  const vence = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (!forcar && vence > Date.now() + 10 * 60_000) return { ok: true, renovado: false };

  const r = await renovarTokenTiktok(conn.refresh_token);
  const token = r.data?.access_token;
  if (!token) {
    await supabaseAdmin
      .from("tiktok_connection")
      .update({ status: "expirada", updated_at: new Date().toISOString() })
      .eq("id", 1);
    return { ok: false, erro: r.message ?? "falha ao renovar o token do TikTok Shop" };
  }

  await supabaseAdmin
    .from("tiktok_connection")
    .update({
      access_token: token,
      refresh_token: r.data?.refresh_token ?? conn.refresh_token,
      token_expires_at: new Date((r.data?.access_token_expire_in ?? 0) * 1000).toISOString(),
      refresh_expires_at: r.data?.refresh_token_expire_in
        ? new Date(r.data.refresh_token_expire_in * 1000).toISOString()
        : null,
      status: "ativa",
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return { ok: true, renovado: true };
}

/** Garante token válido + shop_cipher preenchido. */
async function conexaoPronta(): Promise<
  { ok: true; accessToken: string; shopCipher: string } | { ok: false; erro: string }
> {
  const renovacao = await renovarSeNecessario();
  if (!renovacao.ok) return { ok: false, erro: renovacao.erro ?? "token inválido" };

  let conn = await conexaoTiktok();
  if (!conn?.access_token) return { ok: false, erro: "sem token de acesso do TikTok Shop" };

  if (!conn.shop_cipher) {
    const lojas = await listarLojasAutorizadas(conn.access_token);
    const loja = lojas?.data?.shops?.[0];
    if (!loja?.cipher) return { ok: false, erro: "não foi possível obter o shop_cipher da loja" };
    await supabaseAdmin
      .from("tiktok_connection")
      .update({
        shop_id: String(loja.id ?? ""),
        shop_name: loja.name ?? null,
        shop_cipher: loja.cipher,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    conn = { ...conn, shop_id: String(loja.id ?? ""), shop_cipher: String(loja.cipher) };
  }

  if (!conn.shop_cipher) return { ok: false, erro: "shop_cipher indisponível" };
  return { ok: true, accessToken: conn.access_token, shopCipher: conn.shop_cipher };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------- Pedidos ----------

export async function sincronizarPedidosTiktok(horasAtras = 24) {
  const pronta = await conexaoPronta();
  if (!pronta.ok) return { ok: false, erro: pronta.erro };
  const { accessToken, shopCipher } = pronta;

  const agora = Math.floor(Date.now() / 1000);
  const desde = agora - horasAtras * 3600;

  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < 20; pagina++) {
    const r = await buscarPedidosTiktok(accessToken, shopCipher, {
      criadoDe: desde,
      criadoAte: agora,
      pageToken,
    });
    if (r?.code && r.code !== 0) return { ok: false, erro: r.message ?? "erro ao listar pedidos" };
    for (const o of r?.data?.orders ?? []) if (o?.id) ids.push(String(o.id));
    pageToken = r?.data?.next_page_token || undefined;
    if (!pageToken) break;
  }

  let gravados = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const det = await detalharPedidosTiktok(accessToken, shopCipher, lote);
    for (const o of det?.data?.orders ?? []) {
      const orderSn = String(o.id);
      const itens = o.line_items ?? [];
      const criadoEm = o.create_time ? new Date(o.create_time * 1000).toISOString() : null;
      const pagoEm = o.paid_time ? new Date(o.paid_time * 1000).toISOString() : null;
      const total =
        num(o.payment?.total_amount) ||
        itens.reduce((s: number, it: any) => s + num(it.sale_price), 0);

      const { data: existente } = await supabaseAdmin
        .from("pedidos")
        .select("order_sn")
        .eq("order_sn", orderSn)
        .maybeSingle();

      await supabaseAdmin.from("pedidos").upsert(
        {
          marketplace: MKT,
          order_sn: orderSn,
          status: o.status ?? null,
          valor_total: total,
          comprador_username: o.buyer_email ?? o.user_id ?? null,
          itens,
          payload_json: o,
          moeda: o.payment?.currency ?? "BRL",
          qtd_itens: itens.length,
          data_criacao_pedido: criadoEm,
          data_pagamento: pagoEm,
          frete_real: num(o.payment?.shipping_fee),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "order_sn" },
      );

      await supabaseAdmin
        .from("pedido_itens")
        .delete()
        .eq("order_sn", orderSn)
        .eq("marketplace", MKT);

      if (itens.length > 0) {
        await supabaseAdmin.from("pedido_itens").insert(
          itens.map((it: any) => ({
            marketplace: MKT,
            order_sn: orderSn,
            item_id: num(it.product_id),
            model_id: num(it.sku_id),
            produto: it.product_name ?? null,
            sku: it.seller_sku ?? it.sku_name ?? null,
            quantidade: 1,
            preco_unitario: num(it.sale_price),
            receita: num(it.sale_price),
            status_pedido: it.display_status ?? o.status ?? null,
            data_criacao_pedido: criadoEm,
          })),
        );
      }

      gravados++;
      if (!existente) {
        try {
          const { notificarNovaVenda } = await import("./push.server");
          await notificarNovaVenda({ order_sn: orderSn, valor_total: total, itens });
        } catch (e) {
          console.error("[tiktok] push nova venda", e);
        }
      }
    }
  }

  return { ok: true, encontrados: ids.length, gravados };
}

// ---------- Produtos / estoque ----------

export async function sincronizarProdutosTiktok() {
  const pronta = await conexaoPronta();
  if (!pronta.ok) return { ok: false, erro: pronta.erro };
  const { accessToken, shopCipher } = pronta;

  const linhas: any[] = [];
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < 30; pagina++) {
    const r = await buscarProdutosTiktok(accessToken, shopCipher, { pageToken });
    if (r?.code && r.code !== 0) return { ok: false, erro: r.message ?? "erro ao listar produtos" };
    for (const p of r?.data?.products ?? []) {
      const imagem = p.main_images?.[0]?.urls?.[0] ?? null;
      for (const sku of p.skus ?? []) {
        linhas.push({
          marketplace: MKT,
          item_id: num(p.id),
          model_id: num(sku.id),
          sku: sku.seller_sku ?? null,
          produto: p.title ?? null,
          variacao:
            (sku.sales_attributes ?? []).map((a: any) => a.value_name).filter(Boolean).join(" / ") ||
            null,
          preco_atual: num(sku.price?.sale_price ?? sku.price?.tax_exclusive_price),
          preco_original: num(sku.price?.original_price ?? sku.price?.sale_price),
          estoque_disponivel: (sku.inventory ?? []).reduce(
            (s: number, i: any) => s + num(i.quantity),
            0,
          ),
          estoque_reservado: 0,
          status_item: p.status ?? null,
          imagem_url: imagem,
          atualizado_em: new Date().toISOString(),
        });
      }
    }
    pageToken = r?.data?.next_page_token || undefined;
    if (!pageToken) break;
  }

  if (linhas.length > 0) {
    for (let i = 0; i < linhas.length; i += 100) {
      await supabaseAdmin
        .from("produtos")
        .upsert(linhas.slice(i, i + 100), { onConflict: "item_id,model_id" });
    }
  }

  return { ok: true, gravados: linhas.length };
}

// ---------- Financeiro (repasses) ----------

export async function sincronizarFinanceiroTiktok(diasAtras = 15) {
  const pronta = await conexaoPronta();
  if (!pronta.ok) return { ok: false, erro: pronta.erro };
  const { accessToken, shopCipher } = pronta;

  const agora = Math.floor(Date.now() / 1000);
  const desde = agora - diasAtras * 86400;

  const statementIds: string[] = [];
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await buscarStatementsTiktok(accessToken, shopCipher, {
      pageToken,
      statementTimeGe: desde,
      statementTimeLt: agora,
    });
    if (r?.code && r.code !== 0) return { ok: false, erro: r.message ?? "erro ao listar repasses" };
    for (const s of r?.data?.statements ?? []) if (s?.id) statementIds.push(String(s.id));
    pageToken = r?.data?.next_page_token || undefined;
    if (!pageToken) break;
  }

  let atualizados = 0;
  for (const statementId of statementIds) {
    let token: string | undefined;
    for (let pagina = 0; pagina < 20; pagina++) {
      const r = await buscarTransacoesStatement(accessToken, shopCipher, statementId, token);
      for (const t of r?.data?.statement_transactions ?? []) {
        const orderSn = t.order_id ? String(t.order_id) : null;
        if (!orderSn) continue;
        const taxas = t.fee_amount ?? {};
        const { error } = await supabaseAdmin
          .from("pedidos")
          .update({
            valor_liquido: num(t.settlement_amount),
            comissao: Math.abs(num(taxas.platform_commission ?? t.total_fee_amount)),
            taxa_servico: Math.abs(num(taxas.affiliate_commission)),
            taxa_transacao: Math.abs(num(taxas.transaction_fee)),
            escrow_payload: t,
            escrow_atualizado_em: new Date().toISOString(),
          })
          .eq("order_sn", orderSn)
          .eq("marketplace", MKT);
        if (!error) atualizados++;
      }
      token = r?.data?.next_page_token || undefined;
      if (!token) break;
    }
  }

  return { ok: true, repasses: statementIds.length, pedidos_atualizados: atualizados };
}