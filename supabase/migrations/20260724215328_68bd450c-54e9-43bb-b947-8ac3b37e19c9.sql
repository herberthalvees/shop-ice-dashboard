
-- Trigger de updated_at compartilhado
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- shopee_connection (linha única)
CREATE TABLE public.shopee_connection (
  id integer PRIMARY KEY DEFAULT 1,
  shop_id bigint,
  shop_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'revogada',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopee_connection_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopee_connection TO authenticated;
GRANT ALL ON public.shopee_connection TO service_role;
ALTER TABLE public.shopee_connection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth acessa shopee_connection" ON public.shopee_connection
  FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE TRIGGER set_shopee_connection_updated_at BEFORE UPDATE ON public.shopee_connection
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Semeia a linha única
INSERT INTO public.shopee_connection (id, status) VALUES (1, 'revogada') ON CONFLICT (id) DO NOTHING;

-- pedidos
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_sn text NOT NULL UNIQUE,
  status text,
  valor_total numeric(12,2),
  comprador_username text,
  itens jsonb,
  payload_json jsonb,
  data_criacao_pedido timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth acessa pedidos" ON public.pedidos
  FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX pedidos_status_idx ON public.pedidos (status);
CREATE INDEX pedidos_data_criacao_idx ON public.pedidos (data_criacao_pedido DESC);
CREATE TRIGGER set_pedidos_updated_at BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- produtos
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id bigint NOT NULL UNIQUE,
  nome text,
  sku text,
  preco numeric(12,2),
  estoque integer DEFAULT 0,
  status text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth acessa produtos" ON public.produtos
  FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX produtos_estoque_idx ON public.produtos (estoque);
CREATE TRIGGER set_produtos_updated_at BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- eventos_log
CREATE TABLE public.eventos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_evento text NOT NULL,
  payload jsonb,
  notificado boolean NOT NULL DEFAULT false,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_log TO authenticated;
GRANT ALL ON public.eventos_log TO service_role;
ALTER TABLE public.eventos_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth acessa eventos_log" ON public.eventos_log
  FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX eventos_log_created_at_idx ON public.eventos_log (created_at DESC);

-- config (linha única)
CREATE TABLE public.config (
  id integer PRIMARY KEY DEFAULT 1,
  webhook_whatsapp_url text,
  eventos jsonb NOT NULL DEFAULT '{"novo_pedido":true,"pedido_cancelado":true,"pedido_enviado":false,"estoque_baixo":true}'::jsonb,
  limite_estoque_baixo integer NOT NULL DEFAULT 5,
  notificacoes_ativas boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT config_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config TO authenticated;
GRANT ALL ON public.config TO service_role;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth acessa config" ON public.config
  FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE TRIGGER set_config_updated_at BEFORE UPDATE ON public.config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
