create table if not exists public.carteira_transacoes (
  transaction_id bigint primary key,
  status text,
  wallet_type text,
  tipo text,
  tab_type text,
  fluxo text,
  valor numeric,
  taxa numeric,
  saldo_apos numeric,
  order_sn text,
  refund_sn text,
  withdrawal_id bigint,
  withdrawal_type text,
  descricao text,
  comprador text,
  data_transacao timestamptz,
  payload jsonb,
  created_at timestamptz not null default now()
);

grant select on public.carteira_transacoes to authenticated;
grant all on public.carteira_transacoes to service_role;

create index if not exists idx_carteira_data
  on public.carteira_transacoes (data_transacao desc);
create index if not exists idx_carteira_tipo
  on public.carteira_transacoes (tipo);
create index if not exists idx_carteira_order
  on public.carteira_transacoes (order_sn);

alter table public.carteira_transacoes enable row level security;

create policy "admins read carteira_transacoes"
  on public.carteira_transacoes
  for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

create or replace function public.aplicar_carteira(p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.carteira_transacoes (
    transaction_id, status, wallet_type, tipo, tab_type, fluxo,
    valor, taxa, saldo_apos, order_sn, refund_sn, withdrawal_id,
    withdrawal_type, descricao, comprador, data_transacao, payload
  )
  select
    (d->>'transaction_id')::bigint,
    d->>'status',
    d->>'wallet_type',
    d->>'transaction_type',
    d->>'transaction_tab_type',
    d->>'money_flow',
    nullif(d->>'amount','')::numeric,
    nullif(d->>'transaction_fee','')::numeric,
    nullif(d->>'current_balance','')::numeric,
    nullif(d->>'order_sn',''),
    nullif(d->>'refund_sn',''),
    nullif(d->>'withdrawal_id','')::bigint,
    nullif(d->>'withdrawal_type',''),
    d->>'description',
    nullif(d->>'buyer_name',''),
    to_timestamp((d->>'create_time')::bigint),
    d
  from jsonb_array_elements(p_dados) as d
  on conflict (transaction_id) do update set
    status = excluded.status,
    saldo_apos = excluded.saldo_apos,
    payload = excluded.payload;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.aplicar_carteira(jsonb) from public;
grant execute on function public.aplicar_carteira(jsonb) to service_role;

create or replace function public.carteira_resumo(
  p_de date,
  p_ate date
)
returns table (
  saldo_atual numeric,
  saldo_em timestamptz,
  entradas numeric,
  saidas numeric,
  saques numeric,
  em_transito numeric,
  pedidos_em_transito bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ultimo as (
    select saldo_apos, data_transacao
    from public.carteira_transacoes
    order by data_transacao desc, transaction_id desc
    limit 1
  ),
  periodo as (
    select
      coalesce(sum(valor) filter (where fluxo = 'MONEY_IN'), 0) as ent,
      coalesce(sum(abs(valor)) filter (where fluxo = 'MONEY_OUT'), 0) as sai,
      coalesce(sum(abs(valor)) filter (
        where withdrawal_id is not null and withdrawal_id > 0), 0) as saq
    from public.carteira_transacoes
    where (data_transacao at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
  ),
  transito as (
    select
      coalesce(sum(p.valor_liquido), 0) as valor,
      count(*)::bigint as qtd
    from public.pedidos p
    where p.valor_liquido is not null
      and p.status not in ('UNPAID', 'CANCELLED')
      and not exists (
        select 1 from public.carteira_transacoes c
        where c.order_sn = p.order_sn and c.fluxo = 'MONEY_IN'
      )
  )
  select
    (select saldo_apos from ultimo),
    (select data_transacao from ultimo),
    (select ent from periodo),
    (select sai from periodo),
    (select saq from periodo),
    (select valor from transito),
    (select qtd from transito);
$$;

revoke all on function public.carteira_resumo(date, date) from public;
grant execute on function public.carteira_resumo(date, date) to authenticated;