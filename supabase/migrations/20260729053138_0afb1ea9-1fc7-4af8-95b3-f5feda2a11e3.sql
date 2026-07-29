
-- 1. Ajuste da chave primaria de dim_produto
alter table public.dim_produto drop constraint if exists dim_produto_pkey;
alter table public.dim_produto add column if not exists model_id bigint not null default 0;

-- Limpa e repopula a partir do catalogo (nao havia custos preenchidos ainda)
delete from public.dim_produto;

alter table public.dim_produto alter column item_id set not null;
alter table public.dim_produto alter column sku drop not null;
alter table public.dim_produto add primary key (item_id, model_id);

insert into public.dim_produto (item_id, model_id, sku, produto)
select
  p.item_id,
  p.model_id,
  p.sku,
  coalesce(p.produto, '') || case
    when nullif(p.variacao, '') is null then ''
    else ' - ' || p.variacao
  end
from public.produtos p;

-- 2. Recria analise_margem_sku fazendo o join por (item_id, model_id)
drop function if exists public.analise_margem_sku(date, date);

create or replace function public.analise_margem_sku(p_de date, p_ate date)
returns table(
  item_id bigint,
  model_id bigint,
  sku text,
  produto text,
  unidades bigint,
  preco_medio numeric,
  custo_unitario numeric,
  taxa_percentual numeric,
  taxa_fixa numeric,
  liquido_unitario numeric,
  lucro_unitario numeric,
  margem_pct numeric,
  preco_minimo numeric,
  situacao text
)
language sql
stable
set search_path to 'public'
as $function$
  with vendas as (
    select
      pi.item_id,
      pi.model_id,
      max(pi.sku) as sku,
      max(pi.produto) as produto,
      sum(pi.quantidade)::bigint as unidades,
      case when sum(pi.quantidade) = 0 then 0
           else sum(pi.receita) / sum(pi.quantidade) end as preco_medio
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
    group by pi.item_id, pi.model_id
  )
  select
    v.item_id,
    v.model_id,
    v.sku,
    v.produto,
    v.unidades,
    round(v.preco_medio, 2),
    d.custo_unitario,
    0.20::numeric,
    4.00::numeric,
    round(v.preco_medio * 0.80 - 4.00, 2),
    case when d.custo_unitario is null then null
         else round(v.preco_medio * 0.80 - 4.00 - d.custo_unitario, 2) end,
    case when d.custo_unitario is null or v.preco_medio = 0 then null
         else round(100.0 * (v.preco_medio * 0.80 - 4.00 - d.custo_unitario)
                    / v.preco_medio, 1) end,
    case when d.custo_unitario is null then null
         else round((d.custo_unitario + 4.00) / 0.80, 2) end,
    case
      when d.custo_unitario is null then 'sem custo'
      when v.preco_medio * 0.80 - 4.00 - d.custo_unitario < 0 then 'prejuizo'
      when 100.0 * (v.preco_medio * 0.80 - 4.00 - d.custo_unitario)
           / nullif(v.preco_medio, 0) < 10 then 'margem baixa'
      else 'ok'
    end
  from vendas v
  left join public.dim_produto d on d.item_id = v.item_id and d.model_id = v.model_id
  order by v.unidades desc;
$function$;

revoke all on function public.analise_margem_sku(date, date) from public, anon;
grant execute on function public.analise_margem_sku(date, date) to authenticated, service_role;

-- 3. Recria produtos_giro_ordenado incluindo item_id/model_id no retorno
drop function if exists public.produtos_giro_ordenado(integer, text, text);

create or replace function public.produtos_giro_ordenado(
  p_dias integer default 30,
  p_sort text default 'grupo',
  p_dir text default 'asc'
)
returns table(
  item_id bigint,
  model_id bigint,
  sku text,
  produto text,
  variacao text,
  preco_atual numeric,
  estoque_disponivel integer,
  vendidos_periodo bigint,
  media_diaria numeric,
  dias_de_estoque numeric,
  status_item text,
  imagem_url text,
  custo_unitario numeric,
  margem_pct numeric
)
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
        d.custo_unitario,
        CASE
          WHEN d.custo_unitario IS NULL OR v.preco_medio IS NULL OR v.preco_medio = 0 THEN NULL
          ELSE ROUND(100.0 * (v.preco_medio * 0.80 - 4.00 - d.custo_unitario) / v.preco_medio, 1)
        END AS margem_pct
      FROM public.produtos p
      LEFT JOIN vendas v ON v.item_id = p.item_id AND v.model_id = p.model_id
      LEFT JOIN public.dim_produto d ON d.item_id = p.item_id AND d.model_id = p.model_id
    )
    SELECT * FROM base ORDER BY %s
  $f$, p_dias, p_dias, p_dias, v_order);
END;
$function$;

revoke all on function public.produtos_giro_ordenado(integer, text, text) from public, anon;
grant execute on function public.produtos_giro_ordenado(integer, text, text) to authenticated, service_role;
