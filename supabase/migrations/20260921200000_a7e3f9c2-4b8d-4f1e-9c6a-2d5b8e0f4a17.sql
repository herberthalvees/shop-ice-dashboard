-- ============================================================
-- aplicar_produtos passa a gravar por loja
-- ============================================================

create or replace function public.aplicar_produtos(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.produtos (
    loja_id, item_id, model_id, sku, produto, variacao,
    preco_atual, preco_original, estoque_disponivel,
    estoque_reservado, status_item, imagem_url, atualizado_em
  )
  select
    p_loja_id,
    (d->>'item_id')::bigint,
    coalesce((d->>'model_id')::bigint, 0),
    nullif(d->>'sku', ''),
    d->>'produto',
    nullif(d->>'variacao', ''),
    nullif(d->>'preco_atual', '')::numeric,
    nullif(d->>'preco_original', '')::numeric,
    nullif(d->>'estoque_disponivel', '')::integer,
    nullif(d->>'estoque_reservado', '')::integer,
    nullif(d->>'status_item', ''),
    nullif(d->>'imagem_url', ''),
    now()
  from jsonb_array_elements(p_dados) as d
  on conflict (loja_id, item_id, model_id) do update set
    sku = excluded.sku,
    produto = excluded.produto,
    variacao = excluded.variacao,
    preco_atual = excluded.preco_atual,
    preco_original = excluded.preco_original,
    estoque_disponivel = excluded.estoque_disponivel,
    estoque_reservado = excluded.estoque_reservado,
    status_item = excluded.status_item,
    imagem_url = excluded.imagem_url,
    atualizado_em = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.aplicar_produtos(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.aplicar_produtos(jsonb, bigint) to service_role;

-- A assinatura antiga (sem loja) não é mais chamada por ninguém; remove
-- para não sobrar uma versão que grava sem loja_id (que agora é NOT NULL,
-- então ela nem funcionaria mais).
drop function if exists public.aplicar_produtos(jsonb);
