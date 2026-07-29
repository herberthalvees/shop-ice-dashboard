
alter table public.pedidos
  add column if not exists comissao numeric,
  add column if not exists taxa_servico numeric,
  add column if not exists taxa_transacao numeric,
  add column if not exists escrow_payload jsonb;

create or replace function public.pedidos_escrow_pendentes(
  p_limite integer default 300
)
returns table (order_sn text)
language sql
stable
set search_path = public
as $$
  select p.order_sn
  from public.pedidos p
  where p.status not in ('UNPAID', 'CANCELLED')
    and (
      p.escrow_atualizado_em is null
      or (
        p.status <> 'COMPLETED'
        and p.escrow_atualizado_em < now() - interval '24 hours'
      )
    )
  order by p.data_criacao_pedido desc
  limit p_limite;
$$;

create or replace function public.aplicar_escrow(p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.pedidos p
  set
    valor_liquido = nullif(d->>'valor_liquido', '')::numeric,
    comissao = nullif(d->>'comissao', '')::numeric,
    taxa_servico = nullif(d->>'taxa_servico', '')::numeric,
    taxa_transacao = nullif(d->>'taxa_transacao', '')::numeric,
    escrow_payload = d->'payload',
    escrow_atualizado_em = now(),
    updated_at = now()
  from jsonb_array_elements(p_dados) as d
  where p.order_sn = d->>'order_sn';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.pedidos_escrow_pendentes(integer) from public;
revoke execute on function public.aplicar_escrow(jsonb) from public;
grant execute on function public.pedidos_escrow_pendentes(integer) to service_role;
grant execute on function public.aplicar_escrow(jsonb) to service_role;

drop function if exists public.dashboard_kpis_periodo(date, date);
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
  total_taxas numeric,
  cobertura_liquido numeric
)
language sql
stable
set search_path = public
as $$
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
    (select coalesce(sum(coalesce(comissao,0) + coalesce(taxa_servico,0)
       + coalesce(taxa_transacao,0)), 0) from validos)::numeric,
    case
      when (select count(*) from validos) = 0 then 0
      else (select count(*) from validos where escrow_atualizado_em is not null)::numeric
           / (select count(*) from validos)
    end::numeric;
$$;

revoke execute on function public.dashboard_kpis_periodo(date, date) from public;
grant execute on function public.dashboard_kpis_periodo(date, date) to authenticated;
