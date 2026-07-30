create table if not exists public.ads_campanhas (
  id bigserial primary key,
  campaign_id bigint not null,
  nome text,
  item_id bigint,
  status text,
  data timestamptz not null,
  investimento numeric,
  impressoes bigint,
  cliques bigint,
  ctr numeric,
  pedidos bigint,
  receita numeric,
  roas numeric,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, data)
);

create index if not exists idx_ads_data on public.ads_campanhas (data desc);
create index if not exists idx_ads_item on public.ads_campanhas (item_id);

grant select on public.ads_campanhas to authenticated;
grant all on public.ads_campanhas to service_role;
grant usage, select on sequence public.ads_campanhas_id_seq to service_role;

alter table public.ads_campanhas enable row level security;

drop policy if exists "owner read ads_campanhas" on public.ads_campanhas;
create policy "owner read ads_campanhas"
on public.ads_campanhas for select to authenticated
using (has_role(auth.uid(), 'admin'::app_role) and eh_owner());

create or replace function public.aplicar_ads(p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
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
  return v_count;
end;
$$;

revoke all on function public.aplicar_ads(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_ads(jsonb) to service_role;

create or replace function public.ads_resumo(p_de date, p_ate date)
returns table (
  investimento numeric, receita numeric, pedidos bigint,
  roas numeric, acos numeric, tacos numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not eh_owner() then raise exception 'acesso negado'; end if;
  return query
  with a as (
    select
      coalesce(sum(ac.investimento),0) as inv,
      coalesce(sum(ac.receita),0) as rec,
      coalesce(sum(ac.pedidos),0)::bigint as ped
    from ads_campanhas ac
    where ac.data::date between p_de and p_ate
  ),
  fat as (
    select coalesce(sum(p.valor_total),0) as total
    from pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID','CANCELLED','TO_RETURN')
  )
  select
    a.inv, a.rec, a.ped,
    case when a.inv=0 then 0 else round(a.rec/a.inv,2) end,
    case when a.rec=0 then 0 else round(100.0*a.inv/a.rec,2) end,
    case when f.total=0 then 0 else round(100.0*a.inv/f.total,2) end
  from a, fat f;
end;
$$;

revoke all on function public.ads_resumo(date, date) from public, anon;
grant execute on function public.ads_resumo(date, date) to authenticated;