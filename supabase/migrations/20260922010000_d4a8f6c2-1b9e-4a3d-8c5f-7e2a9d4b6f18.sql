-- ============================================================
-- Resumo diário do WhatsApp passa a rodar por loja: as funções de
-- KPI/carteira/ads usadas por ele ganham p_loja_id opcional
-- (null = todas as lojas juntas, comportamento igual ao de hoje).
-- ============================================================

-- pedido_itens_custeado precisa expor loja_id (só pode ser
-- acrescentado ao final da lista de colunas da view).
create or replace view public.pedido_itens_custeado
with (security_invoker = on) as
select
  pi.id, pi.order_sn, pi.item_id, pi.model_id, pi.produto, pi.sku,
  pi.quantidade, pi.preco_unitario, pi.receita, pi.status_pedido,
  pi.data_criacao_pedido, pi.created_at,
  c.custo_unitario as custo_vigente,
  pi.quantidade::numeric * c.custo_unitario as custo_total,
  pi.marketplace,
  pi.loja_id
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

grant select on public.pedido_itens_custeado to authenticated;

-- ads_totais_periodo ganha p_loja_id
drop function if exists public.ads_totais_periodo(date, date);

create or replace function public.ads_totais_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table (
  investimento numeric,
  receita numeric,
  pedidos bigint,
  cliques bigint,
  impressoes bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  with por_dia as (
    select
      ac.data::date as dia,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.investimento) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.investimento) filter (where ac.item_id is not null), 0)
      end as investimento,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.receita) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.receita) filter (where ac.item_id is not null), 0)
      end as receita,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.pedidos) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.pedidos) filter (where ac.item_id is not null), 0)
      end as pedidos,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.cliques) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.cliques) filter (where ac.item_id is not null), 0)
      end as cliques,
      case
        when count(*) filter (where ac.campaign_id = 0 and ac.item_id is null) > 0
          then coalesce(sum(ac.impressoes) filter (where ac.campaign_id = 0 and ac.item_id is null), 0)
        else coalesce(sum(ac.impressoes) filter (where ac.item_id is not null), 0)
      end as impressoes
    from public.ads_campanhas as ac
    where ac.data::date between p_de and p_ate
      and (p_loja_id is null or ac.loja_id = p_loja_id)
    group by ac.data::date
  )
  select
    coalesce(sum(pd.investimento), 0)::numeric,
    coalesce(sum(pd.receita), 0)::numeric,
    coalesce(sum(pd.pedidos), 0)::bigint,
    coalesce(sum(pd.cliques), 0)::bigint,
    coalesce(sum(pd.impressoes), 0)::bigint
  from por_dia as pd;
$function$;

revoke all on function public.ads_totais_periodo(date, date, bigint) from public, anon, authenticated;
grant execute on function public.ads_totais_periodo(date, date, bigint) to service_role;

-- ads_resumo passa o p_loja_id adiante
drop function if exists public.ads_resumo(date, date);

create or replace function public.ads_resumo(p_de date, p_ate date, p_loja_id bigint default null)
returns table (
  investimento numeric, receita numeric, pedidos bigint,
  roas numeric, acos numeric, tacos numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with a as (
    select * from public.ads_totais_periodo(p_de, p_ate, p_loja_id)
  ),
  fat as (
    select coalesce(sum(p.valor_total), 0) as total
    from public.pedidos as p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
      and (p_loja_id is null or p.loja_id = p_loja_id)
  )
  select
    a.investimento,
    a.receita,
    a.pedidos,
    case when a.investimento = 0 then 0 else round(a.receita / a.investimento, 2) end,
    case when a.receita = 0 then 0 else round(100.0 * a.investimento / a.receita, 2) end,
    case when f.total = 0 then 0 else round(100.0 * a.investimento / f.total, 2) end
  from a cross join fat as f;
end;
$function$;

revoke all on function public.ads_resumo(date, date, bigint) from public, anon;
grant execute on function public.ads_resumo(date, date, bigint) to authenticated;

-- dashboard_kpis_periodo_impl ganha p_loja_id
drop function if exists public.dashboard_kpis_periodo_impl(date, date);
drop function if exists public.dashboard_kpis_periodo(date, date);

create or replace function public.dashboard_kpis_periodo_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language sql
stable
set search_path TO 'public'
as $function$
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
      and (p_loja_id is null or p.loja_id = p_loja_id)
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  devolvidos as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'TO_RETURN'
      and (p_loja_id is null or loja_id = p_loja_id)
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
      and (p_loja_id is null or pic.loja_id = p_loja_id)
  ),
  ads as (
    select coalesce(sum(investimento), 0) as investimento
    from public.ads_totais_periodo(p_de, p_ate, p_loja_id)
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

create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(
  pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric,
  pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric,
  taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric,
  imposto numeric, imposto_pct numeric, valor_liquido numeric, ads_investimento numeric, ads_pct numeric,
  lucro_sem_ads numeric, lucro_sem_ads_pct numeric, lucro_com_ads numeric, lucro_com_ads_pct numeric,
  lucro_medio numeric
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_periodo_impl(p_de, p_ate, p_loja_id);
end;
$function$;

revoke all on function public.dashboard_kpis_periodo_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.dashboard_kpis_periodo_impl(date, date, bigint) to service_role;
revoke all on function public.dashboard_kpis_periodo(date, date, bigint) from public, anon;
grant execute on function public.dashboard_kpis_periodo(date, date, bigint) to authenticated, service_role;

-- carteira_resumo_impl ganha p_loja_id
drop function if exists public.carteira_resumo_impl(date, date);
drop function if exists public.carteira_resumo(date, date);

create or replace function public.carteira_resumo_impl(p_de date, p_ate date, p_loja_id bigint default null)
returns table(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
language sql
stable
set search_path TO 'public'
as $function$
  with ultimo as (
    select saldo_apos, data_transacao
    from public.carteira_transacoes
    where (p_loja_id is null or loja_id = p_loja_id)
    order by data_transacao desc, transaction_id desc
    limit 1
  ),
  periodo as (
    select
      coalesce(sum(valor) filter (where fluxo = 'MONEY_IN'), 0) as ent,
      coalesce(sum(abs(valor)) filter (where fluxo = 'MONEY_OUT'), 0) as sai,
      coalesce(sum(abs(valor)) filter (
        where withdrawal_id is not null and withdrawal_id > 0), 0) as saq
    from public.carteira_transacoes
    where (data_transacao at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and (p_loja_id is null or loja_id = p_loja_id)
  ),
  transito as (
    select
      coalesce(sum(p.valor_liquido), 0) as valor,
      count(*)::bigint as qtd
    from public.pedidos p
    where p.valor_liquido is not null
      and p.status not in ('UNPAID', 'CANCELLED')
      and (p_loja_id is null or p.loja_id = p_loja_id)
      and not exists (
        select 1 from public.carteira_transacoes c
        where c.order_sn = p.order_sn and c.fluxo = 'MONEY_IN'
          and (p_loja_id is null or c.loja_id = p_loja_id)
      )
  )
  select
    (select saldo_apos from ultimo),
    (select data_transacao from ultimo),
    (select ent from periodo),
    (select sai from periodo),
    (select saq from periodo),
    (select valor from transito),
    (select qtd from transito);
$function$;

create or replace function public.carteira_resumo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_owner_ou_service_role() then raise exception 'acesso negado'; end if;
  return query select * from public.carteira_resumo_impl(p_de, p_ate, p_loja_id);
end;
$function$;

revoke all on function public.carteira_resumo_impl(date, date, bigint) from public, anon, authenticated;
grant execute on function public.carteira_resumo_impl(date, date, bigint) to service_role;
revoke all on function public.carteira_resumo(date, date, bigint) from public, anon;
grant execute on function public.carteira_resumo(date, date, bigint) to authenticated, service_role;
