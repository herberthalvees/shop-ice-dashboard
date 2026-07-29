create or replace function public.analise_margem_sku(p_de date, p_ate date)
 returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
 language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      pic.item_id,
      pic.model_id,
      sum(pic.quantidade)::bigint as unidades,
      case when sum(pic.quantidade) = 0 then null
           else sum(pic.receita) / sum(pic.quantidade) end as preco_vendido,
      case when sum(pic.quantidade) filter (where pic.custo_vigente is not null) = 0
           then null
           else sum(pic.custo_total) filter (where pic.custo_vigente is not null)
                / sum(pic.quantidade) filter (where pic.custo_vigente is not null)
      end as custo_medio
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    group by pic.item_id, pic.model_id
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
      atual.custo_unitario as custo_atual
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
  ),
  fim as (
    select c.*,
           coalesce(c.custo_medio, c.custo_atual) as custo_periodo,
           c.preco_medio * 0.80 - 4.00 as liquido_un
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

create or replace function public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer default 20)
 returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
 language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      max(pi.produto) as produto,
      pi.sku,
      sum(pi.quantidade)::bigint as unidades,
      sum(pi.receita) as receita
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    group by pi.sku
  ),
  total as (select nullif(sum(receita), 0) as tot from vendas),
  ranked as (
    select
      v.*,
      100.0 * v.receita / (select tot from total) as part,
      100.0 * sum(v.receita) over (order by v.receita desc
        rows between unbounded preceding and current row)
        / (select tot from total) as acum
    from vendas v
  )
  select
    r.produto, r.sku, r.unidades, round(r.receita, 2),
    round(r.part, 2), round(r.acum, 2),
    case when r.acum <= 80 then 'A'
         when r.acum <= 95 then 'B'
         else 'C' end
  from ranked r
  order by r.receita desc
  limit p_limite;
$function$;

create or replace function public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer default 10)
 returns table(produto text, sku text, quantidade bigint, receita numeric)
 language sql stable set search_path to 'public'
as $function$
  select
    max(pi.produto),
    pi.sku,
    sum(pi.quantidade)::bigint,
    sum(pi.receita)::numeric
  from public.pedido_itens pi
  where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
        between p_de and p_ate
    and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  group by pi.sku
  order by 3 desc
  limit p_limite;
$function$;

create or replace function public.dashboard_serie_periodo(p_de date, p_ate date)
 returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
 language sql stable set search_path to 'public'
as $function$
  with cfg as (
    select
      case
        when (p_ate - p_de) > 90 then 'mes'
        when (p_ate - p_de) > 31 then 'semana'
        else 'dia'
      end as gran,
      (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  calendario as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month', d)::date
        when 'semana' then date_trunc('week', d)::date
        else d::date
      end as periodo
    from generate_series(p_de, p_ate, interval '1 day') as d
    group by 1
  ),
  vendas as (
    select
      case (select gran from cfg)
        when 'mes' then date_trunc('month',
          (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        when 'semana' then date_trunc('week',
          (data_criacao_pedido at time zone 'America/Sao_Paulo'))::date
        else (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
      end as periodo,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      ), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
    group by 1
  )
  select
    c.periodo,
    case (select gran from cfg)
      when 'mes' then to_char(c.periodo, 'MM/YYYY')
      when 'semana' then to_char(c.periodo, 'DD/MM')
      else to_char(c.periodo, 'DD/MM')
    end,
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    c.periodo = (select hoje from cfg)
  from calendario c
  left join vendas v on v.periodo = c.periodo
  order by c.periodo;
$function$;

create or replace function public.produtos_com_giro(p_de date, p_ate date)
 returns table(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text)
 language sql stable set search_path to 'public'
as $function$
  WITH dias AS (
    SELECT GREATEST((p_ate - p_de) + 1, 1) AS qtd
  ),
  vendas AS (
    SELECT
      pi.item_id,
      pi.model_id,
      SUM(pi.quantidade)::bigint AS vendidos
    FROM public.pedido_itens pi
    WHERE (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN p_de AND p_ate
      AND pi.status_pedido NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
    GROUP BY pi.item_id, pi.model_id
  )
  SELECT
    p.item_id, p.model_id, p.sku, p.produto, p.variacao,
    p.preco_atual, p.estoque_disponivel,
    COALESCE(v.vendidos, 0)::bigint,
    ROUND(COALESCE(v.vendidos, 0)::numeric / (SELECT qtd FROM dias), 2),
    CASE
      WHEN COALESCE(v.vendidos, 0) = 0 THEN NULL
      ELSE ROUND(p.estoque_disponivel
                 / (v.vendidos::numeric / (SELECT qtd FROM dias)), 1)
    END,
    p.status_item, p.imagem_url
  FROM public.produtos p
  LEFT JOIN vendas v
    ON v.item_id = p.item_id AND v.model_id = p.model_id
  ORDER BY COALESCE(v.vendidos, 0) DESC;
$function$;

create or replace function public.pedidos_detalhe(p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50, p_busca text default null::text, p_status text default null::text)
 returns table(total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
 language sql stable set search_path to 'public'
as $function$
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
    case when c.status in ('UNPAID', 'CANCELLED', 'TO_RETURN') then 0
         else round(c.liquido_item - coalesce(c.custo_total, 0) - c.imposto_item, 2) end,
    case when c.receita = 0 or c.status in ('UNPAID', 'CANCELLED', 'TO_RETURN') then null
         else round(100.0 * (c.liquido_item - coalesce(c.custo_total,0) - c.imposto_item) / c.receita, 1) end,
    c.comprador_username,
    c.tem_escrow
  from calc c
  left join public.produtos pr on pr.item_id = c.item_id and pr.model_id = c.model_id
  order by c.data_criacao_pedido desc
  offset p_offset
  limit p_limite;
$function$;

create or replace function public.pedidos_detalhe_totais(p_de date, p_ate date, p_busca text default null::text, p_status text default null::text)
 returns table(linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
 language sql stable set search_path to 'public'
as $function$
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
$function$;

drop function if exists public.dashboard_kpis_periodo(date, date);
create function public.dashboard_kpis_periodo(p_de date, p_ate date)
 returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, lucro numeric, lucro_pct numeric, lucro_medio numeric)
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
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'TO_RETURN'
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
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
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
      (select valor from cancelados) as canc_vl,
      (select qtd from devolvidos) as dev_qt,
      (select valor from devolvidos) as dev_vl
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