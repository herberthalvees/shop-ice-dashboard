CREATE OR REPLACE FUNCTION public.dashboard_serie_horaria_impl(p_de date, p_ate date)
RETURNS TABLE(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
    group by 1
  ),
  ads as (
    select coalesce(sum(investimento), 0)::numeric / 24 as por_hora
    from public.ads_campanhas
    where (data at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  )
  select
    h.hora,
    lpad(h.hora::text, 2, '0') || 'h',
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    (select por_hora from ads)::numeric
  from horas h
  left join vendas v on v.hora = h.hora
  order by h.hora;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_serie_horaria(p_de date, p_ate date)
RETURNS TABLE(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
  from public.dashboard_serie_horaria_impl(p_de, p_ate) s;
end; $function$;

REVOKE ALL ON FUNCTION public.dashboard_serie_horaria_impl(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_horaria(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_horaria(date, date) TO service_role;