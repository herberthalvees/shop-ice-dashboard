-- ============================================================
-- ads_campanhas / aplicar_ads passam a gravar por loja
-- ============================================================

alter table public.ads_campanhas drop constraint if exists ads_campanhas_campaign_id_data_key;
alter table public.ads_campanhas
  add constraint ads_campanhas_loja_campaign_data_key unique (loja_id, campaign_id, data);

create or replace function public.aplicar_ads(p_dados jsonb, p_loja_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.ads_campanhas (
    loja_id, campaign_id, nome, item_id, status, data, investimento,
    impressoes, cliques, ctr, pedidos, receita, roas, payload
  )
  select distinct on ((d->>'campaign_id')::bigint, (d->>'data')::timestamptz)
    p_loja_id,
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
  on conflict (loja_id, campaign_id, data) do update set
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
  return v_count;
end;
$$;

revoke all on function public.aplicar_ads(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.aplicar_ads(jsonb, bigint) to service_role;

drop function if exists public.aplicar_ads(jsonb);
