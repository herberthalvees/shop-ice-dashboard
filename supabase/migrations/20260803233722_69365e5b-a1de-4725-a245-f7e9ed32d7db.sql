-- 1) Marcação de origem (marketplace) nas tabelas de dados
ALTER TABLE public.pedidos      ADD COLUMN IF NOT EXISTS marketplace text NOT NULL DEFAULT 'shopee';
ALTER TABLE public.pedido_itens ADD COLUMN IF NOT EXISTS marketplace text NOT NULL DEFAULT 'shopee';
ALTER TABLE public.produtos     ADD COLUMN IF NOT EXISTS marketplace text NOT NULL DEFAULT 'shopee';

ALTER TABLE public.pedidos      DROP CONSTRAINT IF EXISTS pedidos_marketplace_check;
ALTER TABLE public.pedidos      ADD CONSTRAINT pedidos_marketplace_check CHECK (marketplace IN ('shopee','tiktok'));
ALTER TABLE public.pedido_itens DROP CONSTRAINT IF EXISTS pedido_itens_marketplace_check;
ALTER TABLE public.pedido_itens ADD CONSTRAINT pedido_itens_marketplace_check CHECK (marketplace IN ('shopee','tiktok'));
ALTER TABLE public.produtos     DROP CONSTRAINT IF EXISTS produtos_marketplace_check;
ALTER TABLE public.produtos     ADD CONSTRAINT produtos_marketplace_check CHECK (marketplace IN ('shopee','tiktok'));

CREATE INDEX IF NOT EXISTS pedidos_marketplace_data_idx      ON public.pedidos (marketplace, data_criacao_pedido DESC);
CREATE INDEX IF NOT EXISTS pedido_itens_marketplace_data_idx ON public.pedido_itens (marketplace, data_criacao_pedido DESC);
CREATE INDEX IF NOT EXISTS produtos_marketplace_idx          ON public.produtos (marketplace);

-- 2) Conexão da loja no TikTok Shop
CREATE TABLE IF NOT EXISTS public.tiktok_connection (
  id integer PRIMARY KEY DEFAULT 1,
  shop_id text,
  shop_name text,
  shop_cipher text,
  seller_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  status text NOT NULL DEFAULT 'desconectada',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tiktok_connection_id_check CHECK (id = 1)
);

INSERT INTO public.tiktok_connection (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.tiktok_connection TO authenticated;
GRANT ALL    ON public.tiktok_connection TO service_role;

ALTER TABLE public.tiktok_connection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tiktok_connection_select_owner" ON public.tiktok_connection;
CREATE POLICY "tiktok_connection_select_owner"
  ON public.tiktok_connection FOR SELECT TO authenticated
  USING (public.eh_owner());