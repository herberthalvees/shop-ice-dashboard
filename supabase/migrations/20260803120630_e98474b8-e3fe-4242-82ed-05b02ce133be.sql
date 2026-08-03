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
$function$;