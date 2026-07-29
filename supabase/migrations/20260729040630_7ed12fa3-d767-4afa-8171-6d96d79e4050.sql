-- Agrega KPI do período
CREATE OR REPLACE FUNCTION public.dashboard_kpi_periodo(p_desde timestamptz, p_ate timestamptz)
RETURNS TABLE(pedidos bigint, faturamento numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint, COALESCE(SUM(valor_total), 0)::numeric
  FROM public.pedidos
  WHERE data_criacao_pedido >= p_desde AND data_criacao_pedido <= p_ate;
$$;

-- Série diária de pedidos e faturamento
CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(p_desde timestamptz, p_ate timestamptz)
RETURNS TABLE(dia date, pedidos bigint, faturamento numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (data_criacao_pedido AT TIME ZONE 'UTC')::date AS dia,
    COUNT(*)::bigint,
    COALESCE(SUM(valor_total), 0)::numeric
  FROM public.pedidos
  WHERE data_criacao_pedido >= p_desde AND data_criacao_pedido <= p_ate
  GROUP BY 1
  ORDER BY 1;
$$;

-- Top produtos por quantidade agregando os itens jsonb
CREATE OR REPLACE FUNCTION public.dashboard_top_produtos(p_desde timestamptz, p_ate timestamptz, p_limite int DEFAULT 10)
RETURNS TABLE(nome text, qtd bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      it->>'item_name',
      it->>'name',
      it->>'item_sku',
      'Item ' || COALESCE(it->>'item_id', '?')
    ) AS nome,
    SUM(
      COALESCE(
        NULLIF(it->>'model_quantity_purchased','')::numeric,
        NULLIF(it->>'quantity','')::numeric,
        NULLIF(it->>'qtd','')::numeric,
        1
      )
    )::bigint AS qtd
  FROM public.pedidos p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.itens, '[]'::jsonb)) AS it
  WHERE p.data_criacao_pedido >= p_desde AND p.data_criacao_pedido <= p_ate
  GROUP BY 1
  ORDER BY qtd DESC
  LIMIT p_limite;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_kpi_periodo(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_serie_diaria(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_top_produtos(timestamptz, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_periodo(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_diaria(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_top_produtos(timestamptz, timestamptz, int) TO authenticated;