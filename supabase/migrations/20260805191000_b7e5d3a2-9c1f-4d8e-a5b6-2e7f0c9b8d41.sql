-- ============================================================
-- Correção de drift: a view pedido_itens_custeado (criada em
-- 20260730005622) também foi atualizada em produção fora do
-- histórico rastreado para expor `marketplace` (pi.marketplace),
-- coluna adicionada em 20260805190000. Funções posteriores
-- (pedidos_em_transito_impl, etc.) leem pic.marketplace através
-- dela.
-- ============================================================

create or replace view public.pedido_itens_custeado
with (security_invoker = on) as
select
  pi.id, pi.order_sn, pi.item_id, pi.model_id, pi.produto, pi.sku,
  pi.quantidade, pi.preco_unitario, pi.receita, pi.status_pedido,
  pi.data_criacao_pedido, pi.created_at, pi.marketplace,
  c.custo_unitario as custo_vigente,
  pi.quantidade::numeric * c.custo_unitario as custo_total
from public.pedido_itens pi
left join lateral (
  select pc.custo_unitario
  from public.produto_custos pc
  where pc.item_id = pi.item_id
    and pc.model_id = pi.model_id
    and pc.vigencia_inicio <= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
    and coalesce(pc.vigencia_fim, '9999-12-31'::date) >= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
  order by pc.vigencia_inicio desc
  limit 1
) c on true;

grant select on public.pedido_itens_custeado to authenticated;
