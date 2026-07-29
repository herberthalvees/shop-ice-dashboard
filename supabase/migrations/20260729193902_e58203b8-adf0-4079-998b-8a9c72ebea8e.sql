drop function if exists public.pedidos_detalhe(date, date, integer, integer, text, text);
create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50,
  p_busca text default null, p_status text default null
)
returns table (
  total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text,
  produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric,
  frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric,
  comprador text, tem_escrow boolean
)
language sql stable set search_path to 'public' as $function$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  base as (
    select
      pic.order_sn, pic.produto, pic.sku, pic.item_id, pic.model_id,
      pic.quantidade, pic.receita, pic.custo_total,
      p.data_criacao_pedido, p.status, p.comprador_username, p.valor_liquido,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedido_itens_custeado pic
    join public.pedidos p on p.order_sn = pic.order_sn
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
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
      case
        when b.valor_liquido is not null
          then b.valor_liquido * coalesce(b.fatia, 1)
        else b.receita * 0.80 - 4.00 * b.quantidade
      end as liquido_item,
      (b.valor_liquido is not null) as tem_escrow,
      b.receita * (select aliq from cfg) as imposto_item
    from base b
  )
  select
    count(*) over ()::bigint,
    c.order_sn, c.data_criacao_pedido, c.status, c.produto, c.sku, pr.imagem_url,
    c.quantidade,
    round(c.receita, 2),
    round(c.tarifa_item, 2),
    round(c.frete_item, 2),
    round(c.custo_total, 2),
    round(c.imposto_item, 2),
    round(c.liquido_item - coalesce(c.custo_total, 0) - c.imposto_item, 2),
    case when c.receita = 0 then null
         else round(100.0 * (c.liquido_item - coalesce(c.custo_total,0) - c.imposto_item) / c.receita, 1) end,
    c.comprador_username,
    c.tem_escrow
  from calc c
  left join public.produtos pr on pr.item_id = c.item_id and pr.model_id = c.model_id
  order by c.data_criacao_pedido desc
  offset p_offset
  limit p_limite;
$function$;

drop function if exists public.pedidos_detalhe_totais(date, date, text, text);
create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text default null, p_status text default null
)
returns table (
  linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric,
  custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint
)
language sql stable set search_path to 'public' as $function$
  with cfg as (
    select coalesce(max(aliquota_imposto), 0) / 100.0 as aliq from public.config
  ),
  base as (
    select
      pic.receita, pic.custo_total, pic.quantidade, p.status, p.valor_liquido,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa_pedido,
      coalesce(p.frete_real, 0) as frete_pedido,
      pic.receita / nullif(sum(pic.receita) over (partition by pic.order_sn), 0) as fatia
    from public.pedido_itens_custeado pic
    join public.pedidos p on p.order_sn = pic.order_sn
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
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
      else (case when b.valor_liquido is not null
                 then b.valor_liquido * coalesce(b.fatia,1)
                 else b.receita * 0.80 - 4.00 * b.quantidade end)
           - coalesce(b.custo_total,0)
           - b.receita * (select aliq from cfg) end
    ), 0), 2),
    count(*) filter (
      where b.valor_liquido is null and b.status not in ('UNPAID','CANCELLED')
    )::bigint
  from base b;
$function$;

create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date)
 returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, lucro numeric, lucro_pct numeric, lucro_medio numeric)
 language sql stable set search_path to 'public'
as $function$
  with validos as (
    select p.valor_total,
           case
             when p.valor_liquido is not null then p.valor_liquido
             else coalesce(p.valor_total,0) * 0.80
                  - 4.00 * coalesce(p.qtd_itens, 1)
           end as valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
             + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED')
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
  ),
  custos as (
    select
      coalesce(sum(pic.custo_total), 0) as custo,
      coalesce(sum(pic.quantidade), 0) as unid,
      coalesce(sum(pic.quantidade) filter (
        where pic.custo_vigente is not null), 0) as unid_com_custo
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED')
  ),
  cfg as (
    select coalesce(max(aliquota_imposto), 0) as aliq from public.config
  ),
  t as (
    select
      (select count(*) from validos) as qt,
      (select coalesce(sum(valor_total), 0) from validos) as fat,
      (select coalesce(sum(valor_liquido), 0) from validos) as liq,
      (select coalesce(sum(taxa), 0) from validos) as tax,
      (select custo from custos) as custo,
      (select unid from custos) as unid,
      (select unid_com_custo from custos) as unid_cc,
      (select aliq from cfg) as aliq,
      (select qtd from cancelados) as canc_qt,
      (select valor from cancelados) as canc_vl
  )
  select
    t.qt::bigint,
    t.unid::bigint,
    round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint,
    round(t.canc_vl, 2),
    round(t.tax, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.tax / t.fat end, 1),
    round(t.custo, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.custo / t.fat end, 1),
    round(case when t.unid = 0 then 0
               else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2),
    round(t.aliq, 2),
    round(t.liq, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0
               else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0))
                    / t.fat end, 2),
    round(case when t.qt = 0 then 0
               else (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.qt end, 2)
  from t;
$function$;