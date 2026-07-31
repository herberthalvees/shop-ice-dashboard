create or replace function public.dre_mensal(
  p_ano integer,
  p_mes integer
)
returns table (
  receita_bruta numeric,
  cancelamentos numeric,
  receita_liquida numeric,
  cmv numeric,
  cmv_pct numeric,
  lucro_bruto numeric,
  lucro_bruto_pct numeric,
  taxas_marketplace numeric,
  taxas_pct numeric,
  ads numeric,
  ads_pct numeric,
  despesas_fixas numeric,
  despesas_fixas_pct numeric,
  resultado_operacional numeric,
  resultado_operacional_pct numeric,
  impostos numeric,
  impostos_pct numeric,
  lucro_liquido numeric,
  lucro_liquido_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with periodo as (
    select make_date(p_ano, p_mes, 1) as inicio,
           (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date as fim
  ),
  pedidos_mes as materialized (
    select
      p.status,
      p.valor_total,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
        + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p, periodo per
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between per.inicio and per.fim
  ),
  agregado as (
    select
      coalesce(sum(valor_total) filter (where status <> 'CANCELLED'), 0) as bruta,
      coalesce(sum(valor_total) filter (where status = 'CANCELLED'), 0) as canc,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as liquida,
      coalesce(sum(taxa) filter (
        where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as taxas
    from pedidos_mes
  ),
  custo as (
    select coalesce(sum(pic.custo_total), 0) as valor
    from public.pedido_itens_custeado pic, periodo per
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between per.inicio and per.fim
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  ads_mes as (
    select coalesce(sum(ac.investimento), 0) as valor
    from public.ads_campanhas ac, periodo per
    where ac.data::date between per.inicio and per.fim
  ),
  fixas as (
    select coalesce(sum(valor), 0) as valor
    from public.despesas_fixas where ativa = true
  ),
  cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  t as (
    select
      ag.bruta, ag.canc, ag.liquida, ag.taxas,
      (select valor from custo) as cmv,
      (select valor from ads_mes) as ads,
      (select valor from fixas) as fixas,
      (select aliq from cfg) as aliq
    from agregado ag
  )
  select
    round(t.bruta,2), round(t.canc,2), round(t.liquida,2),
    round(t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*t.cmv/t.liquida end,1),
    round(t.liquida - t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv)/t.liquida end,1),
    round(t.taxas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.taxas/t.liquida end,1),
    round(t.ads,2),
    round(case when t.liquida=0 then 0 else 100.0*t.ads/t.liquida end,1),
    round(t.fixas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.fixas/t.liquida end,1),
    round(t.liquida - t.cmv - t.taxas - t.ads - t.fixas,2),
    round(case when t.liquida=0 then 0
               else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas)/t.liquida end,1),
    round(t.liquida * t.aliq,2),
    round(t.aliq*100,1),
    round(t.liquida - t.cmv - t.taxas - t.ads - t.fixas - (t.liquida*t.aliq),2),
    round(case when t.liquida=0 then 0
               else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-(t.liquida*t.aliq))/t.liquida end,1)
  from t;
end;
$function$;

revoke execute on function public.dre_mensal(integer, integer) from public, anon;
grant execute on function public.dre_mensal(integer, integer) to authenticated;