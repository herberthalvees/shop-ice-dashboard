create extension if not exists btree_gist;

create table if not exists public.produto_custos (
  id bigserial primary key,
  item_id bigint not null,
  model_id bigint not null default 0,
  custo_unitario numeric not null,
  vigencia_inicio date not null,
  vigencia_fim date,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_produto_custos_chave
  on public.produto_custos (item_id, model_id, vigencia_inicio desc);

alter table public.produto_custos
  drop constraint if exists produto_custos_sem_sobreposicao;

alter table public.produto_custos
  add constraint produto_custos_sem_sobreposicao
  exclude using gist (
    item_id with =,
    model_id with =,
    daterange(vigencia_inicio, coalesce(vigencia_fim, 'infinity'::date), '[]') with &&
  );

grant select on public.produto_custos to authenticated;
grant all on public.produto_custos to service_role;
grant usage, select on sequence public.produto_custos_id_seq to service_role;

alter table public.produto_custos enable row level security;

drop policy if exists "admins read produto_custos" on public.produto_custos;
create policy "admins read produto_custos"
  on public.produto_custos for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

insert into public.produto_custos
  (item_id, model_id, custo_unitario, vigencia_inicio, observacao)
select d.item_id, d.model_id, d.custo_unitario, date '2000-01-01', 'carga inicial'
from public.dim_produto d
where d.custo_unitario is not null
on conflict do nothing;

drop function if exists public.analise_margem_sku(date, date);
drop function if exists public.produtos_giro_ordenado(integer, text, text);

alter table public.dim_produto drop column if exists custo_unitario;

-- ---------------------------------------------------------------
create or replace function public.registrar_custo(
  p_item_id bigint,
  p_model_id bigint,
  p_custo numeric,
  p_inicio date default null,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date := coalesce(p_inicio, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'nao autorizado';
  end if;

  update public.produto_custos
  set custo_unitario = p_custo,
      observacao = coalesce(p_observacao, observacao)
  where item_id = p_item_id
    and model_id = p_model_id
    and vigencia_inicio = v_inicio;

  if found then
    return;
  end if;

  update public.produto_custos
  set vigencia_fim = v_inicio - 1
  where item_id = p_item_id
    and model_id = p_model_id
    and vigencia_fim is null
    and vigencia_inicio < v_inicio;

  insert into public.produto_custos
    (item_id, model_id, custo_unitario, vigencia_inicio, observacao)
  values (p_item_id, p_model_id, p_custo, v_inicio, p_observacao);
end;
$$;

revoke all on function public.registrar_custo(bigint, bigint, numeric, date, text) from public;
grant execute on function public.registrar_custo(bigint, bigint, numeric, date, text) to authenticated;

-- ---------------------------------------------------------------
create or replace view public.pedido_itens_custeado
with (security_invoker = true)
as
select
  pi.*,
  c.custo_unitario as custo_vigente,
  pi.quantidade * c.custo_unitario as custo_total
from public.pedido_itens pi
left join lateral (
  select pc.custo_unitario
  from public.produto_custos pc
  where pc.item_id = pi.item_id
    and pc.model_id = pi.model_id
    and (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
        between pc.vigencia_inicio
            and coalesce(pc.vigencia_fim, date '9999-12-31')
  limit 1
) c on true;

grant select on public.pedido_itens_custeado to authenticated;
grant select on public.pedido_itens_custeado to service_role;

-- ---------------------------------------------------------------
create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date)
 returns TABLE(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, lucro numeric, lucro_pct numeric, lucro_medio numeric)
 language sql
 stable
 set search_path to 'public'
as $function$
  with validos as (
    select p.valor_total, p.valor_liquido,
           coalesce(p.comissao,0) + coalesce(p.taxa_servico,0)
             + coalesce(p.taxa_transacao,0) as taxa
    from public.pedidos p
    where (p.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and p.status not in ('UNPAID', 'CANCELLED')
  ),
  cancelados as (
    select count(*) as qtd, coalesce(sum(valor_total), 0) as valor
    from public.pedidos
    where (data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and status = 'CANCELLED'
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
      and pic.status_pedido not in ('UNPAID', 'CANCELLED')
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
      (select valor from cancelados) as canc_vl
  )
  select
    t.qt::bigint,
    t.unid::bigint,
    round(t.fat, 2),
    round(case when t.qt = 0 then 0 else t.fat / t.qt end, 2),
    t.canc_qt::bigint,
    round(t.canc_vl, 2),
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

-- ---------------------------------------------------------------
create or replace function public.analise_margem_sku(p_de date, p_ate date)
 returns TABLE(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
 language sql
 stable
 set search_path to 'public'
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
      and pic.status_pedido not in ('UNPAID', 'CANCELLED')
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
    f.item_id,
    f.model_id,
    f.sku,
    f.produto,
    f.unidades,
    round(f.preco_medio, 2),
    round(f.custo_periodo, 4),
    round(f.custo_atual, 4),
    round(f.liquido_un, 2),
    case when f.custo_periodo is null then null
         else round(f.liquido_un - f.custo_periodo, 2) end,
    case when f.custo_periodo is null or coalesce(f.preco_medio, 0) = 0 then null
         else round(100.0 * (f.liquido_un - f.custo_periodo)
                    / f.preco_medio, 1) end,
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

-- ---------------------------------------------------------------
create or replace function public.produtos_giro_ordenado(p_dias integer default 30, p_sort text default 'grupo'::text, p_dir text default 'asc'::text)
 returns TABLE(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text, custo_unitario numeric, margem_pct numeric)
 language plpgsql
 stable
 set search_path to 'public'
as $function$
DECLARE
  v_dir text := CASE WHEN lower(coalesce(p_dir,'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_sort text := lower(coalesce(p_sort,'grupo'));
  v_order text;
BEGIN
  v_order := CASE v_sort
    WHEN 'produto'    THEN format('produto %s NULLS LAST, variacao ASC NULLS LAST', v_dir)
    WHEN 'variacao'   THEN format('variacao %s NULLS LAST, produto ASC NULLS LAST', v_dir)
    WHEN 'sku'        THEN format('sku %s NULLS LAST', v_dir)
    WHEN 'preco'      THEN format('preco_atual %s NULLS LAST', v_dir)
    WHEN 'estoque'    THEN format('estoque_disponivel %s NULLS LAST', v_dir)
    WHEN 'vendidos'   THEN format('vendidos_periodo %s NULLS LAST', v_dir)
    WHEN 'media'      THEN format('media_diaria %s NULLS LAST', v_dir)
    WHEN 'dias'       THEN format('dias_de_estoque %s NULLS LAST', v_dir)
    WHEN 'custo'      THEN format('custo_unitario %s NULLS LAST', v_dir)
    WHEN 'margem'     THEN format('margem_pct %s NULLS LAST', v_dir)
    ELSE 'produto ASC NULLS LAST, variacao ASC NULLS LAST'
  END;

  RETURN QUERY EXECUTE format($f$
    WITH vendas AS (
      SELECT pi.item_id, pi.model_id,
             SUM(pi.quantidade)::bigint AS vendidos,
             CASE WHEN SUM(pi.quantidade) = 0 THEN 0
                  ELSE SUM(pi.receita) / SUM(pi.quantidade) END AS preco_medio
      FROM public.pedido_itens pi
      WHERE pi.data_criacao_pedido >= now() - make_interval(days => %L::int)
        AND pi.status_pedido NOT IN ('UNPAID','CANCELLED')
      GROUP BY pi.item_id, pi.model_id
    ),
    base AS (
      SELECT
        p.item_id,
        p.model_id,
        p.sku,
        p.produto,
        p.variacao,
        p.preco_atual,
        p.estoque_disponivel,
        COALESCE(v.vendidos, 0)::bigint AS vendidos_periodo,
        ROUND(COALESCE(v.vendidos,0)::numeric / %L::int, 2) AS media_diaria,
        CASE WHEN COALESCE(v.vendidos,0) = 0 THEN NULL
             ELSE ROUND(p.estoque_disponivel / (v.vendidos::numeric / %L::int), 1)
        END AS dias_de_estoque,
        p.status_item,
        p.imagem_url,
        atual.custo_unitario,
        CASE
          WHEN atual.custo_unitario IS NULL OR v.preco_medio IS NULL OR v.preco_medio = 0 THEN NULL
          ELSE ROUND(100.0 * (v.preco_medio * 0.80 - 4.00 - atual.custo_unitario) / v.preco_medio, 1)
        END AS margem_pct
      FROM public.produtos p
      LEFT JOIN vendas v ON v.item_id = p.item_id AND v.model_id = p.model_id
      LEFT JOIN LATERAL (
        SELECT pc.custo_unitario
        FROM public.produto_custos pc
        WHERE pc.item_id = p.item_id
          AND pc.model_id = p.model_id
          AND pc.vigencia_fim IS NULL
        ORDER BY pc.vigencia_inicio DESC
        LIMIT 1
      ) atual ON true
    )
    SELECT * FROM base ORDER BY %s
  $f$, p_dias, p_dias, p_dias, v_order);
END;
$function$;