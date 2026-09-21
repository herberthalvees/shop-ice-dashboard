-- ============================================================
-- Correção de drift: a coluna `marketplace` (discriminador de
-- canal de venda, default 'shopee') existe em produção em
-- pedidos/produtos/pedido_itens, mas nunca foi adicionada por
-- uma migration rastreada — foi aplicada direto no banco em
-- algum momento. Migrations posteriores (ex.: estoque_listar)
-- já assumem que ela existe. `if not exists` deixa isso seguro
-- de reaplicar mesmo onde a coluna já esteja presente.
-- ============================================================

alter table public.produtos add column if not exists marketplace text not null default 'shopee';
alter table public.pedidos add column if not exists marketplace text not null default 'shopee';
alter table public.pedido_itens add column if not exists marketplace text not null default 'shopee';

-- A view pedido_itens_custeado (criada em 20260730005622) também foi
-- atualizada em produção fora do histórico para expor `marketplace`
-- (usada depois por pedidos_em_transito_impl e outras funções).
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
