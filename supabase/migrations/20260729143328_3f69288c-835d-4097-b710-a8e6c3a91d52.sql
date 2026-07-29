create or replace function public.aplicar_carteira(p_dados jsonb)
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
    transaction_id, status, wallet_type, tipo, tab_type, fluxo,
    valor, taxa, saldo_apos, order_sn, refund_sn, withdrawal_id,
    withdrawal_type, descricao, comprador, data_transacao, payload
  )
  select
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
  on conflict (transaction_id) do update set
    status = excluded.status,
    saldo_apos = excluded.saldo_apos,
    payload = excluded.payload;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.aplicar_carteira(jsonb) to service_role;