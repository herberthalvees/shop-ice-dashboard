create or replace function public.pedidos_detalhe(
  p_de date,
  p_ate date,
  p_offset integer default 0,
  p_limite integer default 50,
  p_busca text default null,
  p_status text default null
)
returns table (
  total_linhas bigint,
  order_sn text,
  data_pedido timestamptz,
  status text,
  produto text,
  sku text,
  imagem_url text,
  quantidade integer,
  valor numeric,
  tarifa numeric,
  frete_vendedor numeric,
  custo numeric,
  imposto numeric,
  lucro numeric,
  margem_pct numeric,
  comprador text
)
language sql
stable
set search_path = public
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  base as (
    select
      pic.order_sn,
      pic.produto,
      pic.sku,
      pic.item_id,
      pic.model_id,
      pic.quantidade,
      pic.receita,
      pic.custo_total,
      p.data_criacao_pedido,
      p.status,
      p.comprador_username,
      p.valor_liquido,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
        + coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedido_itens_custeado pic
    join public.pedidos p on p.order_sn = pic.order_sn
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and (p_status is null or p.status = p_status)
      and (
        p_busca is null
        or p.order_sn ilike '%' || p_busca || '%'
        or pic.sku ilike '%' || p_busca || '%'
        or pic.produto ilike '%' || p_busca || '%'
        or p.comprador_username ilike '%' || p_busca || '%'
      )
  ),
  calc as (
    select
      b.*,
      b.taxa_pedido * coalesce(b.fatia, 1) as tarifa_item,
      b.frete_pedido * coalesce(b.fatia, 1) as frete_item,
      coalesce(b.valor_liquido, 0) * coalesce(b.fatia, 1) as liquido_item,
      b.receita * (select aliq from cfg) as imposto_item
    from base b
  )
  select
    count(*) over ()::bigint,
    c.order_sn,
    c.data_criacao_pedido,
    c.status,
    c.produto,
    c.sku,
    pr.imagem_url,
    c.quantidade,
    round(c.receita, 2),
    round(c.tarifa_item, 2),
    round(c.frete_item, 2),
    round(c.custo_total, 2),
    round(c.imposto_item, 2),
    round(c.liquido_item - coalesce(c.custo_total, 0) - c.imposto_item, 2),
    case when c.receita = 0 then null
         else round(100.0 * (c.liquido_item - coalesce(c.custo_total,0)
                    - c.imposto_item) / c.receita, 1) end,
    c.comprador_username
  from calc c
  left join public.produtos pr
    on pr.item_id = c.item_id and pr.model_id = c.model_id
  order by c.data_criacao_pedido desc
  offset p_offset
  limit p_limite;
$$;

grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text)
  to authenticated;

create or replace function public.pedidos_detalhe_totais(
  p_de date,
  p_ate date,
  p_busca text default null,
  p_status text default null
)
returns table (
  linhas bigint,
  valor numeric,
  tarifa numeric,
  frete_vendedor numeric,
  custo numeric,
  imposto numeric,
  lucro numeric
)
language sql
stable
set search_path = public
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  base as (
    select
      pic.receita,
      pic.custo_total,
      p.status,
      p.valor_liquido,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
        + coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedido_itens_custeado pic
    join public.pedidos p on p.order_sn = pic.order_sn
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and (p_status is null or p.status = p_status)
      and (
        p_busca is null
        or p.order_sn ilike '%' || p_busca || '%'
        or pic.sku ilike '%' || p_busca || '%'
        or pic.produto ilike '%' || p_busca || '%'
        or p.comprador_username ilike '%' || p_busca || '%'
      )
  )
  select
    count(*)::bigint,
    round(coalesce(sum(b.receita), 0), 2),
    round(coalesce(sum(b.taxa_pedido * coalesce(b.fatia, 1)), 0), 2),
    round(coalesce(sum(b.frete_pedido * coalesce(b.fatia, 1)), 0), 2),
    round(coalesce(sum(b.custo_total), 0), 2),
    round(coalesce(sum(b.receita * (select aliq from cfg)), 0), 2),
    round(coalesce(sum(
      case when b.status in ('UNPAID','CANCELLED') then 0
      else coalesce(b.valor_liquido,0) * coalesce(b.fatia,1)
           - coalesce(b.custo_total,0)
           - b.receita * (select aliq from cfg) end
    ), 0), 2)
  from base b;
$$;

grant execute on function public.pedidos_detalhe_totais(date, date, text, text)
  to authenticated;