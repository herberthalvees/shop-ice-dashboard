-- ========== ESTOQUE REAL (independente dos marketplaces) ==========

CREATE TABLE public.estoque_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  imagem_url text,
  unidade text NOT NULL DEFAULT 'un',
  saldo numeric NOT NULL DEFAULT 0,
  estoque_minimo numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_itens TO authenticated;
GRANT ALL ON public.estoque_itens TO service_role;
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner admins read estoque_itens" ON public.estoque_itens
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins insert estoque_itens" ON public.estoque_itens
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update estoque_itens" ON public.estoque_itens
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete estoque_itens" ON public.estoque_itens
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.estoque_vinculos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estoque_item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE CASCADE,
  marketplace text NOT NULL DEFAULT 'shopee',
  item_id bigint NOT NULL,
  model_id bigint NOT NULL DEFAULT 0,
  fator numeric NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX estoque_vinculos_unico
  ON public.estoque_vinculos (marketplace, item_id, model_id, estoque_item_id);
CREATE INDEX estoque_vinculos_lookup
  ON public.estoque_vinculos (marketplace, item_id, model_id) WHERE ativo;
CREATE INDEX estoque_vinculos_item ON public.estoque_vinculos (estoque_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_vinculos TO authenticated;
GRANT ALL ON public.estoque_vinculos TO service_role;
ALTER TABLE public.estoque_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner admins read estoque_vinculos" ON public.estoque_vinculos
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins insert estoque_vinculos" ON public.estoque_vinculos
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update estoque_vinculos" ON public.estoque_vinculos
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete estoque_vinculos" ON public.estoque_vinculos
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.estoque_movimentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estoque_item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  quantidade numeric NOT NULL,
  saldo_apos numeric,
  origem text NOT NULL DEFAULT 'manual',
  marketplace text,
  order_sn text,
  item_id bigint,
  model_id bigint,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX estoque_movimentos_item ON public.estoque_movimentos (estoque_item_id, created_at DESC);
CREATE UNIQUE INDEX estoque_movimentos_venda_unica
  ON public.estoque_movimentos (estoque_item_id, marketplace, order_sn, item_id, model_id)
  WHERE origem = 'venda';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_movimentos TO authenticated;
GRANT ALL ON public.estoque_movimentos TO service_role;
ALTER TABLE public.estoque_movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner admins read estoque_movimentos" ON public.estoque_movimentos
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins insert estoque_movimentos" ON public.estoque_movimentos
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update estoque_movimentos" ON public.estoque_movimentos
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete estoque_movimentos" ON public.estoque_movimentos
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_estoque_itens_updated BEFORE UPDATE ON public.estoque_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_estoque_vinculos_updated BEFORE UPDATE ON public.estoque_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== movimentação manual (entrada / ajuste / saída avulsa) ==========
CREATE OR REPLACE FUNCTION public.estoque_movimentar(
  p_estoque_item_id uuid,
  p_quantidade numeric,
  p_tipo text DEFAULT 'entrada',
  p_observacao text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo numeric; v_delta numeric;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'não autorizado';
  END IF;

  IF p_tipo = 'saldo' THEN
    SELECT saldo INTO v_saldo FROM estoque_itens WHERE id = p_estoque_item_id FOR UPDATE;
    IF v_saldo IS NULL THEN RAISE EXCEPTION 'item de estoque não encontrado'; END IF;
    v_delta := p_quantidade - v_saldo;
  ELSIF p_tipo = 'entrada' THEN
    v_delta := abs(p_quantidade);
  ELSE
    v_delta := -abs(p_quantidade);
  END IF;

  UPDATE estoque_itens SET saldo = saldo + v_delta WHERE id = p_estoque_item_id
    RETURNING saldo INTO v_saldo;
  IF v_saldo IS NULL THEN RAISE EXCEPTION 'item de estoque não encontrado'; END IF;

  INSERT INTO estoque_movimentos (estoque_item_id, tipo, quantidade, saldo_apos, origem, observacao)
  VALUES (p_estoque_item_id,
          CASE WHEN p_tipo = 'saldo' THEN 'ajuste' ELSE p_tipo END,
          v_delta, v_saldo, 'manual', p_observacao);

  RETURN v_saldo;
END; $$;

REVOKE ALL ON FUNCTION public.estoque_movimentar(uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estoque_movimentar(uuid, numeric, text, text) TO authenticated;

-- ========== baixa automática por venda ==========
CREATE OR REPLACE FUNCTION public.estoque_baixar_venda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD; v_qtd numeric; v_saldo numeric;
BEGIN
  FOR v IN
    SELECT estoque_item_id, fator
    FROM estoque_vinculos
    WHERE ativo
      AND marketplace = COALESCE(NEW.marketplace, 'shopee')
      AND item_id = NEW.item_id
      AND model_id = COALESCE(NEW.model_id, 0)
  LOOP
    v_qtd := COALESCE(NEW.quantidade, 0) * COALESCE(v.fator, 1);
    IF v_qtd = 0 THEN CONTINUE; END IF;

    INSERT INTO estoque_movimentos
      (estoque_item_id, tipo, quantidade, origem, marketplace, order_sn, item_id, model_id)
    VALUES
      (v.estoque_item_id, 'saida', -v_qtd, 'venda',
       COALESCE(NEW.marketplace, 'shopee'), NEW.order_sn, NEW.item_id, COALESCE(NEW.model_id, 0))
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      UPDATE estoque_itens SET saldo = saldo - v_qtd
      WHERE id = v.estoque_item_id RETURNING saldo INTO v_saldo;

      UPDATE estoque_movimentos SET saldo_apos = v_saldo
      WHERE estoque_item_id = v.estoque_item_id AND origem = 'venda'
        AND marketplace = COALESCE(NEW.marketplace, 'shopee')
        AND order_sn = NEW.order_sn AND item_id = NEW.item_id
        AND model_id = COALESCE(NEW.model_id, 0);
    END IF;
  END LOOP;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_estoque_baixar_venda
  AFTER INSERT ON public.pedido_itens
  FOR EACH ROW EXECUTE FUNCTION public.estoque_baixar_venda();

-- ========== leitura consolidada ==========
CREATE OR REPLACE FUNCTION public.estoque_listar()
RETURNS TABLE (
  id uuid,
  nome text,
  descricao text,
  imagem_url text,
  unidade text,
  saldo numeric,
  estoque_minimo numeric,
  ativo boolean,
  vinculos jsonb,
  vendidos_30d numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.nome, e.descricao, e.imagem_url, e.unidade, e.saldo, e.estoque_minimo, e.ativo,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'marketplace', v.marketplace, 'item_id', v.item_id, 'model_id', v.model_id,
        'fator', v.fator, 'ativo', v.ativo,
        'produto', p.produto, 'variacao', p.variacao, 'sku', p.sku, 'imagem_url', p.imagem_url
      ) ORDER BY p.produto NULLS LAST, p.variacao NULLS LAST)
      FROM estoque_vinculos v
      LEFT JOIN produtos p
        ON p.item_id = v.item_id AND p.model_id = v.model_id AND p.marketplace = v.marketplace
      WHERE v.estoque_item_id = e.id
    ), '[]'::jsonb) AS vinculos,
    COALESCE((
      SELECT -SUM(m.quantidade) FROM estoque_movimentos m
      WHERE m.estoque_item_id = e.id AND m.origem = 'venda'
        AND m.created_at >= now() - interval '30 days'
    ), 0) AS vendidos_30d
  FROM estoque_itens e
  WHERE has_role(auth.uid(), 'admin'::app_role) AND eh_owner()
  ORDER BY e.ativo DESC, e.nome;
$$;

REVOKE ALL ON FUNCTION public.estoque_listar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estoque_listar() TO authenticated;