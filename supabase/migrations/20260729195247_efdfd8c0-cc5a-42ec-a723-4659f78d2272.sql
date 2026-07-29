create or replace function public.status_disponiveis()
returns table (status text, pedidos bigint)
language sql
stable
set search_path = public
as $$
  select p.status, count(*)::bigint
  from public.pedidos p
  where p.status is not null
  group by p.status
  order by count(*) desc;
$$;

grant execute on function public.status_disponiveis() to authenticated;