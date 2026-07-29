-- ============ PARTE 1: TABELAS ============
CREATE TABLE IF NOT EXISTS public.pedido_itens (
  id bigserial PRIMARY KEY,
  order_sn text NOT NULL REFERENCES public.pedidos(order_sn) ON DELETE CASCADE,
  item_id bigint NOT NULL DEFAULT 0,
  model_id bigint NOT NULL DEFAULT 0,
  produto text,
  sku text,
  quantidade integer NOT NULL DEFAULT 0,
  preco_unitario numeric,
  receita numeric,
  status_pedido text,
  data_criacao_pedido timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_data ON public.pedido_itens (data_criacao_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_sku ON public.pedido_itens (sku);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_order ON public.pedido_itens (order_sn);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_data_status ON public.pedido_itens (data_criacao_pedido DESC, status_pedido);

GRANT SELECT ON public.pedido_itens TO authenticated;
GRANT ALL ON public.pedido_itens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pedido_itens_id_seq TO service_role;

ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read pedido_itens"
  ON public.pedido_itens FOR SELECT TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.dim_produto (
  sku text PRIMARY KEY,
  produto text,
  item_id bigint,
  custo_unitario numeric,
  categoria text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.dim_produto TO authenticated;
GRANT ALL ON public.dim_produto TO service_role;

ALTER TABLE public.dim_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read dim_produto"
  ON public.dim_produto FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update dim_produto"
  ON public.dim_produto FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- ============ PARTE 2: TRIGGER DE MANUTENCAO ============
CREATE OR REPLACE FUNCTION public.trg_pedidos_itens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pedido_itens WHERE order_sn = NEW.order_sn;
  IF NEW.itens IS NOT NULL AND jsonb_typeof(NEW.itens) = 'array' THEN
    INSERT INTO public.pedido_itens (
      order_sn, item_id, model_id, produto, sku,
      quantidade, preco_unitario, receita,
      status_pedido, data_criacao_pedido
    )
    SELECT
      NEW.order_sn,
      COALESCE((i->>'item_id')::bigint, 0),
      COALESCE((i->>'model_id')::bigint, 0),
      i->>'item_name',
      COALESCE(NULLIF(i->>'model_sku', ''), NULLIF(i->>'item_sku', ''), 'SEM_SKU'),
      COALESCE((i->>'model_quantity_purchased')::integer, 0),
      COALESCE((i->>'model_discounted_price')::numeric, 0),
      COALESCE((i->>'model_quantity_purchased')::numeric, 0)
        * COALESCE((i->>'model_discounted_price')::numeric, 0),
      NEW.status,
      NEW.data_criacao_pedido
    FROM jsonb_array_elements(NEW.itens) AS i;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_pedidos_itens() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pedidos_itens_aiu ON public.pedidos;
CREATE TRIGGER trg_pedidos_itens_aiu
AFTER INSERT OR UPDATE OF itens, status, data_criacao_pedido
ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.trg_pedidos_itens();

-- ============ PARTE 4: FUNCOES DE AGREGACAO ============
CREATE INDEX IF NOT EXISTS idx_pedidos_criacao_status
  ON public.pedidos (data_criacao_pedido DESC, status);

-- Substitui versões anteriores com assinaturas diferentes
DROP FUNCTION IF EXISTS public.dashboard_kpi_periodo(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.dashboard_serie_diaria(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.dashboard_top_produtos(timestamptz, timestamptz, int);

CREATE OR REPLACE FUNCTION public.dashboard_kpis()
RETURNS TABLE (
  pedidos_hoje bigint,
  faturamento_hoje numeric,
  pedidos_mes bigint,
  faturamento_mes numeric,
  aguardando_envio bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      status,
      valor_total,
      (data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date AS dia_local
    FROM public.pedidos
    WHERE data_criacao_pedido IS NOT NULL
  ),
  ref AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  )
  SELECT
    COUNT(*) FILTER (WHERE b.dia_local = r.hoje)::bigint,
    COALESCE(SUM(b.valor_total) FILTER (
      WHERE b.dia_local = r.hoje
        AND b.status NOT IN ('UNPAID', 'CANCELLED')
    ), 0)::numeric,
    COUNT(*) FILTER (
      WHERE date_trunc('month', b.dia_local) = date_trunc('month', r.hoje)
    )::bigint,
    COALESCE(SUM(b.valor_total) FILTER (
      WHERE date_trunc('month', b.dia_local) = date_trunc('month', r.hoje)
        AND b.status NOT IN ('UNPAID', 'CANCELLED')
    ), 0)::numeric,
    COUNT(*) FILTER (WHERE b.status IN ('READY_TO_SHIP', 'PROCESSED'))::bigint
  FROM base b CROSS JOIN ref r;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_serie_diaria(p_dias integer DEFAULT 30)
RETURNS TABLE (dia date, pedidos bigint, faturamento numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH calendario AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'America/Sao_Paulo')::date - (p_dias - 1),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      interval '1 day'
    )::date AS dia
  ),
  vendas AS (
    SELECT
      (data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      COUNT(*)::bigint AS pedidos,
      COALESCE(SUM(valor_total) FILTER (
        WHERE status NOT IN ('UNPAID', 'CANCELLED')
      ), 0)::numeric AS faturamento
    FROM public.pedidos
    WHERE data_criacao_pedido >= (
      (now() AT TIME ZONE 'America/Sao_Paulo')::date - (p_dias - 1)
    )
    GROUP BY 1
  )
  SELECT c.dia, COALESCE(v.pedidos, 0)::bigint, COALESCE(v.faturamento, 0)::numeric
  FROM calendario c
  LEFT JOIN vendas v ON v.dia = c.dia
  ORDER BY c.dia;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_top_produtos(
  p_dias integer DEFAULT 30,
  p_limite integer DEFAULT 10
)
RETURNS TABLE (produto text, sku text, quantidade bigint, receita numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    MAX(pi.produto),
    pi.sku,
    SUM(pi.quantidade)::bigint,
    SUM(pi.receita)::numeric
  FROM public.pedido_itens pi
  WHERE pi.data_criacao_pedido >= now() - make_interval(days => p_dias)
    AND pi.status_pedido NOT IN ('UNPAID', 'CANCELLED')
  GROUP BY pi.sku
  ORDER BY 3 DESC
  LIMIT p_limite;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_serie_diaria(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_top_produtos(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_diaria(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_top_produtos(integer, integer) TO authenticated;