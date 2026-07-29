
CREATE OR REPLACE FUNCTION public.produtos_giro_ordenado(
  p_dias integer DEFAULT 30,
  p_sort text DEFAULT 'grupo',
  p_dir text DEFAULT 'asc'
)
RETURNS TABLE(
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
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
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
      SELECT pi.sku, SUM(pi.quantidade)::bigint AS vendidos,
             CASE WHEN SUM(pi.quantidade) = 0 THEN 0
                  ELSE SUM(pi.receita) / SUM(pi.quantidade) END AS preco_medio
      FROM public.pedido_itens pi
      WHERE pi.data_criacao_pedido >= now() - make_interval(days => %L::int)
        AND pi.status_pedido NOT IN ('UNPAID','CANCELLED')
      GROUP BY pi.sku
    ),
    base AS (
      SELECT
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
      LEFT JOIN vendas v ON v.sku = p.sku
      LEFT JOIN public.dim_produto d ON d.sku = p.sku
    )
    SELECT * FROM base ORDER BY %s
  $f$, p_dias, p_dias, p_dias, v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_giro_ordenado(integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.produtos_giro_ordenado(integer, text, text) TO authenticated, service_role;
