-- ============ Pós-venda: contatos, cupons, campanhas, fila e opt-out ============

CREATE TABLE public.pv_contatos (
  to_id text PRIMARY KEY,
  conversation_id text,
  nome text,
  comprador_username text,
  ultima_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pv_contatos_comprador_idx ON public.pv_contatos (lower(comprador_username));
GRANT SELECT ON public.pv_contatos TO authenticated;
GRANT ALL ON public.pv_contatos TO service_role;
ALTER TABLE public.pv_contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner admins read pv_contatos" ON public.pv_contatos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());

CREATE TABLE public.pv_cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  desconto text,
  validade date,
  pedido_minimo numeric,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pv_cupons TO authenticated;
GRANT ALL ON public.pv_cupons TO service_role;
ALTER TABLE public.pv_cupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner admins read pv_cupons" ON public.pv_cupons
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins insert pv_cupons" ON public.pv_cupons
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins update pv_cupons" ON public.pv_cupons
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins delete pv_cupons" ON public.pv_cupons
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());

CREATE TABLE public.pv_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  cupom_id uuid REFERENCES public.pv_cupons(id) ON DELETE SET NULL,
  variacoes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ritmo integer NOT NULL DEFAULT 20,
  limite_diario integer NOT NULL DEFAULT 200,
  janela_dias integer NOT NULL DEFAULT 30,
  agendada_para timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pv_campanhas TO authenticated;
GRANT ALL ON public.pv_campanhas TO service_role;
ALTER TABLE public.pv_campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner admins read pv_campanhas" ON public.pv_campanhas
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins insert pv_campanhas" ON public.pv_campanhas
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins update pv_campanhas" ON public.pv_campanhas
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins delete pv_campanhas" ON public.pv_campanhas
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());

CREATE TABLE public.pv_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.pv_campanhas(id) ON DELETE CASCADE,
  to_id text NOT NULL,
  conversation_id text,
  comprador text,
  produto text,
  texto text,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, to_id)
);
CREATE INDEX pv_envios_fila_idx ON public.pv_envios (campanha_id, status);
CREATE INDEX pv_envios_comprador_idx ON public.pv_envios (lower(comprador)) WHERE status = 'enviado';
GRANT SELECT ON public.pv_envios TO authenticated;
GRANT ALL ON public.pv_envios TO service_role;
ALTER TABLE public.pv_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner admins read pv_envios" ON public.pv_envios
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());

CREATE TABLE public.pv_optout (
  comprador_username text PRIMARY KEY,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pv_optout TO authenticated;
GRANT ALL ON public.pv_optout TO service_role;
ALTER TABLE public.pv_optout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner admins read pv_optout" ON public.pv_optout
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins insert pv_optout" ON public.pv_optout
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());
CREATE POLICY "admins delete pv_optout" ON public.pv_optout
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND public.eh_owner());

-- ============ Seleção de público ============

CREATE OR REPLACE FUNCTION public.pv_publico(_f jsonb)
RETURNS TABLE (
  comprador text,
  to_id text,
  conversation_id text,
  pedidos bigint,
  total_gasto numeric,
  ultimo_em timestamptz,
  ultimo_ticket numeric,
  ultimo_produto text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      p.comprador_username AS comprador,
      count(*)::bigint AS pedidos,
      sum(coalesce(p.valor_total, 0)) AS total_gasto,
      max(p.data_criacao_pedido) AS ultimo_em
    FROM public.pedidos p
    WHERE p.comprador_username IS NOT NULL
      AND p.status NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
      AND ((_f->>'data_de') IS NULL OR p.data_criacao_pedido >= (_f->>'data_de')::timestamptz)
      AND ((_f->>'data_ate') IS NULL OR p.data_criacao_pedido < (((_f->>'data_ate')::date) + 1)::timestamptz)
      AND ((_f->>'sku') IS NULL OR EXISTS (
        SELECT 1 FROM public.pedido_itens i
        WHERE i.order_sn = p.order_sn
          AND (i.sku ILIKE '%' || (_f->>'sku') || '%' OR i.produto ILIKE '%' || (_f->>'sku') || '%')
      ))
    GROUP BY 1
  ), enriquecido AS (
    SELECT
      a.comprador,
      a.pedidos,
      a.total_gasto,
      a.ultimo_em,
      u.valor_total AS ultimo_ticket,
      (SELECT i.produto FROM public.pedido_itens i WHERE i.order_sn = u.order_sn ORDER BY i.receita DESC NULLS LAST LIMIT 1) AS ultimo_produto
    FROM agg a
    LEFT JOIN LATERAL (
      SELECT p2.order_sn, p2.valor_total
      FROM public.pedidos p2
      WHERE p2.comprador_username = a.comprador
        AND p2.status NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
      ORDER BY p2.data_criacao_pedido DESC NULLS LAST
      LIMIT 1
    ) u ON true
  )
  SELECT
    e.comprador,
    c.to_id,
    c.conversation_id,
    e.pedidos,
    e.total_gasto,
    e.ultimo_em,
    e.ultimo_ticket,
    e.ultimo_produto
  FROM enriquecido e
  LEFT JOIN public.pv_contatos c ON lower(c.comprador_username) = lower(e.comprador)
  WHERE ((_f->>'pedidos_min') IS NULL OR e.pedidos >= (_f->>'pedidos_min')::int)
    AND ((_f->>'pedidos_max') IS NULL OR e.pedidos <= (_f->>'pedidos_max')::int)
    AND ((_f->>'gasto_min') IS NULL OR e.total_gasto >= (_f->>'gasto_min')::numeric)
    AND ((_f->>'ticket_min') IS NULL OR coalesce(e.ultimo_ticket, 0) >= (_f->>'ticket_min')::numeric)
    AND ((_f->>'ticket_max') IS NULL OR coalesce(e.ultimo_ticket, 0) <= (_f->>'ticket_max')::numeric)
    AND ((_f->>'inativo_dias') IS NULL OR e.ultimo_em < now() - ((_f->>'inativo_dias')::int || ' days')::interval)
    AND (
      (_f->>'avaliacao') IS NULL
      OR ((_f->>'avaliacao') = 'positiva' AND EXISTS (
        SELECT 1 FROM public.avaliacoes av
        JOIN public.pedidos p3 ON p3.order_sn = av.order_sn
        WHERE p3.comprador_username = e.comprador AND av.rating >= 4))
      OR ((_f->>'avaliacao') = 'negativa' AND EXISTS (
        SELECT 1 FROM public.avaliacoes av
        JOIN public.pedidos p3 ON p3.order_sn = av.order_sn
        WHERE p3.comprador_username = e.comprador AND av.rating <= 3))
      OR ((_f->>'avaliacao') = 'sem' AND NOT EXISTS (
        SELECT 1 FROM public.avaliacoes av
        JOIN public.pedidos p3 ON p3.order_sn = av.order_sn
        WHERE p3.comprador_username = e.comprador))
    )
    AND NOT EXISTS (SELECT 1 FROM public.pv_optout o WHERE lower(o.comprador_username) = lower(e.comprador))
    AND NOT EXISTS (
      SELECT 1 FROM public.pv_envios en
      WHERE en.status = 'enviado'
        AND lower(coalesce(en.comprador, '')) = lower(e.comprador)
        AND en.enviado_em > now() - ((coalesce((_f->>'janela_dias')::int, 30))::text || ' days')::interval
    )
$$;

CREATE OR REPLACE FUNCTION public.pv_publico_preview(_f jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res jsonb;
BEGIN
  IF NOT public.eh_owner() THEN RAISE EXCEPTION 'acesso negado'; END IF;
  SELECT jsonb_build_object(
    'total', count(*),
    'alcancaveis', count(*) FILTER (WHERE to_id IS NOT NULL),
    'amostra', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT comprador, to_id IS NOT NULL AS alcancavel, pedidos, total_gasto, ultimo_em, ultimo_produto
        FROM public.pv_publico(_f)
        ORDER BY total_gasto DESC NULLS LAST
        LIMIT 20
      ) x
    ), '[]'::jsonb)
  ) INTO _res
  FROM public.pv_publico(_f);
  RETURN _res;
END;
$$;

CREATE OR REPLACE FUNCTION public.pv_materializar_publico(_campanha uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f jsonb;
  _n integer;
BEGIN
  IF NOT (public.eh_owner() OR auth.role() = 'service_role') THEN RAISE EXCEPTION 'acesso negado'; END IF;
  SELECT jsonb_set_lax(filtros, '{janela_dias}', to_jsonb(janela_dias), true) INTO _f
  FROM public.pv_campanhas WHERE id = _campanha;
  IF _f IS NULL THEN RAISE EXCEPTION 'campanha nao encontrada'; END IF;

  INSERT INTO public.pv_envios (campanha_id, to_id, conversation_id, comprador, produto)
  SELECT _campanha, p.to_id, p.conversation_id, p.comprador, p.ultimo_produto
  FROM public.pv_publico(_f) p
  WHERE p.to_id IS NOT NULL
  ON CONFLICT (campanha_id, to_id) DO NOTHING;

  SELECT count(*) INTO _n FROM public.pv_envios WHERE campanha_id = _campanha AND status = 'pendente';
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.pv_campanha_resultado(_campanha uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res jsonb;
BEGIN
  IF NOT public.eh_owner() THEN RAISE EXCEPTION 'acesso negado'; END IF;
  SELECT jsonb_build_object(
    'total', count(*),
    'enviados', count(*) FILTER (WHERE status = 'enviado'),
    'pendentes', count(*) FILTER (WHERE status = 'pendente'),
    'erros', count(*) FILTER (WHERE status = 'erro'),
    'pedidos_pos', coalesce((
      SELECT count(*) FROM public.pv_envios en
      JOIN public.pedidos p ON p.comprador_username = en.comprador
      WHERE en.campanha_id = _campanha AND en.status = 'enviado'
        AND p.status NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
        AND p.data_criacao_pedido BETWEEN en.enviado_em AND en.enviado_em + interval '14 days'
    ), 0),
    'receita_pos', coalesce((
      SELECT sum(coalesce(p.valor_total, 0)) FROM public.pv_envios en
      JOIN public.pedidos p ON p.comprador_username = en.comprador
      WHERE en.campanha_id = _campanha AND en.status = 'enviado'
        AND p.status NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
        AND p.data_criacao_pedido BETWEEN en.enviado_em AND en.enviado_em + interval '14 days'
    ), 0)
  ) INTO _res
  FROM public.pv_envios WHERE campanha_id = _campanha;
  RETURN _res;
END;
$$;

REVOKE ALL ON FUNCTION public.pv_publico(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pv_publico_preview(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pv_materializar_publico(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pv_campanha_resultado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pv_publico_preview(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pv_materializar_publico(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pv_campanha_resultado(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pv_publico(jsonb) TO service_role;