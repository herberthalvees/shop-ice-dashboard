create or replace function public.produtos_com_ads(p_de date, p_ate date)
returns table(item_id bigint, produto text, investimento numeric, receita_ads numeric, cliques bigint, impressoes bigint, ctr numeric, roas numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with ag as (
    select
      ac.item_id as iid,
      max(ac.nome) as nome,
      coalesce(sum(ac.investimento), 0) as inv,
      coalesce(sum(ac.receita), 0) as rec,
      coalesce(sum(ac.cliques), 0)::bigint as cli,
      coalesce(sum(ac.impressoes), 0)::bigint as imp
    from public.ads_campanhas ac
    where ac.data::date between p_de and p_ate
      and ac.item_id is not null
      and ac.item_id <> 0
    group by ac.item_id
  )
  select
    ag.iid,
    coalesce((select max(pr.produto) from public.produtos pr where pr.item_id = ag.iid), ag.nome, 'Item ' || ag.iid::text),
    ag.inv,
    ag.rec,
    ag.cli,
    ag.imp,
    case when ag.imp = 0 then 0 else round(100.0 * ag.cli / ag.imp, 2) end,
    case when ag.inv = 0 then 0 else round(ag.rec / ag.inv, 2) end
  from ag
  order by ag.inv desc;
end;
$function$;