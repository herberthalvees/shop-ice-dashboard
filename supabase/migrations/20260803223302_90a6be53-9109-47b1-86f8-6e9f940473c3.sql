ALTER TABLE public.config
  ADD COLUMN IF NOT EXISTS push_venda_titulo text NOT NULL DEFAULT 'Nova venda na Shopee 🎉',
  ADD COLUMN IF NOT EXISTS push_venda_corpo text NOT NULL DEFAULT '{valor}{itens} · {pedido}',
  ADD COLUMN IF NOT EXISTS push_chat_titulo text NOT NULL DEFAULT '💬 {comprador} enviou uma mensagem',
  ADD COLUMN IF NOT EXISTS push_chat_corpo text NOT NULL DEFAULT '{mensagem}';