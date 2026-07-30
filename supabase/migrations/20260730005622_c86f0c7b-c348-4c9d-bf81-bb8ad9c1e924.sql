-- 1) View de custo: usa índice btree (item_id, model_id, vigencia_inicio desc)
create or replace view public.pedido_itens_custeado
with (security_invoker = on) as
select
  pi.id, pi.order_sn, pi.item_id, pi.model_id, pi.produto, pi.sku,
  pi.quantidade, pi.preco_unitario, pi.receita, pi.status_pedido,
  pi.data_criacao_pedido, pi.created_at,
  c.custo_unitario as custo_vigente,
  pi.quantidade::numeric * c.custo_unitario as custo_total
from public.pedido_itens pi
left join lateral (
  select pc.custo_unitario
  from public.produto_custos pc
  where pc.item_id = pi.item_id
    and pc.model_id = pi.model_id
    and pc.vigencia_inicio <= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
    and coalesce(pc.vigencia_fim, '9999-12-31'::date) >= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
  order by pc.vigencia_inicio desc
  limit 1
) c on true;

-- 2) DRE: filtros de data sargáveis (usam índice em data_criacao_pedido)
create or replace function public.dre_mensal(p_ano integer, p_mes integer)
returns table (
  receita_bruta numeric, cancelamentos numeric, receita_liquida numeric,
  cmv numeric, cmv_pct numeric, lucro_bruto numeric, lucro_bruto_pct numeric,
  taxas_marketplace numeric, taxas_pct numeric, ads numeric, ads_pct numeric,
  despesas_fixas numeric, despesas_fixas_pct numeric,
  resultado_operacional numeric, resultado_operacional_pct numeric,
  impostos numeric, impostos_pct numeric, lucro_liquido numeric, lucro_liquido_pct numeric
)
language sql
stable
set search_path to 'public'
as $$
  with periodo as (
    select
      (make_date(p_ano, p_mes, 1)::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
      ((make_date(p_ano, p_mes, 1) + interval '1 month')::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  agregado as (
    select
      coalesce(sum(p.valor_total) filter (where p.status is distinct from 'CANCELLED'), 0) as bruta,
      coalesce(sum(p.valor_total) filter (where p.status = 'CANCELLED'), 0) as canc,
      coalesce(sum(p.valor_total) filter (
        where p.status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as liquida,
      coalesce(sum(coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0)) filter (
        where p.status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as taxas
    from public.pedidos p, periodo per
    where p.data_criacao_pedido >= per.ini_ts and p.data_criacao_pedido < per.fim_ts
  ),
  custo as (
    select coalesce(sum(pic.custo_total), 0) as valor
    from public.pedido_itens_custeado pic, periodo per
    where pic.data_criacao_pedido >= per.ini_ts and pic.data_criacao_pedido < per.fim_ts
      and pic.status_pedido not in ('UNPAID','CANCELLED','TO_RETURN')
  ),
  fixas as (
    select coalesce(sum(valor), 0) as valor from public.despesas_fixas where ativa = true
  ),
  cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  t as (
    select ag.bruta, ag.canc, ag.liquida, ag.taxas,
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
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.fixas)/t.liquida end,1),
    round(t.liquida * t.aliq,2),
    round(t.aliq*100,1),
    round(t.liquida - t.cmv - t.taxas - t.fixas - (t.liquida*t.aliq),2),
    round(case when t.liquida=0 then 0
               else 100.0*(t.liquida-t.cmv-t.taxas-t.fixas-(t.liquida*t.aliq))/t.liquida end,1)
  from t;
$$;

-- 3) Pedidos: filtros de data sargáveis
create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50,
  p_busca text default null, p_status text default null
)
returns table (
  total_linhas bigint, order_sn text, data_pedido timestamptz, status text,
  produto text, sku text, imagem_url text, quantidade integer, valor numeric,
  tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric,
  lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean
)
language sql
stable
set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  lim as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  pedidos_filtrados as materialized (
    select p.order_sn, p.data_criacao_pedido, p.status, p.comprador_username,
           p.valor_liquido,
           coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
           coalesce(p.frete_real,0) as frete_pedido
    from public.pedidos p, lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
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
  contagem as (select count(*) as total from pedidos_filtrados),
  pagina as (
    select * from pedidos_filtrados
    order by data_criacao_pedido desc, order_sn
    offset p_offset limit p_limite
  ),
  itens_pagina as (
    select pg.*, pic.produto, pic.sku, pic.item_id, pic.model_id, pic.quantidade,
           pic.receita, pic.custo_total,
           pic.receita / nullif(sum(pic.receita) over (partition by pg.order_sn), 0) as fatia
    from pagina pg
    join public.pedido_itens_custeado pic on pic.order_sn = pg.order_sn
  )
  select
    (select total from contagem)::bigint,
    ip.order_sn, ip.data_criacao_pedido, ip.status, ip.produto, ip.sku,
    pr.imagem_url, ip.quantidade,
    round(ip.receita,2),
    round(ip.taxa_pedido * coalesce(ip.fatia,1),2),
    round(ip.frete_pedido * coalesce(ip.fatia,1),2),
    round(ip.custo_total,2),
    round(ip.receita * (select aliq from cfg),2),
    round(
      (case when ip.valor_liquido is not null then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg), 2),
    case when ip.receita=0 then null else round(100.0*(
      (case when ip.valor_liquido is not null then ip.valor_liquido * coalesce(ip.fatia,1)
            else ip.receita*0.80 - 4.00*ip.quantidade end)
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg)
    )/ip.receita,1) end,
    ip.comprador_username,
    (ip.valor_liquido is not null)
  from itens_pagina ip
  left join public.produtos pr on pr.item_id = ip.item_id and pr.model_id = ip.model_id
  order by ip.data_criacao_pedido desc, ip.order_sn;
$$;

-- 4) Totais dos pedidos: mesmo ajuste de data
create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text default null, p_status text default null
)
returns table (
  linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric,
  custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint
)
language sql
stable
set search_path to 'public'
as $$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  lim as (
    select (p_de::timestamp at time zone 'America/Sao_Paulo') as ini_ts,
           ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo') as fim_ts
  ),
  base as (
    select
      pic.receita, pic.custo_total, pic.quantidade, p.status, p.valor_liquido,
      coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedidos p
    join public.pedido_itens_custeado pic on pic.order_sn = p.order_sn
    cross join lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
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
      case when b.status in ('UNPAID','CANCELLED','TO_RETURN') then 0
      else (case when b.valor_liquido is not null
                 then b.valor_liquido * coalesce(b.fatia,1)
                 else b.receita * 0.80 - 4.00 * b.quantidade end)
           - coalesce(b.custo_total,0)
           - b.receita * (select aliq from cfg) end
    ), 0), 2),
    count(*) filter (
      where b.valor_liquido is null and b.status not in ('UNPAID','CANCELLED','TO_RETURN')
    )::bigint
  from base b;
$$;

revoke execute on function public.dre_mensal(integer, integer) from public, anon;
grant execute on function public.dre_mensal(integer, integer) to authenticated;
revoke execute on function public.pedidos_detalhe(date, date, integer, integer, text, text) from public, anon;
grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text) to authenticated;
revoke execute on function public.pedidos_detalhe_totais(date, date, text, text) from public, anon;
grant execute on function public.pedidos_detalhe_totais(date, date, text, text) to authenticated;
grant select on public.pedido_itens_custeado to authenticated;