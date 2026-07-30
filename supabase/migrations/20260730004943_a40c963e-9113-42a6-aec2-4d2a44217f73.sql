create or replace function public.dre_mensal(
  p_ano integer,
  p_mes integer
)
returns table (
  receita_bruta numeric,
  cancelamentos numeric,
  receita_liquida numeric,
  cmv numeric,
  cmv_pct numeric,
  lucro_bruto numeric,
  lucro_bruto_pct numeric,
  taxas_marketplace numeric,
  taxas_pct numeric,
  ads numeric,
  ads_pct numeric,
  despesas_fixas numeric,
  despesas_fixas_pct numeric,
  resultado_operacional numeric,
  resultado_operacional_pct numeric,
  impostos numeric,
  impostos_pct numeric,
  lucro_liquido numeric,
  lucro_liquido_pct numeric
)
language sql
stable
set search_path to 'public'
as $$
  with periodo as (
    select make_date(p_ano, p_mes, 1) as inicio,
           (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date as fim
  ),
  pedidos_mes as materialized (
    select
      p.status,
      p.valor_total,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
        + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p, periodo per
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between per.inicio and per.fim
  ),
  agregado as (
    select
      coalesce(sum(valor_total) filter (where status is distinct from 'CANCELLED'), 0) as bruta,
      coalesce(sum(valor_total) filter (where status = 'CANCELLED'), 0) as canc,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as liquida,
      coalesce(sum(taxa) filter (
        where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as taxas
    from pedidos_mes
  ),
  custo as (
    select coalesce(sum(pic.custo_total), 0) as valor
    from public.pedido_itens_custeado pic, periodo per
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between per.inicio and per.fim
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  fixas as (
    select coalesce(sum(valor), 0) as valor
    from public.despesas_fixas where ativa = true
  ),
  cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  t as (
    select
      ag.bruta, ag.canc, ag.liquida, ag.taxas,
      (select valor from custo) as cmv,
      (select valor from fixas) as fixas,
      (select aliq from cfg) as aliq
    from agregado ag
  )
  select
    round(t.bruta,2), round(t.canc,2), round(t.liquida,2),
    round(t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*t.cmv/t.liquida end,1),
    round(t.liquida - t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv)/t.liquida end,1),
    round(t.taxas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.taxas/t.liquida end,1),
    0::numeric, 0::numeric,
    round(t.fixas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.fixas/t.liquida end,1),
    round(t.liquida - t.cmv - t.taxas - t.fixas,2),
    round(case when t.liquida=0 then 0
               else 100.0*(t.liquida-t.cmv-t.taxas-t.fixas)/t.liquida end,1),
    round(t.liquida * t.aliq,2),
    round(t.aliq*100,1),
    round(t.liquida - t.cmv - t.taxas - t.fixas - (t.liquida*t.aliq),2),
    round(case when t.liquida=0 then 0
               else 100.0*(t.liquida-t.cmv-t.taxas-t.fixas-(t.liquida*t.aliq))/t.liquida end,1)
  from t;
$$;

revoke execute on function public.dre_mensal(integer, integer) from public, anon;
grant execute on function public.dre_mensal(integer, integer) to authenticated;

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
  comprador text,
  tem_escrow boolean
)
language sql
stable
set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  pedidos_filtrados as materialized (
    select p.order_sn, p.data_criacao_pedido, p.status, p.comprador_username,
           p.valor_liquido,
           coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)
             +coalesce(p.taxa_transacao,0) as taxa_pedido,
           coalesce(p.frete_real,0) as frete_pedido
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and (p_status is null or p.status = p_status)
      and (
        p_busca is null
        or p.order_sn ilike '%'||p_busca||'%'
        or p.comprador_username ilike '%'||p_busca||'%'
        or exists (
          select 1 from public.pedido_itens pi2
          where pi2.order_sn = p.order_sn
            and (pi2.sku ilike '%'||p_busca||'%' or pi2.produto ilike '%'||p_busca||'%')
        )
      )
  ),
  contagem as (
    select count(*) as total from pedidos_filtrados
  ),
  pagina as (
    select * from pedidos_filtrados
    order by data_criacao_pedido desc, order_sn
    offset p_offset
    limit p_limite
  ),
  itens_pagina as (
    select
      pg.*,
      pic.produto, pic.sku, pic.item_id, pic.model_id, pic.quantidade,
      pic.receita, pic.custo_total,
      pic.receita / nullif(sum(pic.receita) over (partition by pg.order_sn), 0) as fatia
    from pagina pg
    join public.pedido_itens_custeado pic on pic.order_sn = pg.order_sn
  )
  select
    (select total from contagem)::bigint,
    ip.order_sn,
    ip.data_criacao_pedido,
    ip.status,
    ip.produto,
    ip.sku,
    pr.imagem_url,
    ip.quantidade,
    round(ip.receita,2),
    round(ip.taxa_pedido * coalesce(ip.fatia,1),2),
    round(ip.frete_pedido * coalesce(ip.fatia,1),2),
    round(ip.custo_total,2),
    round(ip.receita * (select aliq from cfg),2),
    round(
      (case when ip.valor_liquido is not null
            then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg)
    ,2),
    case when ip.receita=0 then null else round(100.0*(
      (case when ip.valor_liquido is not null
            then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg)
    )/ip.receita,1) end,
    ip.comprador_username,
    (ip.valor_liquido is not null)
  from itens_pagina ip
  left join public.produtos pr on pr.item_id = ip.item_id and pr.model_id = ip.model_id
  order by ip.data_criacao_pedido desc, ip.order_sn;
$$;

revoke execute on function public.pedidos_detalhe(date, date, integer, integer, text, text) from public, anon;
grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text) to authenticated;