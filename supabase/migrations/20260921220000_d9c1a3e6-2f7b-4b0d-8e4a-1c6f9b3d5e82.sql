-- ============================================================
-- carteira_transacoes / aplicar_carteira passam a gravar por loja
-- transaction_id era PRIMARY KEY sozinho; vira único junto com
-- loja_id (sem FK apontando pra cá, seguro trocar a PK).
-- ============================================================

alter table public.carteira_transacoes drop constraint if exists carteira_transacoes_pkey;
alter table public.carteira_transacoes
  add constraint carteira_transacoes_loja_transaction_key unique (loja_id, transaction_id);

create or replace function public.aplicar_carteira(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  with unicos as (
    select distinct on ((d.value->>'transaction_id')::bigint)
      d.value as item
    from jsonb_array_elements(p_dados) as d
    where d.value->>'transaction_id' is not null
    order by
      (d.value->>'transaction_id')::bigint,
      (d.value->>'create_time')::bigint desc
  )
  insert into public.carteira_transacoes (
    loja_id, transaction_id, status, wallet_type, tipo, tab_type, fluxo,
    valor, taxa, saldo_apos, order_sn, refund_sn, withdrawal_id,
    withdrawal_type, descricao, comprador, data_transacao, payload
  )
  select
    p_loja_id,
    (item->>'transaction_id')::bigint,
    item->>'status',
    item->>'wallet_type',
    item->>'transaction_type',
    item->>'transaction_tab_type',
    item->>'money_flow',
    nullif(item->>'amount','')::numeric,
    nullif(item->>'transaction_fee','')::numeric,
    nullif(item->>'current_balance','')::numeric,
    nullif(item->>'order_sn',''),
    nullif(item->>'refund_sn',''),
    nullif(item->>'withdrawal_id','')::bigint,
    nullif(item->>'withdrawal_type',''),
    item->>'description',
    nullif(item->>'buyer_name',''),
    to_timestamp((item->>'create_time')::bigint),
    item
  from unicos
  on conflict (loja_id, transaction_id) do update set
    status = excluded.status,
    saldo_apos = excluded.saldo_apos,
    payload = excluded.payload;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.aplicar_carteira(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.aplicar_carteira(jsonb, bigint) to service_role;

drop function if exists public.aplicar_carteira(jsonb);
