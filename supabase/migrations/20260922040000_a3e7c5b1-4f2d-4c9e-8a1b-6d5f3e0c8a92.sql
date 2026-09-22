-- ============================================================
-- Etapa 4: filtro global de loja. Todas as RPCs de relatório ainda
-- sem suporte a loja ganham p_loja_id bigint default null (null =
-- todas as lojas somadas, comportamento idêntico ao de hoje —
-- mudança aditiva, nenhuma chamada existente quebra).
-- ============================================================

-- ---------- dashboard_kpis_parcial ----------
drop function if exists public.dashboard_kpis_parcial_impl(date, date, integer, text);
drop function if exists public.dashboard_kpis_parcial(date, date, integer, text);

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
           case when p.valor_liquido is not null then p.valor_liquido
                else coalesce(p.valor_total,0) * 0.80 - 4.00 * coalesce(p.qtd_itens, 1) end as valor_liquido,
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

create or replace function public.dashboard_kpis_parcial(
  p_de date, p_ate date, p_minuto_max integer, p_marketplace text default null, p_loja_id bigint default null
)
returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric, lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric, lucro_medio numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_parcial_impl(p_de, p_ate, p_minuto_max, p_marketplace, p_loja_id);
end;
$function$;

revoke all on function public.dashboard_kpis_parcial_impl(date, date, integer, text, bigint) from public, anon, authenticated;
revoke all on function public.dashboard_kpis_parcial(date, date, integer, text, bigint) from public, anon;
grant execute on function public.dashboard_kpis_parcial(date, date, integer, text, bigint) to authenticated, service_role;

-- ---------- dashboard_serie_periodo ----------
drop function if exists public.dashboard_serie_periodo_impl(date, date);
drop function if exists public.dashboard_serie_periodo(date, date);

create or replace function public.dashboard_serie_periodo_impl(p_de date, p_ate date, p_loja_id bigint default null)
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
      and (p_loja_id is null or loja_id = p_loja_id)
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

create or replace function public.dashboard_serie_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento, s.parcial
    from public.dashboard_serie_periodo_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

revoke execute on function public.dashboard_serie_periodo_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_serie_periodo(date, date, bigint) to authenticated;

-- ---------- dashboard_top_produtos_periodo ----------
drop function if exists public.dashboard_top_produtos_periodo_impl(date, date, integer);
drop function if exists public.dashboard_top_produtos_periodo(date, date, integer);

create or replace function public.dashboard_top_produtos_periodo_impl(p_de date, p_ate date, p_limite integer default 10, p_loja_id bigint default null)
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
    and (p_loja_id is null or pi.loja_id = p_loja_id)
  group by pi.sku
  order by 3 desc
  limit p_limite;
$function$;

create or replace function public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

revoke execute on function public.dashboard_top_produtos_periodo_impl(date, date, integer, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_top_produtos_periodo(date, date, integer, bigint) to authenticated;

-- ---------- dashboard_curva_abc ----------
drop function if exists public.dashboard_curva_abc_impl(date, date, integer);
drop function if exists public.dashboard_curva_abc(date, date, integer);

create or replace function public.dashboard_curva_abc_impl(p_de date, p_ate date, p_limite integer default 20, p_loja_id bigint default null)
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
      and (p_loja_id is null or pi.loja_id = p_loja_id)
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

create or replace function public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

revoke execute on function public.dashboard_curva_abc_impl(date, date, integer, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_curva_abc(date, date, integer, bigint) to authenticated;

-- ---------- dashboard_serie_horaria ----------
drop function if exists public.dashboard_serie_horaria_impl(date, date);
drop function if exists public.dashboard_serie_horaria(date, date);

create or replace function public.dashboard_serie_horaria_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      and (p_loja_id is null or loja_id = p_loja_id)
    group by 1
  ),
  ads_real as (
    select g.hora, sum(g.investimento)::numeric as valor
    from public.ads_gasto_horario g
    where g.data between p_de and p_ate
      and (p_loja_id is null or g.loja_id = p_loja_id)
    group by 1
  ),
  total_dia as (
    select coalesce(sum(a.investimento), 0)::numeric as total
    from public.ads_campanhas a
    where a.data::date between p_de and p_ate
      and (p_loja_id is null or a.loja_id = p_loja_id)
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

create or replace function public.dashboard_serie_horaria(p_de date, p_ate date, p_loja_id bigint default null)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql stable set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
    from public.dashboard_serie_horaria_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

revoke all on function public.dashboard_serie_horaria_impl(date, date, bigint) from public, anon, authenticated;
revoke all on function public.dashboard_serie_horaria(date, date, bigint) from public, anon;
grant execute on function public.dashboard_serie_horaria(date, date, bigint) to authenticated, service_role;

-- ---------- pedidos_em_transito ----------
drop function if exists public.pedidos_em_transito_impl(text);
drop function if exists public.pedidos_em_transito(text);

create or replace function public.pedidos_em_transito_impl(p_marketplace text default null, p_loja_id bigint default null)
returns table(pedidos bigint, valor numeric, unidades bigint, custo numeric, cobertura_custo numeric)
language sql
stable
set search_path to 'public'
as $$
  with ped as (
    select count(*) as qt, coalesce(sum(valor_total),0) as vl
    from public.pedidos
    where status in ('SHIPPED','TO_CONFIRM_RECEIVE')
      and (p_marketplace is null or marketplace = p_marketplace)
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  itens as (
    select coalesce(sum(pic.custo_total),0) as custo,
           coalesce(sum(pic.quantidade),0) as unid,
           coalesce(sum(pic.quantidade) filter (where pic.custo_vigente is not null),0) as unid_cc
    from public.pedido_itens_custeado pic
    where pic.status_pedido in ('SHIPPED','TO_CONFIRM_RECEIVE')
      and (p_marketplace is null or pic.marketplace = p_marketplace)
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  )
  select ped.qt::bigint,
         round(ped.vl,2),
         itens.unid::bigint,
         round(itens.custo,2),
         round(case when itens.unid = 0 then 0 else itens.unid_cc::numeric / itens.unid end, 4)
  from ped, itens;
$$;

create or replace function public.pedidos_em_transito(p_marketplace text default null, p_loja_id bigint default null)
returns table(pedidos bigint, valor numeric, unidades bigint, custo numeric, cobertura_custo numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_em_transito_impl(p_marketplace, p_loja_id);
end;
$$;

revoke all on function public.pedidos_em_transito_impl(text, bigint) from public, anon, authenticated;
revoke all on function public.pedidos_em_transito(text, bigint) from public, anon;
grant execute on function public.pedidos_em_transito(text, bigint) to authenticated, service_role;

-- ---------- produtos_com_giro ----------
drop function if exists public.produtos_com_giro(date, date);
drop function if exists public.produtos_com_giro_impl(date, date);

create or replace function public.produtos_com_giro(p_de date, p_ate date, p_loja_id bigint default null)
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
  WHERE (p_loja_id IS NULL OR p.loja_id = p_loja_id)
  ORDER BY COALESCE(v.vendidos, 0) DESC;
$function$;

create or replace function public.produtos_com_giro_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text)
language sql stable set search_path to 'public'
as $$ select * from public.produtos_com_giro(p_de, p_ate, p_loja_id) $$;

revoke execute on function public.produtos_com_giro_impl(date, date, bigint) from public, anon, authenticated;
revoke all on function public.produtos_com_giro(date, date, bigint) from public, anon;
grant execute on function public.produtos_com_giro(date, date, bigint) to authenticated;

-- ---------- produtos_com_ads ----------
drop function if exists public.produtos_com_ads(date, date);

create or replace function public.produtos_com_ads(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, produto text, investimento numeric, receita_ads numeric, cliques bigint, impressoes bigint, ctr numeric, roas numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with ag as (
    select
      ac.item_id as iid,
      max(ac.nome) as nome,
      coalesce(sum(ac.investimento), 0) as inv,
      coalesce(sum(ac.receita), 0) as rec,
      coalesce(sum(ac.cliques), 0)::bigint as cli,
      coalesce(sum(ac.impressoes), 0)::bigint as imp
    from public.ads_campanhas ac
    where ac.data::date between p_de and p_ate
      and ac.item_id is not null
      and ac.item_id <> 0
      and (p_loja_id is null or ac.loja_id = p_loja_id)
    group by ac.item_id
  )
  select
    ag.iid,
    coalesce((select max(pr.produto) from public.produtos pr where pr.item_id = ag.iid), ag.nome, 'Item ' || ag.iid::text),
    ag.inv,
    ag.rec,
    ag.cli,
    ag.imp,
    case when ag.imp = 0 then 0 else round(100.0 * ag.cli / ag.imp, 2) end,
    case when ag.inv = 0 then 0 else round(ag.rec / ag.inv, 2) end
  from ag
  order by ag.inv desc;
end;
$function$;

revoke all on function public.produtos_com_ads(date, date, bigint) from public, anon;
grant execute on function public.produtos_com_ads(date, date, bigint) to authenticated;

-- ---------- analise_margem_sku_impl: segunda passada, agora com p_loja_id ----------
drop function if exists public.analise_margem_sku_impl(date, date);

create or replace function public.analise_margem_sku_impl(p_de date, p_ate date, p_loja_id bigint default null)
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
      and (p_loja_id is null or pic.loja_id = p_loja_id)
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

drop function if exists public.analise_margem_sku(date, date);
create or replace function public.analise_margem_sku(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.analise_margem_sku_impl(p_de, p_ate, p_loja_id);
end; $$;

revoke execute on function public.analise_margem_sku_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.analise_margem_sku(date, date, bigint) to authenticated;

-- ---------- pedidos_detalhe / pedidos_detalhe_totais ----------
drop function if exists public.pedidos_detalhe_impl(date, date, integer, integer, text, text);
drop function if exists public.pedidos_detalhe(date, date, integer, integer, text, text);

create or replace function public.pedidos_detalhe_impl(
  p_de date, p_ate date, p_offset integer default 0, p_limite integer default 50,
  p_busca text default null, p_status text default null, p_loja_id bigint default null
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

create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer, p_limite integer, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_impl(p_de, p_ate, p_offset, p_limite, p_busca, p_status, p_loja_id);
end; $$;

drop function if exists public.pedidos_detalhe_totais_impl(date, date, text, text);
drop function if exists public.pedidos_detalhe_totais(date, date, text, text);

create or replace function public.pedidos_detalhe_totais_impl(
  p_de date, p_ate date, p_busca text default null, p_status text default null, p_loja_id bigint default null
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

create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_totais_impl(p_de, p_ate, p_busca, p_status, p_loja_id);
end; $$;

revoke execute on function public.pedidos_detalhe_impl(date, date, integer, integer, text, text, bigint) from public, anon, authenticated;
grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text, bigint) to authenticated;
revoke execute on function public.pedidos_detalhe_totais_impl(date, date, text, text, bigint) from public, anon, authenticated;
grant execute on function public.pedidos_detalhe_totais(date, date, text, text, bigint) to authenticated;

-- ---------- dre_mensal (e as funções auxiliares de despesas variáveis) ----------
drop function if exists public.contar_pedidos_periodo(date, date);
create or replace function public.contar_pedidos_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.pedidos p
  where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and coalesce(p.status,'') not in ('UNPAID','CANCELLED','TO_RETURN')
    and (p_loja_id is null or p.loja_id = p_loja_id)
$$;

revoke all on function public.contar_pedidos_periodo(date, date, bigint) from public, anon, authenticated;

drop function if exists public.dre_variaveis_detalhe(integer, integer);
create or replace function public.dre_variaveis_detalhe(p_ano integer, p_mes integer, p_loja_id bigint default null)
returns table(
  id bigint,
  descricao text,
  valor_por_pedido numeric,
  franquia_pedidos integer,
  dia_corte_ciclo smallint,
  pedidos_base integer,
  pedidos_cobrados integer,
  ciclo_inicio date,
  ciclo_fim date,
  valor numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ini date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date;
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with regras as (
    select dv.id, dv.descricao, dv.valor_por_pedido, dv.franquia_pedidos, dv.dia_corte_ciclo,
      case when dv.dia_corte_ciclo is null then v_ini
           else make_date(p_ano, p_mes, dv.dia_corte_ciclo) end as ini,
      case when dv.dia_corte_ciclo is null then v_fim
           else (make_date(p_ano, p_mes, dv.dia_corte_ciclo) + interval '1 month' - interval '1 day')::date end as fim
    from public.despesas_variaveis dv
    where dv.ativa = true
  ),
  calc as (
    select r.*, public.contar_pedidos_periodo(r.ini, r.fim, p_loja_id) as qtd
    from regras r
  )
  select c.id, c.descricao, c.valor_por_pedido, c.franquia_pedidos, c.dia_corte_ciclo,
    c.qtd,
    greatest(0, c.qtd - coalesce(c.franquia_pedidos, 0))::int,
    c.ini, c.fim,
    round(greatest(0, c.qtd - coalesce(c.franquia_pedidos, 0)) * c.valor_por_pedido, 2)
  from calc c
  order by c.descricao;
end;
$$;

revoke all on function public.dre_variaveis_detalhe(integer, integer, bigint) from public, anon;
grant execute on function public.dre_variaveis_detalhe(integer, integer, bigint) to authenticated;

drop function if exists public.dre_mensal(integer, integer);
create or replace function public.dre_mensal(p_ano integer, p_mes integer, p_loja_id bigint default null)
returns table(receita_bruta numeric, cancelamentos numeric, receita_liquida numeric, cmv numeric, cmv_pct numeric, lucro_bruto numeric, lucro_bruto_pct numeric, taxas_marketplace numeric, taxas_pct numeric, ads numeric, ads_pct numeric, despesas_fixas numeric, despesas_fixas_pct numeric, despesas_variaveis numeric, despesas_variaveis_pct numeric, resultado_operacional numeric, resultado_operacional_pct numeric, impostos numeric, impostos_pct numeric, lucro_liquido numeric, lucro_liquido_pct numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with periodo as (
    select make_date(p_ano, p_mes, 1) as inicio,
           (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date as fim
  ),
  pedidos_mes as materialized (
    select p.status, p.valor_total,
      coalesce(p.comissao,0) + coalesce(p.taxa_servico,0) + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos as p, periodo as per
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between per.inicio and per.fim
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  agregado as (
    select
      coalesce(sum(valor_total) filter (where status <> 'CANCELLED'), 0) as bruta,
      coalesce(sum(valor_total) filter (where status = 'CANCELLED'), 0) as canc,
      coalesce(sum(valor_total) filter (where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as liquida,
      coalesce(sum(taxa) filter (where status not in ('UNPAID','CANCELLED','TO_RETURN')), 0) as taxas
    from pedidos_mes
  ),
  custo as (
    select coalesce(sum(pic.custo_total), 0) as valor
    from public.pedido_itens_custeado as pic, periodo as per
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between per.inicio and per.fim
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads_mes as (
    select a.investimento as valor
    from periodo as per
    cross join lateral public.ads_totais_periodo(per.inicio, per.fim, p_loja_id) as a
  ),
  fixas as (
    select coalesce(sum(df.valor), 0) as valor from public.despesas_fixas as df where df.ativa = true
  ),
  variaveis as (
    select coalesce(sum(d.valor), 0) as valor from public.dre_variaveis_detalhe(p_ano, p_mes, p_loja_id) as d
  ),
  cfg as (
    select coalesce(max(c.aliquota_imposto), 0) / 100.0 as aliq from public.config as c
  ),
  t as (
    select ag.bruta, ag.canc, ag.liquida, ag.taxas,
      (select valor from custo) as cmv,
      (select valor from ads_mes) as ads,
      (select valor from fixas) as fixas,
      (select valor from variaveis) as varia,
      (select aliq from cfg) as aliq
    from agregado as ag
  )
  select
    round(t.bruta,2), round(t.canc,2), round(t.liquida,2), round(t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*t.cmv/t.liquida end,1),
    round(t.liquida-t.cmv,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv)/t.liquida end,1),
    round(t.taxas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.taxas/t.liquida end,1),
    round(t.ads,2),
    round(case when t.liquida=0 then 0 else 100.0*t.ads/t.liquida end,1),
    round(t.fixas,2),
    round(case when t.liquida=0 then 0 else 100.0*t.fixas/t.liquida end,1),
    round(t.varia,2),
    round(case when t.liquida=0 then 0 else 100.0*t.varia/t.liquida end,1),
    round(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia,2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia)/t.liquida end,1),
    round(t.liquida*t.aliq,2), round(t.aliq*100,1),
    round(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia-(t.liquida*t.aliq),2),
    round(case when t.liquida=0 then 0 else 100.0*(t.liquida-t.cmv-t.taxas-t.ads-t.fixas-t.varia-(t.liquida*t.aliq))/t.liquida end,1)
  from t;
end;
$function$;

revoke all on function public.dre_mensal(integer, integer, bigint) from public, anon;
grant execute on function public.dre_mensal(integer, integer, bigint) to authenticated;
