
alter table public.pedidos
  add column if not exists valor_liquido numeric,
  add column if not exists escrow_atualizado_em timestamptz;

create index if not exists idx_pedidos_escrow_pendente
  on public.pedidos (data_criacao_pedido desc)
  where escrow_atualizado_em is null;

create or replace function public.dashboard_kpis_periodo(
  p_de date,
  p_ate date
)
returns table (
  pedidos_total bigint,
  pedidos_validos bigint,
  faturamento_total numeric,
  ticket_medio numeric,
  itens_vendidos bigint,
  pedidos_cancelados bigint,
  valor_liquido numeric,
  cobertura_liquido numeric
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      p.status,
      p.valor_total,
      p.valor_liquido,
      p.escrow_atualizado_em
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
  ),
  validos as (
    select * from base where status not in ('UNPAID', 'CANCELLED')
  ),
  itens as (
    select coalesce(sum(pi.quantidade), 0)::bigint as qtd
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
  )
  select
    (select count(*) from base)::bigint,
    (select count(*) from validos)::bigint,
    (select coalesce(sum(valor_total), 0) from validos)::numeric,
    case
      when (select count(*) from validos) = 0 then 0
      else (select coalesce(sum(valor_total), 0) from validos)
           / (select count(*) from validos)
    end::numeric,
    (select qtd from itens),
    (select count(*) from base where status = 'CANCELLED')::bigint,
    (select coalesce(sum(valor_liquido), 0) from validos)::numeric,
    case
      when (select count(*) from validos) = 0 then 0
      else (select count(*) from validos where escrow_atualizado_em is not null)::numeric
           / (select count(*) from validos)
    end::numeric;
$$;

create or replace function public.dashboard_serie_periodo(
  p_de date,
  p_ate date
)
returns table (
  periodo date,
  rotulo text,
  pedidos bigint,
  faturamento numeric,
  parcial boolean
)
language sql
stable
set search_path = public
as $$
  with cfg as (
    select
      case
        when (p_ate - p_de) > 90 then 'mes'
        when (p_ate - p_de) > 31 then 'semana'
        else 'dia'
      end as gran,
      (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  calendario as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month', d)::date
        when 'semana' then date_trunc('week', d)::date
        else d::date
      end as periodo
    from generate_series(p_de, p_ate, interval '1 day') as d
    group by 1
  ),
  vendas as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month',
          (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        when 'semana' then date_trunc('week',
          (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        else (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
      end as periodo,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID', 'CANCELLED')
      ), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
    group by 1
  )
  select
    c.periodo,
    case (select gran from cfg)
      when 'mes' then to_char(c.periodo, 'MM/YYYY')
      when 'semana' then to_char(c.periodo, 'DD/MM')
      else to_char(c.periodo, 'DD/MM')
    end,
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    c.periodo = (select hoje from cfg)
  from calendario c
  left join vendas v on v.periodo = c.periodo
  order by c.periodo;
$$;

create or replace function public.dashboard_top_produtos_periodo(
  p_de date,
  p_ate date,
  p_limite integer default 10
)
returns table (
  produto text,
  sku text,
  quantidade bigint,
  receita numeric
)
language sql
stable
set search_path = public
as $$
  select
    max(pi.produto),
    pi.sku,
    sum(pi.quantidade)::bigint,
    sum(pi.receita)::numeric
  from public.pedido_itens pi
  where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
        between p_de and p_ate
    and pi.status_pedido not in ('UNPAID', 'CANCELLED')
  group by pi.sku
  order by 3 desc
  limit p_limite;
$$;

revoke execute on function public.dashboard_kpis_periodo(date, date) from public;
revoke execute on function public.dashboard_serie_periodo(date, date) from public;
revoke execute on function public.dashboard_top_produtos_periodo(date, date, integer) from public;

grant execute on function public.dashboard_kpis_periodo(date, date) to authenticated;
grant execute on function public.dashboard_serie_periodo(date, date) to authenticated;
grant execute on function public.dashboard_top_produtos_periodo(date, date, integer) to authenticated;
