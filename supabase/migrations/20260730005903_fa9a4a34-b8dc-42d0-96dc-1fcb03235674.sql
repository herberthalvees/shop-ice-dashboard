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
set search_path to 'public'
as $fn$
declare
  v_ini timestamptz := (make_date(p_ano, p_mes, 1)::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((make_date(p_ano, p_mes, 1) + interval '1 month')::timestamp at time zone 'America/Sao_Paulo');
begin
  return query execute format($q$
    with agregado as (
      select
        coalesce(sum(p.valor_total) filter (where p.status is distinct from 'CANCELLED'), 0) as bruta,
        coalesce(sum(p.valor_total) filter (where p.status = 'CANCELLED'), 0) as canc,
        coalesce(sum(p.valor_total) filter (
          where p.status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as liquida,
        coalesce(sum(coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0)) filter (
          where p.status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as taxas
      from public.pedidos p
      where p.data_criacao_pedido >= %1$L::timestamptz and p.data_criacao_pedido < %2$L::timestamptz
    ),
    custo as materialized (
      select coalesce(sum(pic.custo_total), 0) as valor
      from public.pedido_itens_custeado pic
      where pic.data_criacao_pedido >= %1$L::timestamptz and pic.data_criacao_pedido < %2$L::timestamptz
        and pic.status_pedido not in ('UNPAID','CANCELLED','TO_RETURN')
    ),
    fixas as materialized (select coalesce(sum(valor), 0) as valor from public.despesas_fixas where ativa = true),
    cfg as materialized (select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config),
    t as materialized (
      select ag.bruta, ag.canc, ag.liquida, ag.taxas,
             (select valor from custo) as cmv,
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
      0::numeric, 0::numeric,
      round(t.fixas,2),
      round(case when t.liquida=0 then 0 else 100.0*t.fixas/t.liquida end,1),
      round(t.liquida - t.cmv - t.taxas - t.fixas,2),
      round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.fixas)/t.liquida end,1),
      round(t.liquida * t.aliq,2),
      round(t.aliq*100,1),
      round(t.liquida - t.cmv - t.taxas - t.fixas - (t.liquida*t.aliq),2),
      round(case when t.liquida=0 then 0
                 else 100.0*(t.liquida-t.cmv-t.taxas-t.fixas-(t.liquida*t.aliq))/t.liquida end,1)
    from t
  $q$, v_ini, v_fim);
end;
$fn$;

revoke execute on function public.dre_mensal(integer, integer) from public, anon;
grant execute on function public.dre_mensal(integer, integer) to authenticated;