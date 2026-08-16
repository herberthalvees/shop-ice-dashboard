create or replace function public.dashboard_kpis_parcial_impl(p_de date, p_ate date, p_minuto_max integer, p_marketplace text default null)
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
  ),
  ads as (
    select case when p_marketplace = 'tiktok' then 0
                when p_minuto_max is null then (select coalesce(sum(investimento),0) from public.ads_totais_periodo(p_de, p_ate))
                else (select coalesce(sum(g.investimento),0) from public.ads_gasto_horario g
                      where g.data between p_de and p_ate and g.hora <= (p_minuto_max / 60))
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

create or replace function public.dashboard_kpis_parcial(p_de date, p_ate date, p_minuto_max integer, p_marketplace text default null)
returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_parcial_impl(p_de, p_ate, p_minuto_max, p_marketplace);
end;
$function$;

revoke all on function public.dashboard_kpis_parcial_impl(date, date, integer, text) from public, anon, authenticated;
revoke all on function public.dashboard_kpis_parcial(date, date, integer, text) from public, anon;
grant execute on function public.dashboard_kpis_parcial(date, date, integer, text) to authenticated, service_role;