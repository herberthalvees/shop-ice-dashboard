create table if not exists public.despesas_variaveis (
  id bigserial primary key,
  descricao text not null,
  valor_por_pedido numeric not null default 0,
  franquia_pedidos integer,
  dia_corte_ciclo smallint check (dia_corte_ciclo between 1 and 28),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.despesas_variaveis to authenticated;
grant all on public.despesas_variaveis to service_role;
grant usage, select on sequence public.despesas_variaveis_id_seq to authenticated;
grant all on sequence public.despesas_variaveis_id_seq to service_role;

alter table public.despesas_variaveis enable row level security;

drop policy if exists "owner read despesas_variaveis" on public.despesas_variaveis;
create policy "owner read despesas_variaveis" on public.despesas_variaveis
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and eh_owner());

drop policy if exists "admins insert despesas_variaveis" on public.despesas_variaveis;
create policy "admins insert despesas_variaveis" on public.despesas_variaveis
  for insert to authenticated
  with check (has_role(auth.uid(), 'admin'::app_role) and eh_owner());

drop policy if exists "admins update despesas_variaveis" on public.despesas_variaveis;
create policy "admins update despesas_variaveis" on public.despesas_variaveis
  for update to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and eh_owner())
  with check (has_role(auth.uid(), 'admin'::app_role) and eh_owner());

drop policy if exists "admins delete despesas_variaveis" on public.despesas_variaveis;
create policy "admins delete despesas_variaveis" on public.despesas_variaveis
  for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and eh_owner());

create or replace function public.set_updated_at_despesas_variaveis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_despesas_variaveis_updated_at on public.despesas_variaveis;
create trigger trg_despesas_variaveis_updated_at
  before update on public.despesas_variaveis
  for each row execute function public.set_updated_at_despesas_variaveis();

insert into public.despesas_variaveis (descricao, valor_por_pedido, franquia_pedidos, dia_corte_ciclo)
select 'Insumos por envio', 0.20, null, null
where not exists (select 1 from public.despesas_variaveis where descricao = 'Insumos por envio');

insert into public.despesas_variaveis (descricao, valor_por_pedido, franquia_pedidos, dia_corte_ciclo)
select 'UpSeller excedente', 0.04, 1800, 24
where not exists (select 1 from public.despesas_variaveis where descricao = 'UpSeller excedente');

-- contagem de pedidos validos num intervalo de datas (fuso SP)
create or replace function public.contar_pedidos_periodo(p_de date, p_ate date)
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
$$;

revoke all on function public.contar_pedidos_periodo(date, date) from public, anon, authenticated;

create or replace function public.dre_variaveis_detalhe(p_ano integer, p_mes integer)
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
    select r.*, public.contar_pedidos_periodo(r.ini, r.fim) as qtd
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

revoke all on function public.dre_variaveis_detalhe(integer, integer) from public, anon;
grant execute on function public.dre_variaveis_detalhe(integer, integer) to authenticated;

drop function if exists public.dre_mensal(integer, integer);
create or replace function public.dre_mensal(p_ano integer, p_mes integer)
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
  ),
  ads_mes as (
    select a.investimento as valor
    from periodo as per
    cross join lateral public.ads_totais_periodo(per.inicio, per.fim) as a
  ),
  fixas as (
    select coalesce(sum(df.valor), 0) as valor from public.despesas_fixas as df where df.ativa = true
  ),
  variaveis as (
    select coalesce(sum(d.valor), 0) as valor from public.dre_variaveis_detalhe(p_ano, p_mes) as d
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

revoke all on function public.dre_mensal(integer, integer) from public, anon;
grant execute on function public.dre_mensal(integer, integer) to authenticated;