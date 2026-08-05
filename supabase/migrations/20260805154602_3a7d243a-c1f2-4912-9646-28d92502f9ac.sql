ALTER TABLE public.config
  ADD COLUMN IF NOT EXISTS push_venda_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_chat_ativo boolean NOT NULL DEFAULT true;