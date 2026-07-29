alter table public.config
  add column if not exists aliquota_imposto numeric not null default 0;

drop function if exists public.dashboard_kpis_periodo(date, date);

create or replace function public.dashboard_kpis_periodo(
  p_de date,
  p_ate date
)
returns table (
  pedidos_validos bigint,
  unidades bigint,
  faturamento numeric,
  ticket_medio numeric,
  pedidos_cancelados bigint,
  valor_cancelado numeric,
  taxas numeric,
  taxas_pct numeric,
  custo_total numeric,
  custo_pct numeric,
  cobertura_custo numeric,
  imposto numeric,
  imposto_pct numeric,
  valor_liquido numeric,
  lucro numeric,
  lucro_pct numeric,
  lucro_medio numeric
)
language sql
stable
set search_path = public
as $$
  with validos as (
    select p.valor_total, p.valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
             + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED')
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
  ),
  custos as (
    select
      coalesce(sum(pi.quantidade * d.custo_unitario), 0) as custo,
      coalesce(sum(pi.quantidade), 0) as unid,
      coalesce(sum(pi.quantidade) filter (
        where d.custo_unitario is not null), 0) as unid_com_custo
    from public.pedido_itens pi
    left join public.dim_produto d
      on d.item_id = pi.item_id and d.model_id = pi.model_id
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
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
      (select valor from cancelados) as canc_vl
  )
  select
    t.qt::bigint,
    t.unid::bigint,
    round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint,
    round(t.canc_vl, 2),
    round(t.tax, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0
               else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2),
    round(t.aliq, 2),
    round(t.liq, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0
               else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0))
                    / t.fat end, 2),
    round(case when t.qt = 0 then 0
               else (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.qt end, 2)
  from t;
$$;

create or replace function public.dashboard_curva_abc(
  p_de date,
  p_ate date,
  p_limite integer default 20
)
returns table (
  produto text,
  sku text,
  unidades bigint,
  receita numeric,
  participacao numeric,
  acumulado numeric,
  classe text
)
language sql
stable
set search_path = public
as $$
  with vendas as (
    select
      max(pi.produto) as produto,
      pi.sku,
      sum(pi.quantidade)::bigint as unidades,
      sum(pi.receita) as receita
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
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
$$;

revoke all on function public.dashboard_kpis_periodo(date, date) from public, anon;
revoke all on function public.dashboard_curva_abc(date, date, integer) from public, anon;
grant execute on function public.dashboard_kpis_periodo(date, date) to authenticated;
grant execute on function public.dashboard_curva_abc(date, date, integer) to authenticated;