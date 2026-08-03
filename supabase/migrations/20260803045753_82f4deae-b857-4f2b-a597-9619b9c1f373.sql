CREATE TABLE public.ads_gasto_horario (
  data date NOT NULL,
  hora smallint NOT NULL,
  investimento numeric NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (data, hora)
);

GRANT SELECT ON public.ads_gasto_horario TO authenticated;
GRANT ALL ON public.ads_gasto_horario TO service_role;

ALTER TABLE public.ads_gasto_horario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner le gasto horario" ON public.ads_gasto_horario
  FOR SELECT TO authenticated USING (public.eh_owner());
CREATE POLICY "service role gerencia gasto horario" ON public.ads_gasto_horario
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.aplicar_ads(p_dados jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_count integer;
  v_hora smallint := extract(hour from (now() at time zone 'America/Sao_Paulo'))::smallint;
begin
  create temp table if not exists _ads_antes (dia date primary key, total numeric) on commit drop;
  delete from _ads_antes;

  insert into _ads_antes (dia, total)
  select (a.data at time zone 'America/Sao_Paulo')::date, coalesce(sum(a.investimento), 0)
  from public.ads_campanhas a
  where (a.data at time zone 'America/Sao_Paulo')::date in (
    select ((d->>'data')::timestamptz at time zone 'America/Sao_Paulo')::date
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

  -- registra o delta de gasto na faixa de hora da atualizacao
  insert into public.ads_gasto_horario (data, hora, investimento, atualizado_em)
  select depois.dia, v_hora, depois.total - coalesce(antes.total, 0), now()
  from (
    select (a.data at time zone 'America/Sao_Paulo')::date as dia, coalesce(sum(a.investimento), 0) as total
    from public.ads_campanhas a
    where (a.data at time zone 'America/Sao_Paulo')::date in (
      select ((d->>'data')::timestamptz at time zone 'America/Sao_Paulo')::date
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
$$;

CREATE OR REPLACE FUNCTION public.dashboard_serie_horaria_impl(p_de date, p_ate date)
RETURNS TABLE (hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    where (a.data at time zone 'America/Sao_Paulo')::date between p_de and p_ate
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
$$;