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
