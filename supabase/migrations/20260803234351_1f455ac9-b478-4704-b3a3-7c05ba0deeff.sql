-- Expõe o marketplace na visão de itens custeados
CREATE OR REPLACE VIEW public.pedido_itens_custeado AS
SELECT pi.id,
    pi.order_sn,
    pi.item_id,
    pi.model_id,
    pi.produto,
    pi.sku,
    pi.quantidade,
    pi.preco_unitario,
    pi.receita,
    pi.status_pedido,
    pi.data_criacao_pedido,
    pi.created_at,
    c.custo_unitario AS custo_vigente,
    pi.quantidade::numeric * c.custo_unitario AS custo_total,
    pi.marketplace
   FROM public.pedido_itens pi
     LEFT JOIN LATERAL ( SELECT pc.custo_unitario
           FROM public.produto_custos pc
          WHERE pc.item_id = pi.item_id AND pc.model_id = pi.model_id
            AND pc.vigencia_inicio <= (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date
            AND COALESCE(pc.vigencia_fim, '9999-12-31'::date) >= (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date
          ORDER BY pc.vigencia_inicio DESC
         LIMIT 1) c ON true;

-- ---------- KPIs ----------
CREATE OR REPLACE FUNCTION public.dashboard_kpis_periodo_impl(p_de date, p_ate date, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with validos as (
    select p.valor_total,
           case
             when p.valor_liquido is not null then p.valor_liquido
             else coalesce(p.valor_total,0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1)
           end as valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
             + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_marketplace is null or p.marketplace = p_marketplace)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
      and (p_marketplace is null or marketplace = p_marketplace)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'TO_RETURN'
      and (p_marketplace is null or marketplace = p_marketplace)
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
      and (p_marketplace is null or pic.marketplace = p_marketplace)
  ),
  ads as (
    select case when p_marketplace = 'tiktok' then 0
                else coalesce(sum(investimento), 0) end as investimento
    from public.ads_totais_periodo(p_de, p_ate)
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
    round(case when t.unid = 0 then 0
               else t.unid_cc::numeric / t.unid end, 4),
    round(t.fat * t.aliq / 100.0, 2),
    round(t.aliq, 2),
    round(t.liq, 2),
    round(t.ads_inv, 2),
    round(case when t.fat = 0 then 0 else 100.0 * t.ads_inv / t.fat end, 1),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0), 2),
    round(case when t.fat = 0 then 0
               else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0)) / t.fat end, 2),
    round(t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv, 2),
    round(case when t.fat = 0 then 0
               else 100.0 * (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.fat end, 2),
    round(case when t.qt = 0 then 0
               else (t.liq - t.custo - (t.fat * t.aliq / 100.0) - t.ads_inv) / t.qt end, 2)
  from t;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpis_periodo(p_de date, p_ate date, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_periodo_impl(p_de, p_ate, p_marketplace);
end;
$function$;

-- ---------- Série do período ----------
CREATE OR REPLACE FUNCTION public.dashboard_serie_periodo_impl(p_de date, p_ate date, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      and (p_marketplace is null or marketplace = p_marketplace)
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

CREATE OR REPLACE FUNCTION public.dashboard_serie_periodo(p_de date, p_ate date, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(periodo date, rotulo text, pedidos bigint, faturamento numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento
  from public.dashboard_serie_periodo_impl(p_de, p_ate, p_marketplace) s;
end; $function$;

-- ---------- Série horária ----------
CREATE OR REPLACE FUNCTION public.dashboard_serie_horaria_impl(p_de date, p_ate date, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with horas as (
    select h::smallint as hora from generate_series(0, 23) h
  ),
  vendas as (
    select
      extract(hour from (data_criacao_pedido at time zone 'America/Sao_Paulo'))::smallint as hora,
      count(*)::bigint as pedidos,
      coalesce(sum(valor_total) filter (
        where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      ), 0)::numeric as faturamento
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (p_marketplace is null or marketplace = p_marketplace)
    group by 1
  ),
  ads_real as (
    select g.hora, sum(g.investimento)::numeric as valor
    from public.ads_gasto_horario g
    where g.data between p_de and p_ate
      and coalesce(p_marketplace, 'shopee') = 'shopee'
    group by 1
  ),
  total_dia as (
    select coalesce(sum(a.investimento), 0)::numeric as total
    from public.ads_campanhas a
    where a.data::date between p_de and p_ate
      and coalesce(p_marketplace, 'shopee') = 'shopee'
  ),
  tem_real as (
    select coalesce(sum(valor), 0) > 0 as ok from ads_real
  )
  select
    h.hora,
    lpad(h.hora::text, 2, '0') || 'h',
    coalesce(v.pedidos, 0)::bigint,
    coalesce(v.faturamento, 0)::numeric,
    case
      when (select ok from tem_real) then coalesce(ar.valor, 0)::numeric
      else ((select total from total_dia) / 24)::numeric
    end
  from horas h
  left join vendas v on v.hora = h.hora
  left join ads_real ar on ar.hora = h.hora
  order by h.hora;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_serie_horaria(p_de date, p_ate date, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
  from public.dashboard_serie_horaria_impl(p_de, p_ate, p_marketplace) s;
end; $function$;

-- ---------- Top produtos ----------
CREATE OR REPLACE FUNCTION public.dashboard_top_produtos_periodo_impl(p_de date, p_ate date, p_limite integer DEFAULT 10, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(produto text, sku text, quantidade bigint, receita numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    max(pi.produto),
    pi.sku,
    sum(pi.quantidade)::bigint,
    sum(pi.receita)::numeric
  from public.pedido_itens pi
  where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
        between p_de and p_ate
    and pi.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    and (p_marketplace is null or pi.marketplace = p_marketplace)
  group by pi.sku
  order by 3 desc
  limit p_limite;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(produto text, sku text, quantidade bigint, receita numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite, p_marketplace);
end; $function$;

-- ---------- Curva ABC ----------
CREATE OR REPLACE FUNCTION public.dashboard_curva_abc_impl(p_de date, p_ate date, p_limite integer DEFAULT 20, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      and (p_marketplace is null or pi.marketplace = p_marketplace)
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

CREATE OR REPLACE FUNCTION public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer, p_marketplace text DEFAULT NULL)
 RETURNS TABLE(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite, p_marketplace);
end; $function$;