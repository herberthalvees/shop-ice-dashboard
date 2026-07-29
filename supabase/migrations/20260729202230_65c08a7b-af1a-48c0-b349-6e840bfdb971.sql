create table if not exists public.despesas_fixas (
  id bigserial primary key,
  descricao text not null,
  valor numeric not null,
  categoria text,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.despesas_fixas to authenticated;
grant all on public.despesas_fixas to service_role;
grant usage, select on sequence public.despesas_fixas_id_seq to authenticated;
grant all on sequence public.despesas_fixas_id_seq to service_role;

alter table public.despesas_fixas enable row level security;

create policy "admins read despesas_fixas" on public.despesas_fixas
  for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "admins insert despesas_fixas" on public.despesas_fixas
  for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));
create policy "admins update despesas_fixas" on public.despesas_fixas
  for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
create policy "admins delete despesas_fixas" on public.despesas_fixas
  for delete to authenticated using (has_role(auth.uid(), 'admin'::app_role));

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
set search_path = public
as $$
  with periodo as (
    select
      make_date(p_ano, p_mes, 1) as inicio,
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date as fim
  ),
  pedidos_mes as (
    select p.*
    from public.pedidos p, periodo per
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between per.inicio and per.fim
  ),
  validos as (
    select * from pedidos_mes where status not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
  ),
  cancelados as (
    select coalesce(sum(valor_total), 0) as valor
    from pedidos_mes where status = 'CANCELLED'
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
      (select coalesce(sum(valor_total), 0) from pedidos_mes
        where status is distinct from 'CANCELLED') as bruta,
      (select valor from cancelados) as canc,
      (select coalesce(sum(valor_total), 0) from validos) as liquida,
      (select valor from custo) as cmv,
      (select coalesce(sum(coalesce(comissao,0) + coalesce(taxa_servico,0)
              + coalesce(taxa_transacao,0)), 0) from validos) as taxas,
      (select valor from fixas) as fixas,
      (select aliq from cfg) as aliq
  )
  select
    round(t.bruta, 2),
    round(t.canc, 2),
    round(t.liquida, 2),
    round(t.cmv, 2),
    round(case when t.liquida = 0 then 0 else 100.0*t.cmv/t.liquida end, 1),
    round(t.liquida - t.cmv, 2),
    round(case when t.liquida = 0 then 0
               else 100.0*(t.liquida - t.cmv)/t.liquida end, 1),
    round(t.taxas, 2),
    round(case when t.liquida = 0 then 0 else 100.0*t.taxas/t.liquida end, 1),
    0::numeric,
    0::numeric,
    round(t.fixas, 2),
    round(case when t.liquida = 0 then 0 else 100.0*t.fixas/t.liquida end, 1),
    round(t.liquida - t.cmv - t.taxas - t.fixas, 2),
    round(case when t.liquida = 0 then 0
               else 100.0*(t.liquida - t.cmv - t.taxas - t.fixas)/t.liquida end, 1),
    round(t.liquida * t.aliq, 2),
    round(t.aliq * 100, 1),
    round(t.liquida - t.cmv - t.taxas - t.fixas - (t.liquida * t.aliq), 2),
    round(case when t.liquida = 0 then 0
               else 100.0*(t.liquida - t.cmv - t.taxas - t.fixas
                    - (t.liquida * t.aliq))/t.liquida end, 1)
  from t;
$$;

grant execute on function public.dre_mensal(integer, integer) to authenticated;