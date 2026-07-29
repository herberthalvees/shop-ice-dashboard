DROP FUNCTION IF EXISTS public.dashboard_kpis_periodo(date, date);
CREATE OR REPLACE FUNCTION public.dashboard_kpis_periodo(p_de date, p_ate date)
 RETURNS TABLE(
   pedidos_total bigint,
   pedidos_validos bigint,
   faturamento_total numeric,
   ticket_medio numeric,
   itens_vendidos bigint,
   pedidos_cancelados bigint,
   valor_liquido numeric,
   total_taxas numeric,
   cobertura_liquido numeric,
   faturamento_com_escrow numeric,
   percentual_taxas numeric,
   margem_liquida numeric,
   projecao_liquido numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with base as (
    select
      p.status, p.valor_total, p.valor_liquido,
      p.comissao, p.taxa_servico, p.taxa_transacao,
      p.escrow_atualizado_em
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
  ),
  validos as (
    select * from base where status not in ('UNPAID', 'CANCELLED')
  ),
  com_escrow as (
    select * from validos where escrow_atualizado_em is not null
  ),
  itens as (
    select coalesce(sum(pi.quantidade), 0)::bigint as qtd
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
  ),
  agg as (
    select
      (select count(*) from base)::bigint as pedidos_total,
      (select count(*) from validos)::bigint as pedidos_validos,
      (select coalesce(sum(valor_total),0) from validos)::numeric as faturamento_total,
      (select coalesce(sum(valor_total),0) from com_escrow)::numeric as faturamento_com_escrow,
      (select coalesce(sum(valor_liquido),0) from com_escrow)::numeric as valor_liquido,
      (select coalesce(sum(coalesce(comissao,0)+coalesce(taxa_servico,0)+coalesce(taxa_transacao,0)),0) from com_escrow)::numeric as total_taxas,
      (select count(*) from com_escrow)::bigint as qtd_escrow,
      (select qtd from itens) as itens_vendidos,
      (select count(*) from base where status='CANCELLED')::bigint as pedidos_cancelados
  )
  select
    a.pedidos_total,
    a.pedidos_validos,
    a.faturamento_total,
    case when a.pedidos_validos = 0 then 0
         else a.faturamento_total / a.pedidos_validos end::numeric as ticket_medio,
    a.itens_vendidos,
    a.pedidos_cancelados,
    a.valor_liquido,
    a.total_taxas,
    case when a.pedidos_validos = 0 then 0
         else a.qtd_escrow::numeric / a.pedidos_validos end::numeric as cobertura_liquido,
    a.faturamento_com_escrow,
    case when a.faturamento_com_escrow = 0 then 0
         else a.total_taxas / a.faturamento_com_escrow end::numeric as percentual_taxas,
    case when a.faturamento_com_escrow = 0 then 0
         else a.valor_liquido / a.faturamento_com_escrow end::numeric as margem_liquida,
    case when a.faturamento_com_escrow = 0 then a.valor_liquido
         else a.valor_liquido * (a.faturamento_total / a.faturamento_com_escrow) end::numeric as projecao_liquido
  from agg a;
$function$;