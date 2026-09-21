-- ============================================================
-- Multi-loja — Etapa 1: fundação de banco
-- Introduz a tabela `lojas` e a coluna loja_id nas tabelas de
-- negócio, preparando o schema para múltiplas lojas Shopee.
-- Migração aditiva: os dados existentes são atribuídos à loja
-- "Loja principal" (a única loja de hoje), nada muda de resultado.
-- ============================================================

-- ===== 1. Tabela lojas =====

create table public.lojas (
  id bigint generated always as identity primary key,
  nome text not null,
  marketplace text not null default 'shopee',
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  created_at timestamptz not null default now()
);

grant select on public.lojas to authenticated;
grant all on public.lojas to service_role;

alter table public.lojas enable row level security;

create policy "owner read lojas" on public.lojas
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

create policy "admins insert lojas" on public.lojas
  for insert to authenticated
  with check (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

create policy "admins update lojas" on public.lojas
  for update to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner())
  with check (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

create policy "admins delete lojas" on public.lojas
  for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

-- Loja existente vira o registro de backfill para todo o histórico atual.
insert into public.lojas (nome, marketplace, status)
values ('Loja principal', 'shopee', 'ativa');

-- ===== 2. shopee_connection: liga cada credencial a uma loja =====

alter table public.shopee_connection
  add column loja_id bigint references public.lojas(id);

update public.shopee_connection
  set loja_id = (select id from public.lojas order by id limit 1)
  where loja_id is null;

alter table public.shopee_connection
  alter column loja_id set not null;

drop index if exists public.uq_shopee_connection_app;
drop index if exists public.shopee_connection_app_tipo_key;

create unique index shopee_connection_loja_app_key
  on public.shopee_connection (loja_id, app_tipo);

drop view if exists public.shopee_connection_status;
create view public.shopee_connection_status
with (security_invoker = true) as
  select id, loja_id, app_tipo, partner_id, shop_id, shop_name, token_expires_at, status, updated_at
  from public.shopee_connection;

grant select on public.shopee_connection_status to authenticated;

grant select (id, loja_id, app_tipo, partner_id, shop_id, shop_name, token_expires_at, status, updated_at)
  on public.shopee_connection to authenticated;

-- ===== 3. loja_id nas tabelas de negócio (aditivo: nullable -> backfill -> not null) =====

-- pedidos
alter table public.pedidos add column loja_id bigint references public.lojas(id);
update public.pedidos set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.pedidos alter column loja_id set not null;

-- produtos
alter table public.produtos add column loja_id bigint references public.lojas(id);
update public.produtos set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.produtos alter column loja_id set not null;

-- produto_custos
alter table public.produto_custos add column loja_id bigint references public.lojas(id);
update public.produto_custos set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.produto_custos alter column loja_id set not null;

-- ads_campanhas
alter table public.ads_campanhas add column loja_id bigint references public.lojas(id);
update public.ads_campanhas set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.ads_campanhas alter column loja_id set not null;

-- ads_gasto_horario
alter table public.ads_gasto_horario add column loja_id bigint references public.lojas(id);
update public.ads_gasto_horario set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.ads_gasto_horario alter column loja_id set not null;

-- avaliacoes
alter table public.avaliacoes add column loja_id bigint references public.lojas(id);
update public.avaliacoes set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.avaliacoes alter column loja_id set not null;

-- carteira_transacoes
alter table public.carteira_transacoes add column loja_id bigint references public.lojas(id);
update public.carteira_transacoes set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.carteira_transacoes alter column loja_id set not null;

-- chat_envios
alter table public.chat_envios add column loja_id bigint references public.lojas(id);
update public.chat_envios set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.chat_envios alter column loja_id set not null;

-- sync_log
alter table public.sync_log add column loja_id bigint references public.lojas(id);
update public.sync_log set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.sync_log alter column loja_id set not null;

-- alertas_enviados
alter table public.alertas_enviados add column loja_id bigint references public.lojas(id);
update public.alertas_enviados set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.alertas_enviados alter column loja_id set not null;

-- eventos_log: já tem shop_id (bruto, do payload da Shopee). loja_id fica
-- opcional (nullable) porque nem todo evento histórico tem shop_id resolvível.
alter table public.eventos_log add column loja_id bigint references public.lojas(id);
update public.eventos_log e
  set loja_id = sc.loja_id
  from public.shopee_connection sc
  where e.shop_id is not null and e.shop_id = sc.shop_id and e.loja_id is null;

-- ===== 4. pedido_itens: acompanha a loja do pedido pai =====

alter table public.pedido_itens add column loja_id bigint references public.lojas(id);
update public.pedido_itens pi
  set loja_id = p.loja_id
  from public.pedidos p
  where pi.order_sn = p.order_sn and pi.loja_id is null;
-- Itens órfãos (sem pedido correspondente) ficam na loja principal, se houver.
update public.pedido_itens
  set loja_id = (select id from public.lojas order by id limit 1)
  where loja_id is null;
alter table public.pedido_itens alter column loja_id set not null;

-- ===== 5. Constraints únicas passam a ser por loja =====

alter table public.pedido_itens drop constraint if exists pedido_itens_order_sn_fkey;

alter table public.pedidos drop constraint if exists pedidos_order_sn_key;
alter table public.pedidos add constraint pedidos_loja_order_sn_key unique (loja_id, order_sn);

alter table public.produtos drop constraint if exists produtos_item_id_key;
alter table public.produtos add constraint produtos_loja_item_id_key unique (loja_id, item_id, model_id);

alter table public.pedido_itens
  add constraint pedido_itens_loja_order_sn_fkey
  foreign key (loja_id, order_sn) references public.pedidos (loja_id, order_sn) on delete cascade;

-- ===== 6. Trigger de pedidos -> pedido_itens passa a levar loja_id junto =====

create or replace function public.trg_pedidos_itens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pedido_itens where order_sn = new.order_sn and loja_id = new.loja_id;
  if new.itens is not null and jsonb_typeof(new.itens) = 'array' then
    insert into public.pedido_itens (
      loja_id, order_sn, item_id, model_id, produto, sku,
      quantidade, preco_unitario, receita,
      status_pedido, data_criacao_pedido
    )
    select
      new.loja_id,
      new.order_sn,
      coalesce((i->>'item_id')::bigint, 0),
      coalesce((i->>'model_id')::bigint, 0),
      i->>'item_name',
      coalesce(nullif(i->>'model_sku', ''), nullif(i->>'item_sku', ''), 'SEM_SKU'),
      coalesce((i->>'model_quantity_purchased')::integer, 0),
      coalesce((i->>'model_discounted_price')::numeric, 0),
      coalesce((i->>'model_quantity_purchased')::numeric, 0)
        * coalesce((i->>'model_discounted_price')::numeric, 0),
      new.status,
      new.data_criacao_pedido
    from jsonb_array_elements(new.itens) as i;
  end if;
  return new;
end;
$$;
