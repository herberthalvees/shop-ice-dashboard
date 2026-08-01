create or replace function public.eh_owner_ou_service_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.eh_owner()
    or coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
$$;

create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date)
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
  return query select * from public.dashboard_kpis_periodo_impl(p_de, p_ate);
end;
$function$;

create or replace function public.carteira_resumo(p_de date, p_ate date)
returns table(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.carteira_resumo_impl(p_de, p_ate);
end;
$function$;