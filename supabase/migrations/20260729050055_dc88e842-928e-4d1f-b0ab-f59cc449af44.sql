-- Nova tabela produtos com variações
drop table if exists public.produtos cascade;

create table public.produtos (
  id bigserial primary key,
  item_id bigint not null,
  model_id bigint not null default 0,
  sku text,
  produto text,
  variacao text,
  preco_atual numeric,
  preco_original numeric,
  estoque_disponivel integer,
  estoque_reservado integer,
  status_item text,
  imagem_url text,
  atualizado_em timestamptz not null default now(),
  unique (item_id, model_id)
);

create index if not exists idx_produtos_sku on public.produtos (sku);
create index if not exists idx_produtos_estoque on public.produtos (estoque_disponivel);
create index if not exists idx_produtos_status on public.produtos (status_item);

grant select on public.produtos to authenticated;
grant all on public.produtos to service_role;

alter table public.produtos enable row level security;

create policy "admins read produtos"
  on public.produtos for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- Aplica um lote de produtos de uma vez
create or replace function public.aplicar_produtos(p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.produtos (
    item_id, model_id, sku, produto, variacao,
    preco_atual, preco_original, estoque_disponivel,
    estoque_reservado, status_item, imagem_url, atualizado_em
  )
  select
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
  on conflict (item_id, model_id) do update set
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

revoke execute on function public.aplicar_produtos(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_produtos(jsonb) to service_role;

-- Produtos com giro (vendas do período)
create or replace function public.produtos_com_giro(
  p_dias integer default 30
)
returns table (
  sku text,
  produto text,
  variacao text,
  preco_atual numeric,
  estoque_disponivel integer,
  vendidos_periodo bigint,
  media_diaria numeric,
  dias_de_estoque numeric,
  status_item text,
  imagem_url text
)
language sql
stable
set search_path = public
as $$
  with vendas as (
    select
      pi.sku,
      sum(pi.quantidade)::bigint as vendidos
    from public.pedido_itens pi
    where pi.data_criacao_pedido >= now() - make_interval(days => p_dias)
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
    group by pi.sku
  )
  select
    p.sku,
    p.produto,
    p.variacao,
    p.preco_atual,
    p.estoque_disponivel,
    coalesce(v.vendidos, 0)::bigint,
    round(coalesce(v.vendidos, 0)::numeric / p_dias, 2),
    case
      when coalesce(v.vendidos, 0) = 0 then null
      else round(p.estoque_disponivel
                 / (v.vendidos::numeric / p_dias), 1)
    end,
    p.status_item,
    p.imagem_url
  from public.produtos p
  left join vendas v on v.sku = p.sku
  order by coalesce(v.vendidos, 0) desc;
$$;

revoke execute on function public.produtos_com_giro(integer) from public, anon;
grant execute on function public.produtos_com_giro(integer) to authenticated;