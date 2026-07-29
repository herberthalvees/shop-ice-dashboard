
DROP FUNCTION IF EXISTS public.produtos_com_giro(integer);
DROP FUNCTION IF EXISTS public.produtos_com_giro(p_dias integer);

CREATE OR REPLACE FUNCTION public.produtos_com_giro(
  p_de date,
  p_ate date
)
RETURNS TABLE (
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
  imagem_url text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH dias AS (
    SELECT GREATEST((p_ate - p_de) + 1, 1) AS qtd
  ),
  vendas AS (
    SELECT
      pi.item_id,
      pi.model_id,
      SUM(pi.quantidade)::bigint AS vendidos
    FROM public.pedido_itens pi
    WHERE (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN p_de AND p_ate
      AND pi.status_pedido NOT IN ('UNPAID', 'CANCELLED')
    GROUP BY pi.item_id, pi.model_id
  )
  SELECT
    p.item_id,
    p.model_id,
    p.sku,
    p.produto,
    p.variacao,
    p.preco_atual,
    p.estoque_disponivel,
    COALESCE(v.vendidos, 0)::bigint,
    ROUND(COALESCE(v.vendidos, 0)::numeric / (SELECT qtd FROM dias), 2),
    CASE
      WHEN COALESCE(v.vendidos, 0) = 0 THEN NULL
      ELSE ROUND(p.estoque_disponivel
                 / (v.vendidos::numeric / (SELECT qtd FROM dias)), 1)
    END,
    p.status_item,
    p.imagem_url
  FROM public.produtos p
  LEFT JOIN vendas v
    ON v.item_id = p.item_id AND v.model_id = p.model_id
  ORDER BY COALESCE(v.vendidos, 0) DESC;
$$;

REVOKE ALL ON FUNCTION public.produtos_com_giro(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_com_giro(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.analise_margem_sku(date, date);

CREATE OR REPLACE FUNCTION public.analise_margem_sku(
  p_de date,
  p_ate date
)
RETURNS TABLE (
  item_id bigint,
  model_id bigint,
  sku text,
  produto text,
  unidades bigint,
  preco_medio numeric,
  custo_unitario numeric,
  liquido_unitario numeric,
  lucro_unitario numeric,
  margem_pct numeric,
  preco_minimo numeric,
  roas_minimo numeric,
  situacao text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH vendas AS (
    SELECT
      pi.item_id,
      pi.model_id,
      SUM(pi.quantidade)::bigint AS unidades,
      CASE WHEN SUM(pi.quantidade) = 0 THEN NULL
           ELSE SUM(pi.receita) / SUM(pi.quantidade) END AS preco_vendido
    FROM public.pedido_itens pi
    WHERE (pi.data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date
          BETWEEN p_de AND p_ate
      AND pi.status_pedido NOT IN ('UNPAID', 'CANCELLED')
    GROUP BY pi.item_id, pi.model_id
  ),
  calc AS (
    SELECT
      p.item_id,
      p.model_id,
      p.sku,
      COALESCE(p.produto, '') || CASE
        WHEN NULLIF(p.variacao, '') IS NULL THEN ''
        ELSE ' - ' || p.variacao
      END AS produto,
      COALESCE(v.unidades, 0)::bigint AS unidades,
      COALESCE(v.preco_vendido, p.preco_atual) AS preco_medio,
      d.custo_unitario
    FROM public.produtos p
    LEFT JOIN vendas v
      ON v.item_id = p.item_id AND v.model_id = p.model_id
    LEFT JOIN public.dim_produto d
      ON d.item_id = p.item_id AND d.model_id = p.model_id
  ),
  fim AS (
    SELECT c.*, c.preco_medio * 0.80 - 4.00 AS liquido_un
    FROM calc c
  )
  SELECT
    f.item_id,
    f.model_id,
    f.sku,
    f.produto,
    f.unidades,
    ROUND(f.preco_medio, 2),
    f.custo_unitario,
    ROUND(f.liquido_un, 2),
    CASE WHEN f.custo_unitario IS NULL THEN NULL
         ELSE ROUND(f.liquido_un - f.custo_unitario, 2) END,
    CASE WHEN f.custo_unitario IS NULL OR COALESCE(f.preco_medio, 0) = 0 THEN NULL
         ELSE ROUND(100.0 * (f.liquido_un - f.custo_unitario)
                    / f.preco_medio, 1) END,
    CASE WHEN f.custo_unitario IS NULL THEN NULL
         ELSE ROUND((f.custo_unitario + 4.00) / 0.80, 2) END,
    CASE WHEN f.custo_unitario IS NULL
           OR (f.liquido_un - f.custo_unitario) <= 0 THEN NULL
         ELSE ROUND(f.preco_medio / (f.liquido_un - f.custo_unitario), 2) END,
    CASE
      WHEN f.custo_unitario IS NULL THEN 'sem custo'
      WHEN f.liquido_un - f.custo_unitario < 0 THEN 'prejuizo'
      WHEN 100.0 * (f.liquido_un - f.custo_unitario)
           / NULLIF(f.preco_medio, 0) < 10 THEN 'margem baixa'
      ELSE 'ok'
    END
  FROM fim f
  ORDER BY f.unidades DESC, f.produto;
$$;

REVOKE ALL ON FUNCTION public.analise_margem_sku(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analise_margem_sku(date, date) TO authenticated;
