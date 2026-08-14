
create or replace function public.pedidos_em_transito_impl(p_marketplace text default null)
returns table(pedidos bigint, valor numeric, unidades bigint, custo numeric, cobertura_custo numeric)
language sql
stable
set search_path to 'public'
as $$
  with ped as (
    select count(*) as qt, coalesce(sum(valor_total),0) as vl
    from public.pedidos
    where status in ('SHIPPED','TO_CONFIRM_RECEIVE')
      and (p_marketplace is null or marketplace = p_marketplace)
  ),
  itens as (
    select coalesce(sum(pic.custo_total),0) as custo,
           coalesce(sum(pic.quantidade),0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null),0) as unid_cc
    from public.pedido_itens_custeado pic
    where pic.status_pedido in ('SHIPPED','TO_CONFIRM_RECEIVE')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
  )
  select ped.qt::bigint,
         round(ped.vl,2),
         itens.unid::bigint,
         round(itens.custo,2),
         round(case when itens.unid = 0 then 0 else itens.unid_cc::numeric / itens.unid end, 4)
  from ped, itens;
$$;

create or replace function public.pedidos_em_transito(p_marketplace text default null)
returns table(pedidos bigint, valor numeric, unidades bigint, custo numeric, cobertura_custo numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_em_transito_impl(p_marketplace);
end;
$$;

revoke all on function public.pedidos_em_transito_impl(text) from public, anon, authenticated;
revoke all on function public.pedidos_em_transito(text) from public, anon;
grant execute on function public.pedidos_em_transito(text) to authenticated, service_role;
