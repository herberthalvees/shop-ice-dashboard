CREATE OR REPLACE FUNCTION public.aplicar_ads(p_dados jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_hora smallint := extract(hour from (now() at time zone 'America/Sao_Paulo'))::smallint;
begin
  create temp table if not exists _ads_antes (dia date primary key, total numeric) on commit drop;
  delete from _ads_antes where true;

  insert into _ads_antes (dia, total)
  select a.data::date, coalesce(sum(a.investimento), 0)
  from public.ads_campanhas a
  where a.data::date in (
    select ((d->>'data')::timestamptz)::date
    from jsonb_array_elements(p_dados) as d
  )
  group by 1;

  insert into public.ads_campanhas (
    campaign_id, nome, item_id, status, data, investimento,
    impressoes, cliques, ctr, pedidos, receita, roas, payload
  )
  select distinct on ((d->>'campaign_id')::bigint, (d->>'data')::timestamptz)
    (d->>'campaign_id')::bigint,
    d->>'nome',
    nullif(d->>'item_id','')::bigint,
    d->>'status',
    (d->>'data')::timestamptz,
    nullif(d->>'investimento','')::numeric,
    nullif(d->>'impressoes','')::bigint,
    nullif(d->>'cliques','')::bigint,
    nullif(d->>'ctr','')::numeric,
    nullif(d->>'pedidos','')::bigint,
    nullif(d->>'receita','')::numeric,
    nullif(d->>'roas','')::numeric,
    d
  from jsonb_array_elements(p_dados) as d
  on conflict (campaign_id, data) do update set
    nome = coalesce(excluded.nome, ads_campanhas.nome),
    item_id = coalesce(excluded.item_id, ads_campanhas.item_id),
    status = coalesce(excluded.status, ads_campanhas.status),
    investimento = excluded.investimento,
    impressoes = excluded.impressoes,
    cliques = excluded.cliques,
    ctr = excluded.ctr,
    pedidos = excluded.pedidos,
    receita = excluded.receita,
    roas = excluded.roas,
    payload = excluded.payload;
  get diagnostics v_count = row_count;

  insert into public.ads_gasto_horario (data, hora, investimento, atualizado_em)
  select depois.dia, v_hora, depois.total - coalesce(antes.total, 0), now()
  from (
    select a.data::date as dia, coalesce(sum(a.investimento), 0) as total
    from public.ads_campanhas a
    where a.data::date in (
      select ((d->>'data')::timestamptz)::date
      from jsonb_array_elements(p_dados) as d
    )
    group by 1
  ) depois
  left join _ads_antes antes on antes.dia = depois.dia
  where depois.total - coalesce(antes.total, 0) > 0
  on conflict (data, hora) do update set
    investimento = public.ads_gasto_horario.investimento + excluded.investimento,
    atualizado_em = now();

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_serie_horaria_impl(p_de date, p_ate date)
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
    group by 1
  ),
  ads_real as (
    select g.hora, sum(g.investimento)::numeric as valor
    from public.ads_gasto_horario g
    where g.data between p_de and p_ate
    group by 1
  ),
  total_dia as (
    select coalesce(sum(a.investimento), 0)::numeric as total
    from public.ads_campanhas a
    where a.data::date between p_de and p_ate
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

-- Corrige o historico gravado com o dia deslocado (soma quando ja existe destino)
WITH origem AS (
  SELECT data, hora, investimento FROM public.ads_gasto_horario WHERE data >= '2026-07-01'
), removidos AS (
  DELETE FROM public.ads_gasto_horario g
  USING origem o WHERE g.data = o.data AND g.hora = o.hora
  RETURNING g.data, g.hora, g.investimento
), agregados AS (
  SELECT (data + 1) AS data, hora, sum(investimento) AS investimento
  FROM removidos GROUP BY 1, 2
)
INSERT INTO public.ads_gasto_horario (data, hora, investimento, atualizado_em)
SELECT data, hora, investimento, now() FROM agregados
ON CONFLICT (data, hora) DO UPDATE
  SET investimento = public.ads_gasto_horario.investimento + excluded.investimento,
      atualizado_em = now();