-- ============================================================
-- Escrow passa a operar por loja
-- ============================================================

create or replace function public.pedidos_escrow_pendentes(
  p_limite integer default 300,
  p_loja_id bigint default null
)
returns table (order_sn text)
language sql
stable
set search_path = public
as $$
  select p.order_sn
  from public.pedidos p
  where (p_loja_id is null or p.loja_id = p_loja_id)
    and p.status not in ('UNPAID', 'CANCELLED')
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

create or replace function public.aplicar_escrow(p_dados jsonb, p_loja_id bigint)
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
  where p.order_sn = d->>'order_sn' and p.loja_id = p_loja_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.pedidos_escrow_pendentes(integer, bigint) from public;
revoke execute on function public.aplicar_escrow(jsonb, bigint) from public;
grant execute on function public.pedidos_escrow_pendentes(integer, bigint) to service_role;
grant execute on function public.aplicar_escrow(jsonb, bigint) to service_role;

drop function if exists public.aplicar_escrow(jsonb);
drop function if exists public.pedidos_escrow_pendentes(integer);
