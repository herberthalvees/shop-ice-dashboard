create or replace function public.produtos_com_ads(
  p_de date,
  p_ate date
)
returns table (
  item_id bigint,
  produto text,
  investimento numeric,
  receita_ads numeric,
  cliques bigint,
  impressoes bigint,
  ctr numeric,
  roas numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not eh_owner() then raise exception 'acesso negado'; end if;
  return query
  select
    ac.item_id,
    max(ac.nome) as produto,
    coalesce(sum(ac.investimento), 0) as investimento,
    coalesce(sum(ac.receita), 0) as receita_ads,
    coalesce(sum(ac.cliques), 0)::bigint as cliques,
    coalesce(sum(ac.impressoes), 0)::bigint as impressoes,
    case when sum(ac.impressoes) = 0 then 0
         else round(100.0 * sum(ac.cliques) / sum(ac.impressoes), 2) end,
    case when sum(ac.investimento) = 0 then 0
         else round(sum(ac.receita) / sum(ac.investimento), 2) end
  from public.ads_campanhas ac
  where ac.data::date between p_de and p_ate
    and ac.item_id is not null
  group by ac.item_id
  order by sum(ac.investimento) desc;
end;
$function$;

grant execute on function public.produtos_com_ads(date, date) to authenticated;