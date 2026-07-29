
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS moeda text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS qtd_itens integer;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS data_pagamento timestamptz;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS frete_real numeric;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS payload jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_order_sn_key'
  ) THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_order_sn_key UNIQUE (order_sn);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_criacao ON public.pedidos (data_criacao_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos (status);

DROP POLICY IF EXISTS "admins manage pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "authenticated read pedidos" ON public.pedidos;

CREATE POLICY "authenticated read pedidos"
  ON public.pedidos FOR SELECT
  TO authenticated
  USING (true);
