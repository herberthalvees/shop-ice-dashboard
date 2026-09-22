-- ============================================================
-- APLICAÇÃO DE EMERGÊNCIA: todas as migrações multi-loja pendentes
-- Protegido em uma transação — se qualquer coisa falhar, desfaz tudo.
-- ============================================================
begin;

-- ===== 20260805190000_a3f4e2c1-8b9d-4e6a-b3c2-1f5d9e8a7c60.sql =====
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

-- ===== 20260805191000_b7e5d3a2-9c1f-4d8e-a5b6-2e7f0c9b8d41.sql =====
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
  pi.data_criacao_pedido, pi.created_at,
  c.custo_unitario as custo_vigente,
  pi.quantidade::numeric * c.custo_unitario as custo_total,
  pi.marketplace
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

-- ===== 20260921180000_e4c1a9f0-3b2d-4a7c-9e5f-6d8b1c2a4f70.sql =====
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

-- ===== 20260921190000_f2a8c4d1-5e3b-4a7c-9d1e-6c2b8a4f0e93.sql =====
-- ============================================================
-- Correção da constraint única de produtos (Etapa 1 corrigida)
-- A chave natural real é (item_id, model_id) — cada produto pode
-- ter várias variações, cada uma com seu próprio model_id
-- (confirmado via export direto da tabela de produção). A
-- primeira tentativa da Etapa 1 criou uma constraint (loja_id,
-- item_id) sem o model_id, que já foi aplicada neste ambiente de
-- teste; esta migration corrige o que ficou errado.
-- ============================================================

alter table public.produtos drop constraint if exists produtos_loja_item_id_key;
alter table public.produtos drop constraint if exists produtos_item_id_model_id_key;

alter table public.produtos
  add constraint produtos_loja_item_id_key unique (loja_id, item_id, model_id);

-- ===== 20260921200000_a7e3f9c2-4b8d-4f1e-9c6a-2d5b8e0f4a17.sql =====
-- ============================================================
-- aplicar_produtos passa a gravar por loja
-- ============================================================

create or replace function public.aplicar_produtos(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.produtos (
    loja_id, item_id, model_id, sku, produto, variacao,
    preco_atual, preco_original, estoque_disponivel,
    estoque_reservado, status_item, imagem_url, atualizado_em
  )
  select
    p_loja_id,
    (d->>'item_id')::bigint,
    coalesce((d->>'model_id')::bigint, 0),
    nullif(d->>'sku', ''),
    d->>'produto',
    nullif(d->>'variacao', ''),
    nullif(d->>'preco_atual', '')::numeric,
    nullif(d->>'preco_original', '')::numeric,
    nullif(d->>'estoque_disponivel', '')::integer,
    nullif(d->>'estoque_reservado', '')::integer,
    nullif(d->>'status_item', ''),
    nullif(d->>'imagem_url', ''),
    now()
  from jsonb_array_elements(p_dados) as d
  on conflict (loja_id, item_id, model_id) do update set
    sku = excluded.sku,
    produto = excluded.produto,
    variacao = excluded.variacao,
    preco_atual = excluded.preco_atual,
    preco_original = excluded.preco_original,
    estoque_disponivel = excluded.estoque_disponivel,
    estoque_reservado = excluded.estoque_reservado,
    status_item = excluded.status_item,
    imagem_url = excluded.imagem_url,
    atualizado_em = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.aplicar_produtos(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.aplicar_produtos(jsonb, bigint) to service_role;

-- A assinatura antiga (sem loja) não é mais chamada por ninguém; remove
-- para não sobrar uma versão que grava sem loja_id (que agora é NOT NULL,
-- então ela nem funcionaria mais).
drop function if exists public.aplicar_produtos(jsonb);

-- ===== 20260921210000_b3d7e5f2-8a1c-4e6d-b9f3-5c8a2e1d4b76.sql =====
-- ============================================================
-- ads_campanhas / aplicar_ads passam a gravar por loja
-- ============================================================

alter table public.ads_campanhas drop constraint if exists ads_campanhas_campaign_id_data_key;
alter table public.ads_campanhas
  add constraint ads_campanhas_loja_campaign_data_key unique (loja_id, campaign_id, data);

create or replace function public.aplicar_ads(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.ads_campanhas (
    loja_id, campaign_id, nome, item_id, status, data, investimento,
    impressoes, cliques, ctr, pedidos, receita, roas, payload
  )
  select distinct on ((d->>'campaign_id')::bigint, (d->>'data')::timestamptz)
    p_loja_id,
    (d->>'campaign_id')::bigint,
    d->>'nome',
    nullif(d->>'item_id','')::bigint,
    d->>'status',
    (d->>'data')::timestamptz,
    nullif(d->>'investimento','')::numeric,
    nullif(d->>'impressoes','')::bigint,
    nullif(d->>'cliques','')::bigint,
    nullif(d->>'ctr','')::numeric,
    nullif(d->>'pedidos','')::bigint,
    nullif(d->>'receita','')::numeric,
    nullif(d->>'roas','')::numeric,
    d
  from jsonb_array_elements(p_dados) as d
  on conflict (loja_id, campaign_id, data) do update set
    nome = coalesce(excluded.nome, ads_campanhas.nome),
    item_id = coalesce(excluded.item_id, ads_campanhas.item_id),
    status = coalesce(excluded.status, ads_campanhas.status),
    investimento = excluded.investimento,
    impressoes = excluded.impressoes,
    cliques = excluded.cliques,
    ctr = excluded.ctr,
    pedidos = excluded.pedidos,
    receita = excluded.receita,
    roas = excluded.roas,
    payload = excluded.payload;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.aplicar_ads(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.aplicar_ads(jsonb, bigint) to service_role;

drop function if exists public.aplicar_ads(jsonb);

-- ===== 20260921220000_d9c1a3e6-2f7b-4b0d-8e4a-1c6f9b3d5e82.sql =====
-- ============================================================
-- carteira_transacoes / aplicar_carteira passam a gravar por loja
-- transaction_id era PRIMARY KEY sozinho; vira único junto com
-- loja_id (sem FK apontando pra cá, seguro trocar a PK).
-- ============================================================

alter table public.carteira_transacoes drop constraint if exists carteira_transacoes_pkey;
alter table public.carteira_transacoes
  add constraint carteira_transacoes_loja_transaction_key unique (loja_id, transaction_id);

create or replace function public.aplicar_carteira(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  with unicos as (
    select distinct on ((d.value->>'transaction_id')::bigint)
      d.value as item
    from jsonb_array_elements(p_dados) as d
    where d.value->>'transaction_id' is not null
    order by
      (d.value->>'transaction_id')::bigint,
      (d.value->>'create_time')::bigint desc
  )
  insert into public.carteira_transacoes (
    loja_id, transaction_id, status, wallet_type, tipo, tab_type, fluxo,
    valor, taxa, saldo_apos, order_sn, refund_sn, withdrawal_id,
    withdrawal_type, descricao, comprador, data_transacao, payload
  )
  select
    p_loja_id,
    (item->>'transaction_id')::bigint,
    item->>'status',
    item->>'wallet_type',
    item->>'transaction_type',
    item->>'transaction_tab_type',
    item->>'money_flow',
    nullif(item->>'amount','')::numeric,
    nullif(item->>'transaction_fee','')::numeric,
    nullif(item->>'current_balance','')::numeric,
    nullif(item->>'order_sn',''),
    nullif(item->>'refund_sn',''),
    nullif(item->>'withdrawal_id','')::bigint,
    nullif(item->>'withdrawal_type',''),
    item->>'description',
    nullif(item->>'buyer_name',''),
    to_timestamp((item->>'create_time')::bigint),
    item
  from unicos
  on conflict (loja_id, transaction_id) do update set
    status = excluded.status,
    saldo_apos = excluded.saldo_apos,
    payload = excluded.payload;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.aplicar_carteira(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.aplicar_carteira(jsonb, bigint) to service_role;

drop function if exists public.aplicar_carteira(jsonb);

-- ===== 20260921230000_e5f2a8c4-9d3b-4e1f-8a6c-3d7b9e2f5c04.sql =====
-- ============================================================
-- Escrow passa a operar por loja
-- ============================================================

create or replace function public.pedidos_escrow_pendentes(
  p_limite integer default 300,
  p_loja_id bigint default null
)
returns table (order_sn text)
language sql
stable
set search_path = public
as $$
  select p.order_sn
  from public.pedidos p
  where (p_loja_id is null or p.loja_id = p_loja_id)
    and p.status not in ('UNPAID', 'CANCELLED')
    and (
      p.escrow_atualizado_em is null
      or (
        p.status <> 'COMPLETED'
        and p.escrow_atualizado_em < now() - interval '24 hours'
      )
    )
  order by p.data_criacao_pedido desc
  limit p_limite;
$$;

create or replace function public.aplicar_escrow(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.pedidos p
  set
    valor_liquido = nullif(d->>'valor_liquido', '')::numeric,
    comissao = nullif(d->>'comissao', '')::numeric,
    taxa_servico = nullif(d->>'taxa_servico', '')::numeric,
    taxa_transacao = nullif(d->>'taxa_transacao', '')::numeric,
    escrow_payload = d->'payload',
    escrow_atualizado_em = now(),
    updated_at = now()
  from jsonb_array_elements(p_dados) as d
  where p.order_sn = d->>'order_sn' and p.loja_id = p_loja_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.pedidos_escrow_pendentes(integer, bigint) from public;
revoke execute on function public.aplicar_escrow(jsonb, bigint) from public;
grant execute on function public.pedidos_escrow_pendentes(integer, bigint) to service_role;
grant execute on function public.aplicar_escrow(jsonb, bigint) to service_role;

drop function if exists public.aplicar_escrow(jsonb);
drop function if exists public.pedidos_escrow_pendentes(integer);

-- ===== 20260921240000_c8f4b2a9-6e1d-4c3f-9a7b-4e2c8d5f1a93.sql =====
-- ============================================================
-- Pós-venda passa a operar por loja (contatos e envios manuais)
-- ============================================================

alter table public.pv_contatos add column if not exists loja_id bigint references public.lojas(id);
update public.pv_contatos set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.pv_contatos alter column loja_id set not null;

alter table public.pv_contatos drop constraint if exists pv_contatos_pkey;
alter table public.pv_contatos add constraint pv_contatos_pkey primary key (loja_id, to_id);

alter table public.pv_envios_manuais add column if not exists loja_id bigint references public.lojas(id);
update public.pv_envios_manuais set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.pv_envios_manuais alter column loja_id set not null;

-- ===== 20260922010000_d4a8f6c2-1b9e-4a3d-8c5f-7e2a9d4b6f18.sql =====
-- ============================================================
-- Resumo diário do WhatsApp passa a rodar por loja: as funções de
-- KPI/carteira/ads usadas por ele ganham p_loja_id opcional
-- (null = todas as lojas juntas, comportamento igual ao de hoje).
-- ============================================================

-- pedido_itens_custeado precisa expor loja_id (só pode ser
-- acrescentado ao final da lista de colunas da view).
create or replace view public.pedido_itens_custeado
with (security_invoker = on) as
select
  pi.id, pi.order_sn, pi.item_id, pi.model_id, pi.produto, pi.sku,
  pi.quantidade, pi.preco_unitario, pi.receita, pi.status_pedido,
  pi.data_criacao_pedido, pi.created_at,
  c.custo_unitario as custo_vigente,
  pi.quantidade::numeric * c.custo_unitario as custo_total,
  pi.marketplace,
  pi.loja_id
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

-- ads_totais_periodo ganha p_loja_id
drop function if exists public.ads_totais_periodo(date, date);

create or replace function public.ads_totais_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table (
  investimento numeric,
  receita numeric,
  pedidos bigint,
  cliques bigint,
  impressoes bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  with por_dia as (
    select
      ac.data::date as dia,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.investimento) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.investimento) filter (where ac.item_id is not null), 0)
      end as investimento,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.receita) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.receita) filter (where ac.item_id is not null), 0)
      end as receita,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.pedidos) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.pedidos) filter (where ac.item_id is not null), 0)
      end as pedidos,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.cliques) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.cliques) filter (where ac.item_id is not null), 0)
      end as cliques,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.impressoes) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.impressoes) filter (where ac.item_id is not null), 0)
      end as impressoes
    from public.ads_campanhas as ac
    where ac.data::date between p_de and p_ate
      and (p_loja_id is null or ac.loja_id = p_loja_id)
    group by ac.data::date
  )
  select
    coalesce(sum(pd.investimento), 0)::numeric,
    coalesce(sum(pd.receita), 0)::numeric,
    coalesce(sum(pd.pedidos), 0)::bigint,
    coalesce(sum(pd.cliques), 0)::bigint,
    coalesce(sum(pd.impressoes), 0)::bigint
  from por_dia as pd;
$function$;

revoke all on function public.ads_totais_periodo(date, date, bigint) from public, anon, authenticated;
grant execute on function public.ads_totais_periodo(date, date, bigint) to service_role;

-- ads_resumo passa o p_loja_id adiante
drop function if exists public.ads_resumo(date, date);

create or replace function public.ads_resumo(p_de date, p_ate date, p_loja_id bigint default null)
returns table (
  investimento numeric, receita numeric, pedidos bigint,
  roas numeric, acos numeric, tacos numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with a as (
    select * from public.ads_totais_periodo(p_de, p_ate, p_loja_id)
  ),
  fat as (
    select coalesce(sum(p.valor_total), 0) as total
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or p.loja_id = p_loja_id)
  )
  select
    a.investimento,
    a.receita,
    a.pedidos,
    case when a.investimento = 0 then 0 else round(a.receita / a.investimento, 2) end,
    case when a.receita = 0 then 0 else round(100.0 * a.investimento / a.receita, 2) end,
    case when f.total = 0 then 0 else round(100.0 * a.investimento / f.total, 2) end
  from a cross join fat as f;
end;
$function$;

revoke all on function public.ads_resumo(date, date, bigint) from public, anon;
grant execute on function public.ads_resumo(date, date, bigint) to authenticated;

-- dashboard_kpis_periodo_impl ganha p_loja_id
drop function if exists public.dashboard_kpis_periodo_impl(date, date);
drop function if exists public.dashboard_kpis_periodo(date, date);

create or replace function public.dashboard_kpis_periodo_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language sql
stable
set search_path TO 'public'
as $function$
  with validos as (
    select p.valor_total,
           case
             when p.valor_liquido is not null then p.valor_liquido
             else coalesce(p.valor_total,0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1)
           end as valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
             + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'TO_RETURN'
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  custos as (
    select
      coalesce(sum(pic.custo_total), 0) as custo,
      coalesce(sum(pic.quantidade), 0) as unid,
      coalesce(sum(pic.quantidade) filter (
        where pic.custo_vigente is not null), 0) as unid_com_custo
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads as (
    select coalesce(sum(investimento), 0) as investimento
    from public.ads_totais_periodo(p_de, p_ate, p_loja_id)
  ),
  cfg as (
    select coalesce(max(aliquota_imposto), 0) as aliq from public.config
  ),
  t as (
    select
      (select count(*) from validos) as qt,
      (select coalesce(sum(valor_total), 0) from validos) as fat,
      (select coalesce(sum(valor_liquido), 0) from validos) as liq,
      (select coalesce(sum(taxa), 0) from validos) as tax,
      (select custo from custos) as custo,
      (select unid from custos) as unid,
      (select unid_com_custo from custos) as unid_cc,
      (select aliq from cfg) as aliq,
      (select qtd from cancelados) as canc_qt,
      (select valor from cancelados) as canc_vl,
      (select qtd from devolvidos) as dev_qt,
      (select valor from devolvidos) as dev_vl,
      (select investimento from ads) as ads_inv
  )
  select
    t.qt::bigint,
    t.unid::bigint,
    round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint,
    round(t.canc_vl, 2),
    t.dev_qt::bigint,
    round(t.dev_vl, 2),
    round(t.tax, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0
               else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2),
    round(t.aliq, 2),
    round(t.liq, 2),
    round(t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.ads_inv / t.fat end, 1),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0
               else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.fat end, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv, 2),
    round(case when t.fat = 0 then 0
               else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.fat end, 2),
    round(case when t.qt = 0 then 0
               else (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.qt end, 2)
  from t;
$function$;

create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_periodo_impl(p_de, p_ate, p_loja_id);
end;
$function$;

revoke all on function public.dashboard_kpis_periodo_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_kpis_periodo_impl(date, date, bigint) to service_role;
revoke all on function public.dashboard_kpis_periodo(date, date, bigint) from public, anon;
grant execute on function public.dashboard_kpis_periodo(date, date, bigint) to authenticated, service_role;

-- carteira_resumo_impl ganha p_loja_id
drop function if exists public.carteira_resumo_impl(date, date);
drop function if exists public.carteira_resumo(date, date);

create or replace function public.carteira_resumo_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
language sql
stable
set search_path TO 'public'
as $function$
  with ultimo as (
    select saldo_apos, data_transacao
    from public.carteira_transacoes
    where (p_loja_id is null or loja_id = p_loja_id)
    order by data_transacao desc, transaction_id desc
    limit 1
  ),
  periodo as (
    select
      coalesce(sum(valor) filter (where fluxo = 'MONEY_IN'), 0) as ent,
      coalesce(sum(abs(valor)) filter (where fluxo = 'MONEY_OUT'), 0) as sai,
      coalesce(sum(abs(valor)) filter (
        where withdrawal_id is not null and withdrawal_id > 0), 0) as saq
    from public.carteira_transacoes
    where (data_transacao at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  transito as (
    select
      coalesce(sum(p.valor_liquido), 0) as valor,
      count(*)::bigint as qtd
    from public.pedidos p
    where p.valor_liquido is not null
      and p.status not in ('UNPAID', 'CANCELLED')
      and (p_loja_id is null or p.loja_id = p_loja_id)
      and not exists (
        select 1 from public.carteira_transacoes c
        where c.order_sn = p.order_sn and c.fluxo = 'MONEY_IN'
          and (p_loja_id is null or c.loja_id = p_loja_id)
      )
  )
  select
    (select saldo_apos from ultimo),
    (select data_transacao from ultimo),
    (select ent from periodo),
    (select sai from periodo),
    (select saq from periodo),
    (select valor from transito),
    (select qtd from transito);
$function$;

create or replace function public.carteira_resumo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.carteira_resumo_impl(p_de, p_ate, p_loja_id);
end;
$function$;

revoke all on function public.carteira_resumo_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.carteira_resumo_impl(date, date, bigint) to service_role;
revoke all on function public.carteira_resumo(date, date, bigint) from public, anon;
grant execute on function public.carteira_resumo(date, date, bigint) to authenticated, service_role;

-- ===== 20260922020000_f1e9c3a7-5d2b-4c8e-9a1f-3b6d8e0c4f52.sql =====
-- ============================================================
-- Registra no controle de versão os pg_cron jobs de sync que já
-- rodavam em produção fora do histórico rastreado (criados direto
-- no SQL Editor). cron.schedule() com um jobname já existente
-- atualiza o job em vez de duplicar, então é seguro reaplicar.
-- Valores (URL/params/secret) copiados 1:1 da consulta a cron.job
-- feita em produção em 2026-09-22.
-- ============================================================

select cron.schedule(
  'shopee-sync-10min',
  '*/10 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync?dias=0.05&campo=update_time&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-produtos',
  '0 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-produtos?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-ads',
  '0 */3 * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-ads?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-carteira',
  '*/30 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-carteira?horas=3&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-escrow',
  '*/15 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-escrow?limite=300&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-chat',
  '*/5 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-chat?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 60000)$$
);

-- ===== 20260922030000_b6c1e4a8-2f9d-4e7b-9a3c-5d8f1e6b0c74.sql =====
-- ============================================================
-- Custo compartilhado entre lojas por SKU: quando um item de uma
-- loja secundária não tem custo próprio cadastrado, mas o mesmo SKU
-- já tem custo vigente na loja principal (menor id ativo), usa esse
-- valor. Nunca sobrescreve um custo já cadastrado especificamente
-- para a própria loja/item.
-- ============================================================

create or replace view public.pedido_itens_custeado
with (security_invoker = on) as
select
  pi.id, pi.order_sn, pi.item_id, pi.model_id, pi.produto, pi.sku,
  pi.quantidade, pi.preco_unitario, pi.receita, pi.status_pedido,
  pi.data_criacao_pedido, pi.created_at,
  coalesce(c.custo_unitario, cf.custo_unitario) as custo_vigente,
  pi.quantidade::numeric * coalesce(c.custo_unitario, cf.custo_unitario) as custo_total,
  pi.marketplace,
  pi.loja_id
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
) c on true
left join lateral (
  select pc2.custo_unitario
  from public.produtos pp
  join public.produto_custos pc2
    on pc2.item_id = pp.item_id and pc2.model_id = pp.model_id
  where c.custo_unitario is null
    and nullif(pi.sku, '') is not null
    and pp.sku = pi.sku
    and pp.loja_id = (select min(id) from public.lojas where status = 'ativa')
    and pc2.vigencia_inicio <= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
    and coalesce(pc2.vigencia_fim, '9999-12-31'::date) >= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
  order by pc2.vigencia_inicio desc
  limit 1
) cf on true;

grant select on public.pedido_itens_custeado to authenticated;

-- analise_margem_sku_impl faz seu próprio lookup de "custo atual"
-- (fora da view acima) — ganha o mesmo fallback. O nome já é
-- "_impl" porque a função pública analise_margem_sku(date,date) foi
-- renomeada para isto num migration anterior e virou um wrapper fino
-- que só checa eh_owner() e delega pra cá; não tocamos no wrapper.
create or replace function public.analise_margem_sku_impl(p_de date, p_ate date)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      pic.item_id,
      pic.model_id,
      sum(pic.quantidade)::bigint as unidades,
      case when sum(pic.quantidade) = 0 then null
           else sum(pic.receita) / sum(pic.quantidade) end as preco_vendido,
      case when sum(pic.quantidade) filter (where pic.custo_vigente is not null) = 0
           then null
           else sum(pic.custo_total) filter (where pic.custo_vigente is not null)
                / sum(pic.quantidade) filter (where pic.custo_vigente is not null)
      end as custo_medio
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    group by pic.item_id, pic.model_id
  ),
  calc as (
    select
      p.item_id,
      p.model_id,
      p.sku,
      coalesce(p.produto, '') || case
        when nullif(p.variacao, '') is null then ''
        else ' - ' || p.variacao
      end as produto,
      coalesce(v.unidades, 0)::bigint as unidades,
      coalesce(v.preco_vendido, p.preco_atual) as preco_medio,
      v.custo_medio,
      coalesce(atual.custo_unitario, atual_fallback.custo_unitario) as custo_atual
    from public.produtos p
    left join vendas v
      on v.item_id = p.item_id and v.model_id = p.model_id
    left join lateral (
      select pc.custo_unitario
      from public.produto_custos pc
      where pc.item_id = p.item_id
        and pc.model_id = p.model_id
        and pc.vigencia_fim is null
      order by pc.vigencia_inicio desc
      limit 1
    ) atual on true
    left join lateral (
      select pc2.custo_unitario
      from public.produtos pp
      join public.produto_custos pc2
        on pc2.item_id = pp.item_id and pc2.model_id = pp.model_id
      where atual.custo_unitario is null
        and nullif(p.sku, '') is not null
        and pp.sku = p.sku
        and pp.loja_id = (select min(id) from public.lojas where status = 'ativa')
        and pc2.vigencia_fim is null
      order by pc2.vigencia_inicio desc
      limit 1
    ) atual_fallback on true
  ),
  fim as (
    select c.*,
           coalesce(c.custo_medio, c.custo_atual) as custo_periodo,
           c.preco_medio * 0.80 - 4.00 as liquido_un
    from calc c
  )
  select
    f.item_id, f.model_id, f.sku, f.produto, f.unidades,
    round(f.preco_medio, 2),
    round(f.custo_periodo, 4),
    round(f.custo_atual, 4),
    round(f.liquido_un, 2),
    case when f.custo_periodo is null then null
         else round(f.liquido_un - f.custo_periodo, 2) end,
    case when f.custo_periodo is null or coalesce(f.preco_medio, 0) = 0 then null
         else round(100.0 * (f.liquido_un - f.custo_periodo) / f.preco_medio, 1) end,
    case when f.custo_atual is null then null
         else round((f.custo_atual + 4.00) / 0.80, 2) end,
    case when f.custo_atual is null
           or (f.liquido_un - f.custo_atual) <= 0 then null
         else round(f.preco_medio / (f.liquido_un - f.custo_atual), 2) end,
    case
      when f.custo_periodo is null then 'sem custo'
      when f.liquido_un - f.custo_periodo < 0 then 'prejuizo'
      when 100.0 * (f.liquido_un - f.custo_periodo)
           / nullif(f.preco_medio, 0) < 10 then 'margem baixa'
      else 'ok'
    end
  from fim f
  order by f.unidades desc, f.produto;
$function$;

-- ===== 20260922040000_a3e7c5b1-4f2d-4c9e-8a1b-6d5f3e0c8a92.sql =====
-- ============================================================
-- Etapa 4: filtro global de loja. Todas as RPCs de relatório ainda
-- sem suporte a loja ganham p_loja_id bigint default null (null =
-- todas as lojas somadas, comportamento idêntico ao de hoje —
-- mudança aditiva, nenhuma chamada existente quebra).
-- ============================================================

-- ---------- dashboard_kpis_parcial ----------
drop function if exists public.dashboard_kpis_parcial_impl(date, date, integer, text);
drop function if exists public.dashboard_kpis_parcial(date, date, integer, text);

create or replace function public.dashboard_kpis_parcial_impl(
  p_de date, p_ate date, p_minuto_max integer, p_marketplace text default null, p_loja_id bigint default null
)
returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
language sql
stable
set search_path to 'public'
as $function$
  with validos as (
    select p.valor_total,
           case when p.valor_liquido is not null then p.valor_liquido
                else coalesce(p.valor_total,0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1) end as valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from p.data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from p.data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and status = 'CANCELLED'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and status = 'TO_RETURN'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  custos as (
    select coalesce(sum(pic.custo_total), 0) as custo,
           coalesce(sum(pic.quantidade), 0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null), 0) as unid_com_custo
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from pic.data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from pic.data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads as (
    select case when p_marketplace = 'tiktok' then 0
                when p_minuto_max is null then (select coalesce(sum(investimento),0) from public.ads_totais_periodo(p_de, p_ate, p_loja_id))
                else (select coalesce(sum(g.investimento),0) from public.ads_gasto_horario g
                      where g.data between p_de and p_ate and g.hora <= (p_minuto_max / 60)
                        and (p_loja_id is null or g.loja_id = p_loja_id))
           end as investimento
  ),
  cfg as (select coalesce(max(aliquota_imposto), 0) as aliq from public.config),
  t as (
    select
      (select count(*) from validos) as qt,
      (select coalesce(sum(valor_total), 0) from validos) as fat,
      (select coalesce(sum(valor_liquido), 0) from validos) as liq,
      (select coalesce(sum(taxa), 0) from validos) as tax,
      (select custo from custos) as custo,
      (select unid from custos) as unid,
      (select unid_com_custo from custos) as unid_cc,
      (select aliq from cfg) as aliq,
      (select qtd from cancelados) as canc_qt,
      (select valor from cancelados) as canc_vl,
      (select qtd from devolvidos) as dev_qt,
      (select valor from devolvidos) as dev_vl,
      (select investimento from ads) as ads_inv
  )
  select
    t.qt::bigint,
    t.unid::bigint,
    round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint,
    round(t.canc_vl, 2),
    t.dev_qt::bigint,
    round(t.dev_vl, 2),
    round(t.tax, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0 else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2),
    round(t.aliq, 2),
    round(t.liq, 2),
    round(t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.ads_inv / t.fat end, 1),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.fat end, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.fat end, 2),
    round(case when t.qt = 0 then 0 else (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.qt end, 2)
  from t;
$function$;

create or replace function public.dashboard_kpis_parcial(
  p_de date, p_ate date, p_minuto_max integer, p_marketplace text default null, p_loja_id bigint default null
)
returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_parcial_impl(p_de, p_ate, p_minuto_max, p_marketplace, p_loja_id);
end;
$function$;

revoke all on function public.dashboard_kpis_parcial_impl(date, date, integer, text, bigint) from public, anon, authenticated;
revoke all on function public.dashboard_kpis_parcial(date, date, integer, text, bigint) from public, anon;
grant execute on function public.dashboard_kpis_parcial(date, date, integer, text, bigint) to authenticated, service_role;

-- ---------- dashboard_serie_periodo ----------
drop function if exists public.dashboard_serie_periodo_impl(date, date);
drop function if exists public.dashboard_serie_periodo(date, date);

create or replace function public.dashboard_serie_periodo_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language sql stable set search_path to 'public'
as $function$
  with cfg as (
    select
      case
        when (p_ate - p_de) > 90 then 'mes'
        when (p_ate - p_de) > 31 then 'semana'
        else 'dia'
      end as gran,
      (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  calendario as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month', d)::date
        when 'semana' then date_trunc('week', d)::date
        else d::date
      end as periodo
    from generate_series(p_de, p_ate, interval '1 day') as d
    group by 1
  ),
  vendas as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month',
          (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        when 'semana' then date_trunc('week',
          (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        else (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
      end as periodo,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      ), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and (p_loja_id is null or loja_id = p_loja_id)
    group by 1
  )
  select
    c.periodo,
    case (select gran from cfg)
      when 'mes' then to_char(c.periodo, 'MM/YYYY')
      when 'semana' then to_char(c.periodo, 'DD/MM')
      else to_char(c.periodo, 'DD/MM')
    end,
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    c.periodo = (select hoje from cfg)
  from calendario c
  left join vendas v on v.periodo = c.periodo
  order by c.periodo;
$function$;

create or replace function public.dashboard_serie_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento, s.parcial
    from public.dashboard_serie_periodo_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

revoke execute on function public.dashboard_serie_periodo_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_serie_periodo(date, date, bigint) to authenticated;

-- ---------- dashboard_top_produtos_periodo ----------
drop function if exists public.dashboard_top_produtos_periodo_impl(date, date, integer);
drop function if exists public.dashboard_top_produtos_periodo(date, date, integer);

create or replace function public.dashboard_top_produtos_periodo_impl(p_de date, p_ate date, p_limite integer default 10, p_loja_id bigint default null)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language sql stable set search_path to 'public'
as $function$
  select
    max(pi.produto),
    pi.sku,
    sum(pi.quantidade)::bigint,
    sum(pi.receita)::numeric
  from public.pedido_itens pi
  where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
        between p_de and p_ate
    and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    and (p_loja_id is null or pi.loja_id = p_loja_id)
  group by pi.sku
  order by 3 desc
  limit p_limite;
$function$;

create or replace function public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

revoke execute on function public.dashboard_top_produtos_periodo_impl(date, date, integer, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_top_produtos_periodo(date, date, integer, bigint) to authenticated;

-- ---------- dashboard_curva_abc ----------
drop function if exists public.dashboard_curva_abc_impl(date, date, integer);
drop function if exists public.dashboard_curva_abc(date, date, integer);

create or replace function public.dashboard_curva_abc_impl(p_de date, p_ate date, p_limite integer default 20, p_loja_id bigint default null)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      max(pi.produto) as produto,
      pi.sku,
      sum(pi.quantidade)::bigint as unidades,
      sum(pi.receita) as receita
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or pi.loja_id = p_loja_id)
    group by pi.sku
  ),
  total as (select nullif(sum(receita), 0) as tot from vendas),
  ranked as (
    select
      v.*,
      100.0 * v.receita / (select tot from total) as part,
      100.0 * sum(v.receita) over (order by v.receita desc
        rows between unbounded preceding and current row)
        / (select tot from total) as acum
    from vendas v
  )
  select
    r.produto, r.sku, r.unidades, round(r.receita, 2),
    round(r.part, 2), round(r.acum, 2),
    case when r.acum <= 80 then 'A'
         when r.acum <= 95 then 'B'
         else 'C' end
  from ranked r
  order by r.receita desc
  limit p_limite;
$function$;

create or replace function public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

revoke execute on function public.dashboard_curva_abc_impl(date, date, integer, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_curva_abc(date, date, integer, bigint) to authenticated;

-- ---------- dashboard_serie_horaria ----------
drop function if exists public.dashboard_serie_horaria_impl(date, date);
drop function if exists public.dashboard_serie_horaria(date, date);

create or replace function public.dashboard_serie_horaria_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with horas as (
    select h::smallint as hora from generate_series(0, 23) h
  ),
  vendas as (
    select
      extract(hour from (data_criacao_pedido at time zone 'America/Sao_Paulo'))::smallint as hora,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      ), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_loja_id is null or loja_id = p_loja_id)
    group by 1
  ),
  ads_real as (
    select g.hora, sum(g.investimento)::numeric as valor
    from public.ads_gasto_horario g
    where g.data between p_de and p_ate
      and (p_loja_id is null or g.loja_id = p_loja_id)
    group by 1
  ),
  total_dia as (
    select coalesce(sum(a.investimento), 0)::numeric as total
    from public.ads_campanhas a
    where a.data::date between p_de and p_ate
      and (p_loja_id is null or a.loja_id = p_loja_id)
  ),
  tem_real as (
    select coalesce(sum(valor), 0) > 0 as ok from ads_real
  )
  select
    h.hora,
    lpad(h.hora::text, 2, '0') || 'h',
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    case
      when (select ok from tem_real) then coalesce(ar.valor, 0)::numeric
      else ((select total from total_dia) / 24)::numeric
    end
  from horas h
  left join vendas v on v.hora = h.hora
  left join ads_real ar on ar.hora = h.hora
  order by h.hora;
end;
$function$;

create or replace function public.dashboard_serie_horaria(p_de date, p_ate date, p_loja_id bigint default null)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
    from public.dashboard_serie_horaria_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

revoke all on function public.dashboard_serie_horaria_impl(date, date, bigint) from public, anon, authenticated;
revoke all on function public.dashboard_serie_horaria(date, date, bigint) from public, anon;
grant execute on function public.dashboard_serie_horaria(date, date, bigint) to authenticated, service_role;

-- ---------- pedidos_em_transito ----------
drop function if exists public.pedidos_em_transito_impl(text);
drop function if exists public.pedidos_em_transito(text);

create or replace function public.pedidos_em_transito_impl(p_marketplace text default null, p_loja_id bigint default null)
returns table(pedidos bigint, valor numeric, unidades bigint, custo numeric, cobertura_custo numeric)
language sql
stable
set search_path to 'public'
as $$
  with ped as (
    select count(*) as qt, coalesce(sum(valor_total),0) as vl
    from public.pedidos
    where status in ('SHIPPED','TO_CONFIRM_RECEIVE')
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  itens as (
    select coalesce(sum(pic.custo_total),0) as custo,
           coalesce(sum(pic.quantidade),0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null),0) as unid_cc
    from public.pedido_itens_custeado pic
    where pic.status_pedido in ('SHIPPED','TO_CONFIRM_RECEIVE')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  )
  select ped.qt::bigint,
         round(ped.vl,2),
         itens.unid::bigint,
         round(itens.custo,2),
         round(case when itens.unid = 0 then 0 else itens.unid_cc::numeric / itens.unid end, 4)
  from ped, itens;
$$;

create or replace function public.pedidos_em_transito(p_marketplace text default null, p_loja_id bigint default null)
returns table(pedidos bigint, valor numeric, unidades bigint, custo numeric, cobertura_custo numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_em_transito_impl(p_marketplace, p_loja_id);
end;
$$;

revoke all on function public.pedidos_em_transito_impl(text, bigint) from public, anon, authenticated;
revoke all on function public.pedidos_em_transito(text, bigint) from public, anon;
grant execute on function public.pedidos_em_transito(text, bigint) to authenticated, service_role;

-- ---------- produtos_com_giro ----------
drop function if exists public.produtos_com_giro(date, date);
drop function if exists public.produtos_com_giro_impl(date, date);

create or replace function public.produtos_com_giro(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text)
language sql stable set search_path to 'public'
as $function$
  WITH dias AS (
    SELECT GREATEST((p_ate - p_de) + 1, 1) AS qtd
  ),
  vendas AS (
    SELECT
      pi.item_id,
      pi.model_id,
      SUM(pi.quantidade)::bigint AS vendidos
    FROM public.pedido_itens pi
    WHERE (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN p_de AND p_ate
      AND pi.status_pedido NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
    GROUP BY pi.item_id, pi.model_id
  )
  SELECT
    p.item_id, p.model_id, p.sku, p.produto, p.variacao,
    p.preco_atual, p.estoque_disponivel,
    COALESCE(v.vendidos, 0)::bigint,
    ROUND(COALESCE(v.vendidos, 0)::numeric / (SELECT qtd FROM dias), 2),
    CASE
      WHEN COALESCE(v.vendidos, 0) = 0 THEN NULL
      ELSE ROUND(p.estoque_disponivel
                 / (v.vendidos::numeric / (SELECT qtd FROM dias)), 1)
    END,
    p.status_item, p.imagem_url
  FROM public.produtos p
  LEFT JOIN vendas v
    ON v.item_id = p.item_id AND v.model_id = p.model_id
  WHERE (p_loja_id IS NULL OR p.loja_id = p_loja_id)
  ORDER BY COALESCE(v.vendidos, 0) DESC;
$function$;

create or replace function public.produtos_com_giro_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text)
language sql stable set search_path to 'public'
as $$ select * from public.produtos_com_giro(p_de, p_ate, p_loja_id) $$;

revoke execute on function public.produtos_com_giro_impl(date, date, bigint) from public, anon, authenticated;
revoke all on function public.produtos_com_giro(date, date, bigint) from public, anon;
grant execute on function public.produtos_com_giro(date, date, bigint) to authenticated;

-- ---------- produtos_com_ads ----------
drop function if exists public.produtos_com_ads(date, date);

create or replace function public.produtos_com_ads(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, produto text, investimento numeric, receita_ads numeric, cliques bigint, impressoes bigint, ctr numeric, roas numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with ag as (
    select
      ac.item_id as iid,
      max(ac.nome) as nome,
      coalesce(sum(ac.investimento), 0) as inv,
      coalesce(sum(ac.receita), 0) as rec,
      coalesce(sum(ac.cliques), 0)::bigint as cli,
      coalesce(sum(ac.impressoes), 0)::bigint as imp
    from public.ads_campanhas ac
    where ac.data::date between p_de and p_ate
      and ac.item_id is not null
      and ac.item_id <> 0
      and (p_loja_id is null or ac.loja_id = p_loja_id)
    group by ac.item_id
  )
  select
    ag.iid,
    coalesce((select max(pr.produto) from public.produtos pr where pr.item_id = ag.iid), ag.nome, 'Item ' || ag.iid::text),
    ag.inv,
    ag.rec,
    ag.cli,
    ag.imp,
    case when ag.imp = 0 then 0 else round(100.0 * ag.cli / ag.imp, 2) end,
    case when ag.inv = 0 then 0 else round(ag.rec / ag.inv, 2) end
  from ag
  order by ag.inv desc;
end;
$function$;

revoke all on function public.produtos_com_ads(date, date, bigint) from public, anon;
grant execute on function public.produtos_com_ads(date, date, bigint) to authenticated;

-- ---------- analise_margem_sku_impl: segunda passada, agora com p_loja_id ----------
drop function if exists public.analise_margem_sku_impl(date, date);

create or replace function public.analise_margem_sku_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      pic.item_id,
      pic.model_id,
      sum(pic.quantidade)::bigint as unidades,
      case when sum(pic.quantidade) = 0 then null
           else sum(pic.receita) / sum(pic.quantidade) end as preco_vendido,
      case when sum(pic.quantidade) filter (where pic.custo_vigente is not null) = 0
           then null
           else sum(pic.custo_total) filter (where pic.custo_vigente is not null)
                / sum(pic.quantidade) filter (where pic.custo_vigente is not null)
      end as custo_medio
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or pic.loja_id = p_loja_id)
    group by pic.item_id, pic.model_id
  ),
  calc as (
    select
      p.item_id,
      p.model_id,
      p.sku,
      coalesce(p.produto, '') || case
        when nullif(p.variacao, '') is null then ''
        else ' - ' || p.variacao
      end as produto,
      coalesce(v.unidades, 0)::bigint as unidades,
      coalesce(v.preco_vendido, p.preco_atual) as preco_medio,
      v.custo_medio,
      coalesce(atual.custo_unitario, atual_fallback.custo_unitario) as custo_atual
    from public.produtos p
    left join vendas v
      on v.item_id = p.item_id and v.model_id = p.model_id
    left join lateral (
      select pc.custo_unitario
      from public.produto_custos pc
      where pc.item_id = p.item_id
        and pc.model_id = p.model_id
        and pc.vigencia_fim is null
      order by pc.vigencia_inicio desc
      limit 1
    ) atual on true
    left join lateral (
      select pc2.custo_unitario
      from public.produtos pp
      join public.produto_custos pc2
        on pc2.item_id = pp.item_id and pc2.model_id = pp.model_id
      where atual.custo_unitario is null
        and nullif(p.sku, '') is not null
        and pp.sku = p.sku
        and pp.loja_id = (select min(id) from public.lojas where status = 'ativa')
        and pc2.vigencia_fim is null
      order by pc2.vigencia_inicio desc
      limit 1
    ) atual_fallback on true
    where (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  fim as (
    select c.*,
           coalesce(c.custo_medio, c.custo_atual) as custo_periodo,
           c.preco_medio * 0.80 - 4.00 as liquido_un
    from calc c
  )
  select
    f.item_id, f.model_id, f.sku, f.produto, f.unidades,
    round(f.preco_medio, 2),
    round(f.custo_periodo, 4),
    round(f.custo_atual, 4),
    round(f.liquido_un, 2),
    case when f.custo_periodo is null then null
         else round(f.liquido_un - f.custo_periodo, 2) end,
    case when f.custo_periodo is null or coalesce(f.preco_medio, 0) = 0 then null
         else round(100.0 * (f.liquido_un - f.custo_periodo) / f.preco_medio, 1) end,
    case when f.custo_atual is null then null
         else round((f.custo_atual + 4.00) / 0.80, 2) end,
    case when f.custo_atual is null
           or (f.liquido_un - f.custo_atual) <= 0 then null
         else round(f.preco_medio / (f.liquido_un - f.custo_atual), 2) end,
    case
      when f.custo_periodo is null then 'sem custo'
      when f.liquido_un - f.custo_periodo < 0 then 'prejuizo'
      when 100.0 * (f.liquido_un - f.custo_periodo)
           / nullif(f.preco_medio, 0) < 10 then 'margem baixa'
      else 'ok'
    end
  from fim f
  order by f.unidades desc, f.produto;
$function$;

drop function if exists public.analise_margem_sku(date, date);
create or replace function public.analise_margem_sku(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.analise_margem_sku_impl(p_de, p_ate, p_loja_id);
end; $$;

revoke execute on function public.analise_margem_sku_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.analise_margem_sku(date, date, bigint) to authenticated;

-- ---------- pedidos_detalhe / pedidos_detalhe_totais ----------
drop function if exists public.pedidos_detalhe_impl(date, date, integer, integer, text, text);
drop function if exists public.pedidos_detalhe(date, date, integer, integer, text, text);

create or replace function public.pedidos_detalhe_impl(
  p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50,
  p_busca text default null, p_status text default null, p_loja_id bigint default null
)
returns table (
  total_linhas bigint, order_sn text, data_pedido timestamptz, status text,
  produto text, sku text, imagem_url text, quantidade integer, valor numeric,
  tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric,
  lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean
)
language sql
stable
set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  lim as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  pedidos_filtrados as materialized (
    select p.order_sn, p.data_criacao_pedido, p.status, p.comprador_username,
           p.valor_liquido,
           coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
           coalesce(p.frete_real,0) as frete_pedido
    from public.pedidos p, lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
      and (p_status is null or p.status = p_status)
      and (p_loja_id is null or p.loja_id = p_loja_id)
      and (
        p_busca is null
        or p.order_sn ilike '%'||p_busca||'%'
        or p.comprador_username ilike '%'||p_busca||'%'
        or exists (
          select 1 from public.pedido_itens pi2
          where pi2.order_sn = p.order_sn
            and (pi2.sku ilike '%'||p_busca||'%' or pi2.produto ilike '%'||p_busca||'%')
        )
      )
  ),
  contagem as (select count(*) as total from pedidos_filtrados),
  pagina as (
    select * from pedidos_filtrados
    order by data_criacao_pedido desc, order_sn
    offset p_offset limit p_limite
  ),
  itens_pagina as (
    select pg.*, pic.produto, pic.sku, pic.item_id, pic.model_id, pic.quantidade,
           pic.receita, pic.custo_total,
           pic.receita / nullif(sum(pic.receita) over (partition by pg.order_sn), 0) as fatia
    from pagina pg
    join public.pedido_itens_custeado pic on pic.order_sn = pg.order_sn
  )
  select
    (select total from contagem)::bigint,
    ip.order_sn, ip.data_criacao_pedido, ip.status, ip.produto, ip.sku,
    pr.imagem_url, ip.quantidade,
    round(ip.receita,2),
    round(ip.taxa_pedido * coalesce(ip.fatia,1),2),
    round(ip.frete_pedido * coalesce(ip.fatia,1),2),
    round(ip.custo_total,2),
    round(ip.receita * (select aliq from cfg),2),
    round(
      (case when ip.valor_liquido is not null then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg), 2),
    case when ip.receita=0 then null else round(100.0*(
      (case when ip.valor_liquido is not null then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg)
    )/ip.receita,1) end,
    ip.comprador_username,
    (ip.valor_liquido is not null)
  from itens_pagina ip
  left join public.produtos pr on pr.item_id = ip.item_id and pr.model_id = ip.model_id
  order by ip.data_criacao_pedido desc, ip.order_sn;
$$;

create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer, p_limite integer, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_impl(p_de, p_ate, p_offset, p_limite, p_busca, p_status, p_loja_id);
end; $$;

drop function if exists public.pedidos_detalhe_totais_impl(date, date, text, text);
drop function if exists public.pedidos_detalhe_totais(date, date, text, text);

create or replace function public.pedidos_detalhe_totais_impl(
  p_de date, p_ate date, p_busca text default null, p_status text default null, p_loja_id bigint default null
)
returns table (
  linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric,
  custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint
)
language sql
stable
set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  lim as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  base as (
    select
      pic.receita, pic.custo_total, pic.quantidade, p.status, p.valor_liquido,
      coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedidos p
    join public.pedido_itens_custeado pic on pic.order_sn = p.order_sn
    cross join lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
      and (p_status is null or p.status = p_status)
      and (p_loja_id is null or p.loja_id = p_loja_id)
      and (
        p_busca is null
        or p.order_sn ilike '%' || p_busca || '%'
        or pic.sku ilike '%' || p_busca || '%'
        or pic.produto ilike '%' || p_busca || '%'
        or p.comprador_username ilike '%' || p_busca || '%'
      )
  )
  select
    count(*)::bigint,
    round(coalesce(sum(b.receita), 0), 2),
    round(coalesce(sum(b.taxa_pedido * coalesce(b.fatia, 1)), 0), 2),
    round(coalesce(sum(b.frete_pedido * coalesce(b.fatia, 1)), 0), 2),
    round(coalesce(sum(b.custo_total), 0), 2),
    round(coalesce(sum(b.receita * (select aliq from cfg)), 0), 2),
    round(coalesce(sum(
      case when b.status in ('UNPAID','CANCELLED','TO_RETURN') then 0
      else (case when b.valor_liquido is not null
                 then b.valor_liquido * coalesce(b.fatia,1)
                 else b.receita * 0.80 - 4.00 * b.quantidade end)
           - coalesce(b.custo_total,0)
           - b.receita * (select aliq from cfg) end
    ), 0), 2),
    count(*) filter (
      where b.valor_liquido is null and b.status not in ('UNPAID','CANCELLED','TO_RETURN')
    )::bigint
  from base b;
$$;

create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_totais_impl(p_de, p_ate, p_busca, p_status, p_loja_id);
end; $$;

revoke execute on function public.pedidos_detalhe_impl(date, date, integer, integer, text, text, bigint) from public, anon, authenticated;
grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text, bigint) to authenticated;
revoke execute on function public.pedidos_detalhe_totais_impl(date, date, text, text, bigint) from public, anon, authenticated;
grant execute on function public.pedidos_detalhe_totais(date, date, text, text, bigint) to authenticated;

-- ---------- dre_mensal (e as funções auxiliares de despesas variáveis) ----------
drop function if exists public.contar_pedidos_periodo(date, date);
create or replace function public.contar_pedidos_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.pedidos p
  where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and coalesce(p.status,'') not in ('UNPAID','CANCELLED','TO_RETURN')
    and (p_loja_id is null or p.loja_id = p_loja_id)
$$;

revoke all on function public.contar_pedidos_periodo(date, date, bigint) from public, anon, authenticated;

drop function if exists public.dre_variaveis_detalhe(integer, integer);
create or replace function public.dre_variaveis_detalhe(p_ano integer, p_mes integer, p_loja_id bigint default null)
returns table(
  id bigint,
  descricao text,
  valor_por_pedido numeric,
  franquia_pedidos integer,
  dia_corte_ciclo smallint,
  pedidos_base integer,
  pedidos_cobrados integer,
  ciclo_inicio date,
  ciclo_fim date,
  valor numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ini date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date;
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with regras as (
    select dv.id, dv.descricao, dv.valor_por_pedido, dv.franquia_pedidos, dv.dia_corte_ciclo,
      case when dv.dia_corte_ciclo is null then v_ini
           else make_date(p_ano, p_mes, dv.dia_corte_ciclo) end as ini,
      case when dv.dia_corte_ciclo is null then v_fim
           else (make_date(p_ano, p_mes, dv.dia_corte_ciclo) + interval '1 month' - interval '1 day')::date end as fim
    from public.despesas_variaveis dv
    where dv.ativa = true
  ),
  calc as (
    select r.*, public.contar_pedidos_periodo(r.ini, r.fim, p_loja_id) as qtd
    from regras r
  )
  select c.id, c.descricao, c.valor_por_pedido, c.franquia_pedidos, c.dia_corte_ciclo,
    c.qtd,
    greatest(0, c.qtd - coalesce(c.franquia_pedidos, 0))::int,
    c.ini, c.fim,
    round(greatest(0, c.qtd - coalesce(c.franquia_pedidos, 0)) * c.valor_por_pedido, 2)
  from calc c
  order by c.descricao;
end;
$$;

revoke all on function public.dre_variaveis_detalhe(integer, integer, bigint) from public, anon;
grant execute on function public.dre_variaveis_detalhe(integer, integer, bigint) to authenticated;

drop function if exists public.dre_mensal(integer, integer);
create or replace function public.dre_mensal(p_ano integer, p_mes integer, p_loja_id bigint default null)
returns table(receita_bruta numeric, cancelamentos numeric, receita_liquida numeric, cmv numeric, cmv_pct numeric, lucro_bruto numeric, lucro_bruto_pct numeric, taxas_marketplace numeric, taxas_pct numeric, ads numeric, ads_pct numeric, despesas_fixas numeric, despesas_fixas_pct numeric, despesas_variaveis numeric, despesas_variaveis_pct numeric, resultado_operacional numeric, resultado_operacional_pct numeric, impostos numeric, impostos_pct numeric, lucro_liquido numeric, lucro_liquido_pct numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with periodo as (
    select make_date(p_ano, p_mes, 1) as inicio,
           (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date as fim
  ),
  pedidos_mes as materialized (
    select p.status, p.valor_total,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos as p, periodo as per
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between per.inicio and per.fim
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  agregado as (
    select
      coalesce(sum(valor_total) filter (where status <> 'CANCELLED'), 0) as bruta,
      coalesce(sum(valor_total) filter (where status = 'CANCELLED'), 0) as canc,
      coalesce(sum(valor_total) filter (where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as liquida,
      coalesce(sum(taxa) filter (where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as taxas
    from pedidos_mes
  ),
  custo as (
    select coalesce(sum(pic.custo_total), 0) as valor
    from public.pedido_itens_custeado as pic, periodo as per
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between per.inicio and per.fim
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads_mes as (
    select a.investimento as valor
    from periodo as per
    cross join lateral public.ads_totais_periodo(per.inicio, per.fim, p_loja_id) as a
  ),
  fixas as (
    select coalesce(sum(df.valor), 0) as valor from public.despesas_fixas as df where df.ativa = true
  ),
  variaveis as (
    select coalesce(sum(d.valor), 0) as valor from public.dre_variaveis_detalhe(p_ano, p_mes, p_loja_id) as d
  ),
  cfg as (
    select coalesce(max(c.aliquota_imposto), 0) / 100.0 as aliq from public.config as c
  ),
  t as (
    select ag.bruta, ag.canc, ag.liquida, ag.taxas,
      (select valor from custo) as cmv,
      (select valor from ads_mes) as ads,
      (select valor from fixas) as fixas,
      (select valor from variaveis) as varia,
      (select aliq from cfg) as aliq
    from agregado as ag
  )
  select
    round(t.bruta,2), round(t.canc,2), round(t.liquida,2), round(t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*t.cmv/t.liquida end,1),
    round(t.liquida-t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv)/t.liquida end,1),
    round(t.taxas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.taxas/t.liquida end,1),
    round(t.ads,2),
    round(case when t.liquida=0 then 0 else 100.0*t.ads/t.liquida end,1),
    round(t.fixas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.fixas/t.liquida end,1),
    round(t.varia,2),
    round(case when t.liquida=0 then 0 else 100.0*t.varia/t.liquida end,1),
    round(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia)/t.liquida end,1),
    round(t.liquida*t.aliq,2), round(t.aliq*100,1),
    round(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia-(t.liquida*t.aliq),2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia-(t.liquida*t.aliq))/t.liquida end,1)
  from t;
end;
$function$;

revoke all on function public.dre_mensal(integer, integer, bigint) from public, anon;
grant execute on function public.dre_mensal(integer, integer, bigint) to authenticated;

-- ===== 20260922050000_c7d2f8a4-3b6e-4f1c-9d8a-2e5c7b0f4a63.sql =====
-- ============================================================
-- Corrige "permission denied for function ..._impl" em 4 wrappers
-- do dashboard: dashboard_serie_periodo, dashboard_top_produtos_periodo
-- e dashboard_curva_abc chamam a própria _impl sem SECURITY DEFINER,
-- mas a _impl teve EXECUTE revogado de authenticated — a chamada
-- interna falha porque roda com o papel de quem chamou (authenticated),
-- que não tem permissão na _impl. O padrão correto (usado em
-- dashboard_kpis_periodo, dashboard_serie_horaria etc.) é o wrapper
-- rodar como SECURITY DEFINER.
-- ============================================================

create or replace function public.dashboard_serie_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento, s.parcial
    from public.dashboard_serie_periodo_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

create or replace function public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

create or replace function public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

create or replace function public.dashboard_serie_horaria(p_de date, p_ate date, p_loja_id bigint default null)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
    from public.dashboard_serie_horaria_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

-- O mesmo problema existia em analise_margem_sku, pedidos_detalhe e
-- pedidos_detalhe_totais: o original tinha SECURITY DEFINER aplicado
-- via ALTER FUNCTION numa migração posterior à que eu usei como base
-- pra recriar o corpo, e essa marcação se perdeu na reescrita.
create or replace function public.analise_margem_sku(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.analise_margem_sku_impl(p_de, p_ate, p_loja_id);
end; $$;

create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer, p_limite integer, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_impl(p_de, p_ate, p_offset, p_limite, p_busca, p_status, p_loja_id);
end; $$;

create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_totais_impl(p_de, p_ate, p_busca, p_status, p_loja_id);
end; $$;

-- ===== 20260922060000_e8f3a6c2-9d4b-4e7f-8a1c-3b6d9e2f5c84.sql =====
-- ============================================================
-- Correção: 8 funções (dashboard_kpis_periodo, dashboard_serie_periodo,
-- dashboard_top_produtos_periodo, dashboard_curva_abc,
-- dashboard_serie_horaria, pedidos_detalhe, pedidos_detalhe_totais,
-- produtos_com_giro) ganharam um parâmetro p_marketplace direto em
-- produção, fora de qualquer migração rastreada (mesmo tipo de drift
-- já visto antes com a coluna `marketplace`). As migrações anteriores
-- desta leva (loja_id) assumiram a assinatura antiga sem esse
-- parâmetro — em vez de substituir a função real, teriam deixado uma
-- segunda versão órfã (sem marketplace) pendurada ao lado da original.
--
-- Esta migração: (1) remove tanto a assinatura real de produção quanto
-- a assinatura errada que as migrações anteriores possam ter criado
-- (drop ... if exists é seguro mesmo se uma delas nunca existiu nesse
-- banco); (2) recria cada função com AMBOS os parâmetros — o
-- marketplace preservado exatamente como estava, e o loja_id novo.
-- ============================================================

-- ---------- dashboard_kpis_periodo ----------
drop function if exists public.dashboard_kpis_periodo_impl(date, date, text);
drop function if exists public.dashboard_kpis_periodo_impl(date, date, bigint);
drop function if exists public.dashboard_kpis_periodo(date, date, text);
drop function if exists public.dashboard_kpis_periodo(date, date, bigint);

create or replace function public.dashboard_kpis_periodo_impl(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language sql stable set search_path to 'public'
as $function$
  with validos as (
    select p.valor_total,
           case when p.valor_liquido is not null then p.valor_liquido
                else coalesce(p.valor_total,0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1) end as valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and status = 'CANCELLED'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and status = 'TO_RETURN'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  custos as (
    select coalesce(sum(pic.custo_total), 0) as custo,
           coalesce(sum(pic.quantidade), 0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null), 0) as unid_com_custo
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads as (
    select case when p_marketplace = 'tiktok' then 0
                else coalesce(sum(investimento), 0)
           end as investimento
    from public.ads_totais_periodo(p_de, p_ate, p_loja_id)
  ),
  cfg as (select coalesce(max(aliquota_imposto), 0) as aliq from public.config),
  t as (
    select
      (select count(*) from validos) as qt,
      (select coalesce(sum(valor_total), 0) from validos) as fat,
      (select coalesce(sum(valor_liquido), 0) from validos) as liq,
      (select coalesce(sum(taxa), 0) from validos) as tax,
      (select custo from custos) as custo,
      (select unid from custos) as unid,
      (select unid_com_custo from custos) as unid_cc,
      (select aliq from cfg) as aliq,
      (select qtd from cancelados) as canc_qt,
      (select valor from cancelados) as canc_vl,
      (select qtd from devolvidos) as dev_qt,
      (select valor from devolvidos) as dev_vl,
      (select investimento from ads) as ads_inv
  )
  select
    t.qt::bigint, t.unid::bigint, round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint, round(t.canc_vl, 2), t.dev_qt::bigint, round(t.dev_vl, 2),
    round(t.tax, 2), round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2), round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0 else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2), round(t.aliq, 2), round(t.liq, 2), round(t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.ads_inv / t.fat end, 1),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.fat end, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.fat end, 2),
    round(case when t.qt = 0 then 0 else (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.qt end, 2)
  from t;
$function$;

create or replace function public.dashboard_kpis_periodo(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_periodo_impl(p_de, p_ate, p_marketplace, p_loja_id);
end;
$function$;

-- ---------- dashboard_serie_periodo ----------
drop function if exists public.dashboard_serie_periodo_impl(date, date, text);
drop function if exists public.dashboard_serie_periodo_impl(date, date, bigint);
drop function if exists public.dashboard_serie_periodo(date, date, text);
drop function if exists public.dashboard_serie_periodo(date, date, bigint);

create or replace function public.dashboard_serie_periodo_impl(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language sql stable set search_path to 'public'
as $function$
  with cfg as (
    select
      case
        when (p_ate - p_de) > 90 then 'mes'
        when (p_ate - p_de) > 31 then 'semana'
        else 'dia'
      end as gran,
      (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  calendario as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month', d)::date
        when 'semana' then date_trunc('week', d)::date
        else d::date
      end as periodo
    from generate_series(p_de, p_ate, interval '1 day') as d
    group by 1
  ),
  vendas as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month', (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        when 'semana' then date_trunc('week', (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        else (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
      end as periodo,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
    group by 1
  )
  select
    c.periodo,
    case (select gran from cfg)
      when 'mes' then to_char(c.periodo, 'MM/YYYY')
      when 'semana' then to_char(c.periodo, 'DD/MM')
      else to_char(c.periodo, 'DD/MM')
    end,
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    c.periodo = (select hoje from cfg)
  from calendario c
  left join vendas v on v.periodo = c.periodo
  order by c.periodo;
$function$;

create or replace function public.dashboard_serie_periodo(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento, s.parcial
    from public.dashboard_serie_periodo_impl(p_de, p_ate, p_marketplace, p_loja_id) s;
end; $function$;

-- ---------- dashboard_top_produtos_periodo ----------
drop function if exists public.dashboard_top_produtos_periodo_impl(date, date, integer, text);
drop function if exists public.dashboard_top_produtos_periodo_impl(date, date, integer, bigint);
drop function if exists public.dashboard_top_produtos_periodo(date, date, integer, text);
drop function if exists public.dashboard_top_produtos_periodo(date, date, integer, bigint);

create or replace function public.dashboard_top_produtos_periodo_impl(
  p_de date, p_ate date, p_limite integer default 10, p_marketplace text default null, p_loja_id bigint default null
)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language sql stable set search_path to 'public'
as $function$
  select
    max(pi.produto), pi.sku, sum(pi.quantidade)::bigint, sum(pi.receita)::numeric
  from public.pedido_itens pi
  where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    and (p_marketplace is null or pi.marketplace = p_marketplace)
    and (p_loja_id is null or pi.loja_id = p_loja_id)
  group by pi.sku
  order by 3 desc
  limit p_limite;
$function$;

create or replace function public.dashboard_top_produtos_periodo(
  p_de date, p_ate date, p_limite integer, p_marketplace text default null, p_loja_id bigint default null
)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite, p_marketplace, p_loja_id);
end; $function$;

-- ---------- dashboard_curva_abc ----------
drop function if exists public.dashboard_curva_abc_impl(date, date, integer, text);
drop function if exists public.dashboard_curva_abc_impl(date, date, integer, bigint);
drop function if exists public.dashboard_curva_abc(date, date, integer, text);
drop function if exists public.dashboard_curva_abc(date, date, integer, bigint);

create or replace function public.dashboard_curva_abc_impl(
  p_de date, p_ate date, p_limite integer default 20, p_marketplace text default null, p_loja_id bigint default null
)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      max(pi.produto) as produto, pi.sku,
      sum(pi.quantidade)::bigint as unidades, sum(pi.receita) as receita
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or pi.marketplace = p_marketplace)
      and (p_loja_id is null or pi.loja_id = p_loja_id)
    group by pi.sku
  ),
  total as (select nullif(sum(receita), 0) as tot from vendas),
  ranked as (
    select
      v.*,
      100.0 * v.receita / (select tot from total) as part,
      100.0 * sum(v.receita) over (order by v.receita desc rows between unbounded preceding and current row)
        / (select tot from total) as acum
    from vendas v
  )
  select
    r.produto, r.sku, r.unidades, round(r.receita, 2), round(r.part, 2), round(r.acum, 2),
    case when r.acum <= 80 then 'A' when r.acum <= 95 then 'B' else 'C' end
  from ranked r
  order by r.receita desc
  limit p_limite;
$function$;

create or replace function public.dashboard_curva_abc(
  p_de date, p_ate date, p_limite integer, p_marketplace text default null, p_loja_id bigint default null
)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite, p_marketplace, p_loja_id);
end; $function$;

-- ---------- dashboard_serie_horaria ----------
drop function if exists public.dashboard_serie_horaria_impl(date, date, text);
drop function if exists public.dashboard_serie_horaria_impl(date, date, bigint);
drop function if exists public.dashboard_serie_horaria(date, date, text);
drop function if exists public.dashboard_serie_horaria(date, date, bigint);

create or replace function public.dashboard_serie_horaria_impl(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  return query
  with horas as (
    select h::smallint as hora from generate_series(0, 23) h
  ),
  vendas as (
    select
      extract(hour from (data_criacao_pedido at time zone 'America/Sao_Paulo'))::smallint as hora,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
    group by 1
  ),
  ads_real as (
    select g.hora, sum(g.investimento)::numeric as valor
    from public.ads_gasto_horario g
    where g.data between p_de and p_ate
      and coalesce(p_marketplace, 'shopee') = 'shopee'
      and (p_loja_id is null or g.loja_id = p_loja_id)
    group by 1
  ),
  total_dia as (
    select coalesce(sum(a.investimento), 0)::numeric as total
    from public.ads_campanhas a
    where a.data::date between p_de and p_ate
      and coalesce(p_marketplace, 'shopee') = 'shopee'
      and (p_loja_id is null or a.loja_id = p_loja_id)
  ),
  tem_real as (
    select coalesce(sum(valor), 0) > 0 as ok from ads_real
  )
  select
    h.hora, lpad(h.hora::text, 2, '0') || 'h',
    coalesce(v.pedidos, 0)::bigint, coalesce(v.faturamento, 0)::numeric,
    case
      when (select ok from tem_real) then coalesce(ar.valor, 0)::numeric
      else ((select total from total_dia) / 24)::numeric
    end
  from horas h
  left join vendas v on v.hora = h.hora
  left join ads_real ar on ar.hora = h.hora
  order by h.hora;
end;
$function$;

create or replace function public.dashboard_serie_horaria(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
    from public.dashboard_serie_horaria_impl(p_de, p_ate, p_marketplace, p_loja_id) s;
end; $function$;

-- ---------- pedidos_detalhe ----------
drop function if exists public.pedidos_detalhe_impl(date, date, integer, integer, text, text, text);
drop function if exists public.pedidos_detalhe_impl(date, date, integer, integer, text, text, bigint);
drop function if exists public.pedidos_detalhe(date, date, integer, integer, text, text, text);
drop function if exists public.pedidos_detalhe(date, date, integer, integer, text, text, bigint);

create or replace function public.pedidos_detalhe_impl(
  p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50,
  p_busca text default null, p_status text default null, p_marketplace text default null,
  p_loja_id bigint default null
)
returns table (
  total_linhas bigint, order_sn text, data_pedido timestamptz, status text,
  produto text, sku text, imagem_url text, quantidade integer, valor numeric,
  tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric,
  lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean
)
language sql stable set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  lim as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  pedidos_filtrados as materialized (
    select p.order_sn, p.data_criacao_pedido, p.status, p.comprador_username,
           p.valor_liquido,
           coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
           coalesce(p.frete_real,0) as frete_pedido
    from public.pedidos p, lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
      and (p_status is null or p.status = p_status)
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
      and (
        p_busca is null
        or p.order_sn ilike '%'||p_busca||'%'
        or p.comprador_username ilike '%'||p_busca||'%'
        or exists (
          select 1 from public.pedido_itens pi2
          where pi2.order_sn = p.order_sn
            and (pi2.sku ilike '%'||p_busca||'%' or pi2.produto ilike '%'||p_busca||'%')
        )
      )
  ),
  contagem as (select count(*) as total from pedidos_filtrados),
  pagina as (
    select * from pedidos_filtrados
    order by data_criacao_pedido desc, order_sn
    offset p_offset limit p_limite
  ),
  itens_pagina as (
    select pg.*, pic.produto, pic.sku, pic.item_id, pic.model_id, pic.quantidade,
           pic.receita, pic.custo_total,
           pic.receita / nullif(sum(pic.receita) over (partition by pg.order_sn), 0) as fatia
    from pagina pg
    join public.pedido_itens_custeado pic on pic.order_sn = pg.order_sn
  )
  select
    (select total from contagem)::bigint,
    ip.order_sn, ip.data_criacao_pedido, ip.status, ip.produto, ip.sku,
    pr.imagem_url, ip.quantidade,
    round(ip.receita,2),
    round(ip.taxa_pedido * coalesce(ip.fatia,1),2),
    round(ip.frete_pedido * coalesce(ip.fatia,1),2),
    round(ip.custo_total,2),
    round(ip.receita * (select aliq from cfg),2),
    round(
      (case when ip.valor_liquido is not null then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg), 2),
    case when ip.receita=0 then null else round(100.0*(
      (case when ip.valor_liquido is not null then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg)
    )/ip.receita,1) end,
    ip.comprador_username,
    (ip.valor_liquido is not null)
  from itens_pagina ip
  left join public.produtos pr on pr.item_id = ip.item_id and pr.model_id = ip.model_id
  order by ip.data_criacao_pedido desc, ip.order_sn;
$$;

create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer, p_limite integer, p_busca text, p_status text,
  p_marketplace text default null, p_loja_id bigint default null
)
returns table (total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_impl(p_de, p_ate, p_offset, p_limite, p_busca, p_status, p_marketplace, p_loja_id);
end; $$;

-- ---------- pedidos_detalhe_totais ----------
drop function if exists public.pedidos_detalhe_totais_impl(date, date, text, text, text);
drop function if exists public.pedidos_detalhe_totais_impl(date, date, text, text, bigint);
drop function if exists public.pedidos_detalhe_totais(date, date, text, text, text);
drop function if exists public.pedidos_detalhe_totais(date, date, text, text, bigint);

create or replace function public.pedidos_detalhe_totais_impl(
  p_de date, p_ate date, p_busca text default null, p_status text default null,
  p_marketplace text default null, p_loja_id bigint default null
)
returns table (
  linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric,
  custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint
)
language sql stable set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  lim as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  base as (
    select
      pic.receita, pic.custo_total, pic.quantidade, p.status, p.valor_liquido,
      coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedidos p
    join public.pedido_itens_custeado pic on pic.order_sn = p.order_sn
    cross join lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
      and (p_status is null or p.status = p_status)
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
      and (
        p_busca is null
        or p.order_sn ilike '%' || p_busca || '%'
        or pic.sku ilike '%' || p_busca || '%'
        or pic.produto ilike '%' || p_busca || '%'
        or p.comprador_username ilike '%' || p_busca || '%'
      )
  )
  select
    count(*)::bigint,
    round(coalesce(sum(b.receita), 0), 2),
    round(coalesce(sum(b.taxa_pedido * coalesce(b.fatia, 1)), 0), 2),
    round(coalesce(sum(b.frete_pedido * coalesce(b.fatia, 1)), 0), 2),
    round(coalesce(sum(b.custo_total), 0), 2),
    round(coalesce(sum(b.receita * (select aliq from cfg)), 0), 2),
    round(coalesce(sum(
      case when b.status in ('UNPAID','CANCELLED','TO_RETURN') then 0
      else (case when b.valor_liquido is not null
                 then b.valor_liquido * coalesce(b.fatia,1)
                 else b.receita * 0.80 - 4.00 * b.quantidade end)
           - coalesce(b.custo_total,0)
           - b.receita * (select aliq from cfg) end
    ), 0), 2),
    count(*) filter (
      where b.valor_liquido is null and b.status not in ('UNPAID','CANCELLED','TO_RETURN')
    )::bigint
  from base b;
$$;

create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text, p_status text,
  p_marketplace text default null, p_loja_id bigint default null
)
returns table (linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_totais_impl(p_de, p_ate, p_busca, p_status, p_marketplace, p_loja_id);
end; $$;

-- ---------- produtos_com_giro ----------
drop function if exists public.produtos_com_giro(date, date, text);
drop function if exists public.produtos_com_giro(date, date, bigint);

create or replace function public.produtos_com_giro(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text)
language sql stable set search_path to 'public'
as $function$
  WITH dias AS (
    SELECT GREATEST((p_ate - p_de) + 1, 1) AS qtd
  ),
  vendas AS (
    SELECT
      pi.item_id, pi.model_id, SUM(pi.quantidade)::bigint AS vendidos
    FROM public.pedido_itens pi
    WHERE (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_de AND p_ate
      AND pi.status_pedido NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
      AND (p_marketplace IS NULL OR pi.marketplace = p_marketplace)
    GROUP BY pi.item_id, pi.model_id
  )
  SELECT
    p.item_id, p.model_id, p.sku, p.produto, p.variacao,
    p.preco_atual, p.estoque_disponivel,
    COALESCE(v.vendidos, 0)::bigint,
    ROUND(COALESCE(v.vendidos, 0)::numeric / (SELECT qtd FROM dias), 2),
    CASE
      WHEN COALESCE(v.vendidos, 0) = 0 THEN NULL
      ELSE ROUND(p.estoque_disponivel / (v.vendidos::numeric / (SELECT qtd FROM dias)), 1)
    END,
    p.status_item, p.imagem_url
  FROM public.produtos p
  LEFT JOIN vendas v ON v.item_id = p.item_id AND v.model_id = p.model_id
  WHERE (p_marketplace IS NULL OR p.marketplace = p_marketplace)
    AND (p_loja_id IS NULL OR p.loja_id = p_loja_id)
  ORDER BY COALESCE(v.vendidos, 0) DESC;
$function$;

-- ---------- grants (mesmo padrão já usado nas demais migrações desta leva) ----------
revoke all on function public.dashboard_kpis_periodo_impl(date, date, text, bigint) from public, anon, authenticated;
revoke all on function public.dashboard_kpis_periodo(date, date, text, bigint) from public, anon;
grant execute on function public.dashboard_kpis_periodo(date, date, text, bigint) to authenticated, service_role;

revoke execute on function public.dashboard_serie_periodo_impl(date, date, text, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_serie_periodo(date, date, text, bigint) to authenticated;

revoke execute on function public.dashboard_top_produtos_periodo_impl(date, date, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_top_produtos_periodo(date, date, integer, text, bigint) to authenticated;

revoke execute on function public.dashboard_curva_abc_impl(date, date, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_curva_abc(date, date, integer, text, bigint) to authenticated;

revoke all on function public.dashboard_serie_horaria_impl(date, date, text, bigint) from public, anon, authenticated;
revoke all on function public.dashboard_serie_horaria(date, date, text, bigint) from public, anon;
grant execute on function public.dashboard_serie_horaria(date, date, text, bigint) to authenticated, service_role;

revoke execute on function public.pedidos_detalhe_impl(date, date, integer, integer, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text, text, bigint) to authenticated;

revoke execute on function public.pedidos_detalhe_totais_impl(date, date, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.pedidos_detalhe_totais(date, date, text, text, text, bigint) to authenticated;

revoke all on function public.produtos_com_giro(date, date, text, bigint) from public, anon;
grant execute on function public.produtos_com_giro(date, date, text, bigint) to authenticated;

commit;
