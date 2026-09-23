-- ============================================================
-- Substitui a estimativa de líquido (80% do valor − R$4/item) por
-- comissão + taxa de serviço + taxa de transação REAIS em todo
-- relatório que calcula lucro/margem — Dashboard, Pedidos e
-- Precificação (a DRE já usava dado real).
--
-- Checado antes de aplicar: só 3 de 6.994 pedidos válidos de setembro
-- (R$96,08, 0,04% da receita) ainda não têm o repasse confirmado pela
-- Shopee — a estimativa não estava cobrindo uma lacuna relevante, só
-- introduzindo ruído em cima de um dado que quase sempre já existe.
-- Pedidos sem repasse confirmado ainda entram com taxa considerada
-- zero (não adivinha), até o sync de escrow trazer o valor real.
-- ============================================================

-- ---------- dashboard_kpis_periodo_impl ----------
create or replace function public.dashboard_kpis_periodo_impl(
  p_de date, p_ate date, p_marketplace text default null, p_loja_id bigint default null
)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language sql stable set search_path to 'public'
as $function$
  with validos as (
    select p.valor_total,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and status = 'CANCELLED'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and status = 'TO_RETURN'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  custos as (
    select coalesce(sum(pic.custo_total), 0) as custo,
           coalesce(sum(pic.quantidade), 0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null), 0) as unid_com_custo
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads as (
    select case when p_marketplace = 'tiktok' then 0
                else coalesce(sum(investimento), 0)
           end as investimento
    from public.ads_totais_periodo(p_de, p_ate, p_loja_id)
  ),
  cfg as (select coalesce(max(aliquota_imposto), 0) as aliq from public.config),
  t as (
    select
      (select count(*) from validos) as qt,
      (select coalesce(sum(valor_total), 0) from validos) as fat,
      (select coalesce(sum(valor_total - taxa), 0) from validos) as liq,
      (select coalesce(sum(taxa), 0) from validos) as tax,
      (select custo from custos) as custo,
      (select unid from custos) as unid,
      (select unid_com_custo from custos) as unid_cc,
      (select aliq from cfg) as aliq,
      (select qtd from cancelados) as canc_qt,
      (select valor from cancelados) as canc_vl,
      (select qtd from devolvidos) as dev_qt,
      (select valor from devolvidos) as dev_vl,
      (select investimento from ads) as ads_inv
  )
  select
    t.qt::bigint, t.unid::bigint, round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint, round(t.canc_vl, 2), t.dev_qt::bigint, round(t.dev_vl, 2),
    round(t.tax, 2), round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2), round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0 else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2), round(t.aliq, 2), round(t.liq, 2), round(t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.ads_inv / t.fat end, 1),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.fat end, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.fat end, 2),
    round(case when t.qt = 0 then 0 else (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.qt end, 2)
  from t;
$function$;

-- ---------- dashboard_kpis_parcial_impl ----------
create or replace function public.dashboard_kpis_parcial_impl(
  p_de date, p_ate date, p_minuto_max integer, p_marketplace text default null, p_loja_id bigint default null
)
returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
language sql
stable
set search_path to 'public'
as $function$
  with validos as (
    select p.valor_total,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from p.data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from p.data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and status = 'CANCELLED'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and status = 'TO_RETURN'
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  custos as (
    select coalesce(sum(pic.custo_total), 0) as custo,
           coalesce(sum(pic.quantidade), 0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null), 0) as unid_com_custo
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_minuto_max is null or
           (extract(hour from pic.data_criacao_pedido at time zone 'America/Sao_Paulo') * 60
            + extract(minute from pic.data_criacao_pedido at time zone 'America/Sao_Paulo')) <= p_minuto_max)
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads as (
    select case when p_marketplace = 'tiktok' then 0
                when p_minuto_max is null then (select coalesce(sum(investimento),0) from public.ads_totais_periodo(p_de, p_ate, p_loja_id))
                else (select coalesce(sum(g.investimento),0) from public.ads_gasto_horario g
                      where g.data between p_de and p_ate and g.hora <= (p_minuto_max / 60)
                        and (p_loja_id is null or g.loja_id = p_loja_id))
           end as investimento
  ),
  cfg as (select coalesce(max(aliquota_imposto), 0) as aliq from public.config),
  t as (
    select
      (select count(*) from validos) as qt,
      (select coalesce(sum(valor_total), 0) from validos) as fat,
      (select coalesce(sum(valor_total - taxa), 0) from validos) as liq,
      (select coalesce(sum(taxa), 0) from validos) as tax,
      (select custo from custos) as custo,
      (select unid from custos) as unid,
      (select unid_com_custo from custos) as unid_cc,
      (select aliq from cfg) as aliq,
      (select qtd from cancelados) as canc_qt,
      (select valor from cancelados) as canc_vl,
      (select qtd from devolvidos) as dev_qt,
      (select valor from devolvidos) as dev_vl,
      (select investimento from ads) as ads_inv
  )
  select
    t.qt::bigint,
    t.unid::bigint,
    round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint,
    round(t.canc_vl, 2),
    t.dev_qt::bigint,
    round(t.dev_vl, 2),
    round(t.tax, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0 else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2),
    round(t.aliq, 2),
    round(t.liq, 2),
    round(t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.ads_inv / t.fat end, 1),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.fat end, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.fat end, 2),
    round(case when t.qt = 0 then 0 else (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.qt end, 2)
  from t;
$function$;

-- ---------- pedidos_detalhe_impl ----------
create or replace function public.pedidos_detalhe_impl(
  p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50,
  p_busca text default null, p_status text default null, p_marketplace text default null,
  p_loja_id bigint default null
)
returns table (
  total_linhas bigint, order_sn text, data_pedido timestamptz, status text,
  produto text, sku text, imagem_url text, quantidade integer, valor numeric,
  tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric,
  lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean
)
language sql stable set search_path to 'public'
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
           (p.comissao is not null) as tem_escrow,
           coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
           coalesce(p.frete_real,0) as frete_pedido
    from public.pedidos p, lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
      and (p_status is null or p.status = p_status)
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
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
      ip.receita - (ip.taxa_pedido * coalesce(ip.fatia,1))
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg), 2),
    case when ip.receita=0 then null else round(100.0*(
      ip.receita - (ip.taxa_pedido * coalesce(ip.fatia,1))
      - coalesce(ip.custo_total,0) - ip.receita*(select aliq from cfg)
    )/ip.receita,1) end,
    ip.comprador_username,
    ip.tem_escrow
  from itens_pagina ip
  left join public.produtos pr on pr.item_id = ip.item_id and pr.model_id = ip.model_id
  order by ip.data_criacao_pedido desc, ip.order_sn;
$$;

-- ---------- pedidos_detalhe_totais_impl ----------
create or replace function public.pedidos_detalhe_totais_impl(
  p_de date, p_ate date, p_busca text default null, p_status text default null,
  p_marketplace text default null, p_loja_id bigint default null
)
returns table (
  linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric,
  custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint
)
language sql stable set search_path to 'public'
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
      pic.receita, pic.custo_total, pic.quantidade, p.status,
      (p.comissao is not null) as tem_escrow,
      coalesce(p.comissao,0)+coalesce(p.taxa_servico,0)+coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedidos p
    join public.pedido_itens_custeado pic on pic.order_sn = p.order_sn
    cross join lim l
    where p.data_criacao_pedido >= l.ini_ts and p.data_criacao_pedido < l.fim_ts
      and (p_status is null or p.status = p_status)
      and (p_marketplace is null or p.marketplace = p_marketplace)
      and (p_loja_id is null or p.loja_id = p_loja_id)
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
      else b.receita - (b.taxa_pedido * coalesce(b.fatia,1))
           - coalesce(b.custo_total,0)
           - b.receita * (select aliq from cfg) end
    ), 0), 2),
    count(*) filter (
      where not b.tem_escrow and b.status not in ('UNPAID','CANCELLED','TO_RETURN')
    )::bigint
  from base b;
$$;

-- ---------- analise_margem_sku_impl ----------
create or replace function public.analise_margem_sku_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language sql stable set search_path to 'public'
as $function$
  with itens as (
    select pic.item_id, pic.model_id, pic.quantidade, pic.receita, pic.custo_total, pic.custo_vigente,
           pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia,
           p.comissao, p.taxa_servico, p.taxa_transacao
    from public.pedido_itens_custeado pic
    join public.pedidos p on p.order_sn = pic.order_sn
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  vendas as (
    select
      item_id,
      model_id,
      sum(quantidade)::bigint as unidades,
      case when sum(quantidade) = 0 then null
           else sum(receita) / sum(quantidade) end as preco_vendido,
      case when sum(quantidade) filter (where custo_vigente is not null) = 0
           then null
           else sum(custo_total) filter (where custo_vigente is not null)
                / sum(quantidade) filter (where custo_vigente is not null)
      end as custo_medio,
      -- Líquido real: receita menos a fatia proporcional da comissão +
      -- taxa de serviço + taxa de transação do pedido (dado real da
      -- Shopee via escrow), só com pedidos já com repasse confirmado.
      case when sum(quantidade) filter (where comissao is not null) = 0
           then null
           else sum(receita - (coalesce(comissao,0)+coalesce(taxa_servico,0)+coalesce(taxa_transacao,0)) * coalesce(fatia,1))
                filter (where comissao is not null)
                / sum(quantidade) filter (where comissao is not null)
      end as liquido_medio
    from itens
    group by item_id, model_id
  ),
  calc as (
    select
      p.item_id,
      p.model_id,
      p.sku,
      coalesce(p.produto, '') || case
        when nullif(p.variacao, '') is null then ''
        else ' - ' || p.variacao
      end as produto,
      coalesce(v.unidades, 0)::bigint as unidades,
      coalesce(v.preco_vendido, p.preco_atual) as preco_medio,
      v.custo_medio,
      v.liquido_medio,
      coalesce(atual.custo_unitario, atual_fallback.custo_unitario) as custo_atual
    from public.produtos p
    left join vendas v
      on v.item_id = p.item_id and v.model_id = p.model_id
    left join lateral (
      select pc.custo_unitario
      from public.produto_custos pc
      where pc.item_id = p.item_id
        and pc.model_id = p.model_id
        and pc.vigencia_fim is null
      order by pc.vigencia_inicio desc
      limit 1
    ) atual on true
    left join lateral (
      select pc2.custo_unitario
      from public.produtos pp
      join public.produto_custos pc2
        on pc2.item_id = pp.item_id and pc2.model_id = pp.model_id
      where atual.custo_unitario is null
        and nullif(p.sku, '') is not null
        and pp.sku = p.sku
        and pp.loja_id = (select min(id) from public.lojas where status = 'ativa')
        and pc2.vigencia_fim is null
      order by pc2.vigencia_inicio desc
      limit 1
    ) atual_fallback on true
    where (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  fim as (
    select c.*,
           coalesce(c.custo_medio, c.custo_atual) as custo_periodo,
           coalesce(c.liquido_medio, c.preco_medio * 0.80 - 4.00) as liquido_un
    from calc c
  )
  select
    f.item_id, f.model_id, f.sku, f.produto, f.unidades,
    round(f.preco_medio, 2),
    round(f.custo_periodo, 4),
    round(f.custo_atual, 4),
    round(f.liquido_un, 2),
    case when f.custo_periodo is null then null
         else round(f.liquido_un - f.custo_periodo, 2) end,
    case when f.custo_periodo is null or coalesce(f.preco_medio, 0) = 0 then null
         else round(100.0 * (f.liquido_un - f.custo_periodo) / f.preco_medio, 1) end,
    case when f.custo_atual is null then null
         else round((f.custo_atual + 4.00) / 0.80, 2) end,
    case when f.custo_atual is null
           or (f.liquido_un - f.custo_atual) <= 0 then null
         else round(f.preco_medio / (f.liquido_un - f.custo_atual), 2) end,
    case
      when f.custo_periodo is null then 'sem custo'
      when f.liquido_un - f.custo_periodo < 0 then 'prejuizo'
      when 100.0 * (f.liquido_un - f.custo_periodo)
           / nullif(f.preco_medio, 0) < 10 then 'margem baixa'
      else 'ok'
    end
  from fim f
  order by f.unidades desc, f.produto;
$function$;
