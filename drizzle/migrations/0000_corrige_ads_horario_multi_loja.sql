-- 1) Gasto por hora de Ads passa a ser por loja (a chave antiga misturava as lojas)
delete from public.ads_gasto_horario;

alter table public.ads_gasto_horario drop constraint ads_gasto_horario_pkey;
alter table public.ads_gasto_horario add constraint ads_gasto_horario_pkey primary key (loja_id, data, hora);

-- 2) Serie horaria do dashboard: o total diario de Ads era somado duas vezes
--    (linha agregada da loja + linhas por item). Agora usa ads_totais_periodo,
--    que ja deduplica por dia, e normaliza as horas ao total correto do dia.
create or replace function public.dashboard_serie_horaria_impl(
  p_de date,
  p_ate date,
  p_marketplace text default null,
  p_loja_id bigint default null
)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with horas as (
    select h::smallint as hora from generate_series(0, 23) h
  ),
  vendas as (
    select
      extract(hour from (data_criacao_pedido at time zone 'America/Sao_Paulo'))::smallint as hora,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
    group by 1
  ),
  ads_real as (
    select g.hora, sum(g.investimento)::numeric as valor
    from public.ads_gasto_horario g
    where g.data between p_de and p_ate
      and coalesce(p_marketplace, 'shopee') = 'shopee'
      and (p_loja_id is null or g.loja_id = p_loja_id)
    group by 1
  ),
  total_dia as (
    select case when coalesce(p_marketplace, 'shopee') <> 'shopee' then 0
                else coalesce(a.investimento, 0)
           end as total
    from public.ads_totais_periodo(p_de, p_ate, p_loja_id) a
  ),
  real_total as (
    select coalesce(sum(valor), 0) as total from ads_real
  ),
  fator as (
    -- reescala as horas para fechar com o total diario correto
    select case
             when (select total from real_total) > 0 and (select total from total_dia) > 0
               then (select total from total_dia) / (select total from real_total)
             else 0
           end as f
  )
  select
    h.hora,
    lpad(h.hora::text, 2, '0') || 'h',
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    case
      when (select f from fator) > 0 then round(coalesce(ar.valor, 0) * (select f from fator), 2)::numeric
      else round((select total from total_dia) / 24.0, 2)::numeric
    end
  from horas h
  left join vendas v on v.hora = h.hora
  left join ads_real ar on ar.hora = h.hora
  order by h.hora;
end;
$function$;

revoke all on function public.dashboard_serie_horaria_impl(date, date, text, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_serie_horaria_impl(date, date, text, bigint) to service_role;
