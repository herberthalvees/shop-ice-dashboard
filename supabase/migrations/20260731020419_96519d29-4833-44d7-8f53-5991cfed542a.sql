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
as $$
begin
  if not public.eh_owner() then
    raise exception 'acesso negado';
  end if;

  return query
  with validos as (
    select
      p.valor_total as receita_pedido,
      case
        when p.valor_liquido is not null then p.valor_liquido
        else coalesce(p.valor_total, 0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1)
      end as liquido_pedido,
      coalesce(p.comissao, 0) + coalesce(p.taxa_servico, 0)
        + coalesce(p.taxa_transacao, 0) as taxa_pedido
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  cancelados as (
    select count(*) as qtd_cancelada, coalesce(sum(p.valor_total), 0) as total_cancelado
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status = 'CANCELLED'
  ),
  devolvidos as (
    select count(*) as qtd_devolvida, coalesce(sum(p.valor_total), 0) as total_devolvido
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status = 'TO_RETURN'
  ),
  custos as (
    select
      coalesce(sum(pic.custo_total), 0) as custo_calculado,
      coalesce(sum(pic.quantidade), 0) as unidades_calculadas,
      coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null), 0)
        as unidades_com_custo
    from public.pedido_itens_custeado as pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  ads as (
    select coalesce(sum(ac.investimento), 0) as investimento_calculado
    from public.ads_campanhas as ac
    where ac.data::date between p_de and p_ate
  ),
  cfg as (
    select coalesce(max(c.aliquota_imposto), 0) / 100.0 as aliquota_calculada
    from public.config as c
  ),
  totais as (
    select
      (select count(*) from validos as v) as qtd_valida,
      (select coalesce(sum(v.receita_pedido), 0) from validos as v) as receita_valida,
      (select coalesce(sum(v.liquido_pedido), 0) from validos as v) as liquido_valido,
      (select coalesce(sum(v.taxa_pedido), 0) from validos as v) as taxa_valida,
      c.custo_calculado,
      c.unidades_calculadas,
      c.unidades_com_custo,
      cfg.aliquota_calculada,
      can.qtd_cancelada,
      can.total_cancelado,
      dev.qtd_devolvida,
      dev.total_devolvido,
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
$$;

revoke all on function public.dashboard_kpis_periodo(date, date) from public, anon;
grant execute on function public.dashboard_kpis_periodo(date, date) to authenticated;