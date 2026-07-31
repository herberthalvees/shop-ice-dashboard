create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric,
  pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric,
  custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric,
  ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric,
  lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with validos as (
    select
      p.valor_total as receita_pedido,
      case when p.valor_liquido is not null then p.valor_liquido
           else coalesce(p.valor_total, 0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1) end as liquido_pedido,
      coalesce(p.comissao, 0) + coalesce(p.taxa_servico, 0) + coalesce(p.taxa_transacao, 0) as taxa_pedido
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  cancelados as (
    select count(*) as qtd_cancelada, coalesce(sum(p.valor_total), 0) as total_cancelado
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status = 'CANCELLED'
  ),
  devolvidos as (
    select count(*) as qtd_devolvida, coalesce(sum(p.valor_total), 0) as total_devolvido
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status = 'TO_RETURN'
  ),
  custos as (
    select
      coalesce(sum(pic.custo_total), 0) as custo_calculado,
      coalesce(sum(pic.quantidade), 0) as unidades_calculadas,
      coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null), 0) as unidades_com_custo
    from public.pedido_itens_custeado as pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  ads as (
    select a.investimento as investimento_calculado
    from public.ads_totais_periodo(p_de, p_ate) as a
  ),
  cfg as (
    select coalesce(max(c.aliquota_imposto), 0) / 100.0 as aliquota_calculada from public.config as c
  ),
  totais as (
    select
      (select count(*) from validos as v) as qtd_valida,
      (select coalesce(sum(v.receita_pedido), 0) from validos as v) as receita_valida,
      (select coalesce(sum(v.liquido_pedido), 0) from validos as v) as liquido_valido,
      (select coalesce(sum(v.taxa_pedido), 0) from validos as v) as taxa_valida,
      c.custo_calculado, c.unidades_calculadas, c.unidades_com_custo,
      cfg.aliquota_calculada,
      can.qtd_cancelada, can.total_cancelado,
      dev.qtd_devolvida, dev.total_devolvido,
      a.investimento_calculado
    from custos as c
    cross join cfg
    cross join cancelados as can
    cross join devolvidos as dev
    cross join ads as a
  )
  select
    t.qtd_valida::bigint,
    t.unidades_calculadas::bigint,
    round(t.receita_valida, 2),
    round(case when t.qtd_valida = 0 then 0 else t.receita_valida / t.qtd_valida end, 2),
    t.qtd_cancelada::bigint,
    round(t.total_cancelado, 2),
    t.qtd_devolvida::bigint,
    round(t.total_devolvido, 2),
    round(t.taxa_valida, 2),
    round(case when t.receita_valida = 0 then 0 else 100.0 * t.taxa_valida / t.receita_valida end, 1),
    round(t.custo_calculado, 2),
    round(case when t.receita_valida = 0 then 0 else 100.0 * t.custo_calculado / t.receita_valida end, 1),
    round(case when t.unidades_calculadas = 0 then 0 else t.unidades_com_custo::numeric / t.unidades_calculadas end, 4),
    round(t.receita_valida * t.aliquota_calculada, 2),
    round(t.aliquota_calculada * 100.0, 2),
    round(t.liquido_valido, 2),
    round(t.investimento_calculado, 2),
    round(case when t.receita_valida = 0 then 0 else 100.0 * t.investimento_calculado / t.receita_valida end, 1),
    round(t.liquido_valido - t.custo_calculado - (t.receita_valida * t.aliquota_calculada), 2),
    round(case when t.receita_valida = 0 then 0 else 100.0 * (t.liquido_valido - t.custo_calculado - (t.receita_valida * t.aliquota_calculada)) / t.receita_valida end, 2),
    round(t.liquido_valido - t.custo_calculado - (t.receita_valida * t.aliquota_calculada) - t.investimento_calculado, 2),
    round(case when t.receita_valida = 0 then 0 else 100.0 * (t.liquido_valido - t.custo_calculado - (t.receita_valida * t.aliquota_calculada) - t.investimento_calculado) / t.receita_valida end, 2),
    round(case when t.qtd_valida = 0 then 0 else (t.liquido_valido - t.custo_calculado - (t.receita_valida * t.aliquota_calculada) - t.investimento_calculado) / t.qtd_valida end, 2)
  from totais as t;
end;
$function$;

revoke all on function public.dashboard_kpis_periodo(date, date) from public, anon;
grant execute on function public.dashboard_kpis_periodo(date, date) to authenticated;

create or replace function public.dre_mensal(p_ano integer, p_mes integer)
returns table (
  receita_bruta numeric, cancelamentos numeric, receita_liquida numeric,
  cmv numeric, cmv_pct numeric, lucro_bruto numeric, lucro_bruto_pct numeric,
  taxas_marketplace numeric, taxas_pct numeric, ads numeric, ads_pct numeric,
  despesas_fixas numeric, despesas_fixas_pct numeric,
  resultado_operacional numeric, resultado_operacional_pct numeric,
  impostos numeric, impostos_pct numeric, lucro_liquido numeric, lucro_liquido_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
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
  cfg as (
    select coalesce(max(c.aliquota_imposto), 0) / 100.0 as aliq from public.config as c
  ),
  t as (
    select ag.bruta, ag.canc, ag.liquida, ag.taxas,
      (select valor from custo) as cmv,
      (select valor from ads_mes) as ads,
      (select valor from fixas) as fixas,
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
    round(t.liquida-t.cmv-t.taxas-t.ads-t.fixas,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas)/t.liquida end,1),
    round(t.liquida*t.aliq,2), round(t.aliq*100,1),
    round(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-(t.liquida*t.aliq),2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-(t.liquida*t.aliq))/t.liquida end,1)
  from t;
end;
$function$;

revoke all on function public.dre_mensal(integer, integer) from public, anon;
grant execute on function public.dre_mensal(integer, integer) to authenticated;