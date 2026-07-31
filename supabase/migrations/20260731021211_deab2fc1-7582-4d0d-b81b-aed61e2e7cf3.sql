create or replace function public.ads_totais_periodo(p_de date, p_ate date)
returns table (
  investimento numeric,
  receita numeric,
  pedidos bigint,
  cliques bigint,
  impressoes bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  with por_dia as (
    select
      ac.data::date as dia,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.investimento) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.investimento) filter (where ac.item_id is not null), 0)
      end as investimento,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.receita) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.receita) filter (where ac.item_id is not null), 0)
      end as receita,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.pedidos) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.pedidos) filter (where ac.item_id is not null), 0)
      end as pedidos,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.cliques) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.cliques) filter (where ac.item_id is not null), 0)
      end as cliques,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.impressoes) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.impressoes) filter (where ac.item_id is not null), 0)
      end as impressoes
    from public.ads_campanhas as ac
    where ac.data::date between p_de and p_ate
    group by ac.data::date
  )
  select
    coalesce(sum(pd.investimento), 0)::numeric,
    coalesce(sum(pd.receita), 0)::numeric,
    coalesce(sum(pd.pedidos), 0)::bigint,
    coalesce(sum(pd.cliques), 0)::bigint,
    coalesce(sum(pd.impressoes), 0)::bigint
  from por_dia as pd;
$function$;

revoke all on function public.ads_totais_periodo(date, date) from public, anon, authenticated;
grant execute on function public.ads_totais_periodo(date, date) to service_role;

create or replace function public.ads_resumo(p_de date, p_ate date)
returns table (
  investimento numeric, receita numeric, pedidos bigint,
  roas numeric, acos numeric, tacos numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with a as (
    select * from public.ads_totais_periodo(p_de, p_ate)
  ),
  fat as (
    select coalesce(sum(p.valor_total), 0) as total
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  )
  select
    a.investimento,
    a.receita,
    a.pedidos,
    case when a.investimento = 0 then 0 else round(a.receita / a.investimento, 2) end,
    case when a.receita = 0 then 0 else round(100.0 * a.investimento / a.receita, 2) end,
    case when f.total = 0 then 0 else round(100.0 * a.investimento / f.total, 2) end
  from a cross join fat as f;
end;
$function$;

revoke all on function public.ads_resumo(date, date) from public, anon;
grant execute on function public.ads_resumo(date, date) to authenticated;

create or replace function public.produtos_com_ads(p_de date, p_ate date)
returns table(
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
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  select
    ac.item_id,
    coalesce(max(pr.produto), max(ac.nome), 'Item ' || ac.item_id::text) as produto,
    coalesce(sum(ac.investimento), 0) as investimento,
    coalesce(sum(ac.receita), 0) as receita_ads,
    coalesce(sum(ac.cliques), 0)::bigint as cliques,
    coalesce(sum(ac.impressoes), 0)::bigint as impressoes,
    case when coalesce(sum(ac.impressoes), 0) = 0 then 0
         else round(100.0 * sum(ac.cliques) / sum(ac.impressoes), 2) end as ctr,
    case when coalesce(sum(ac.investimento), 0) = 0 then 0
         else round(sum(ac.receita) / sum(ac.investimento), 2) end as roas
  from public.ads_campanhas as ac
  left join public.produtos as pr on pr.item_id = ac.item_id
  where ac.data::date between p_de and p_ate
    and ac.item_id is not null
    and ac.item_id <> 0
  group by ac.item_id
  order by sum(ac.investimento) desc;
end;
$function$;

revoke all on function public.produtos_com_ads(date, date) from public, anon;
grant execute on function public.produtos_com_ads(date, date) to authenticated;