CREATE TABLE public.avaliacoes (
  comment_id bigint PRIMARY KEY,
  order_sn text,
  item_id bigint,
  model_id bigint,
  produto text,
  comprador text,
  rating smallint,
  comentario text,
  criado_em timestamptz,
  resposta_shopee text,
  respondida boolean NOT NULL DEFAULT false,
  resposta_gerada text,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviada_em timestamptz,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avaliacoes TO authenticated;
GRANT ALL ON public.avaliacoes TO service_role;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read avaliacoes" ON public.avaliacoes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins insert avaliacoes" ON public.avaliacoes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins update avaliacoes" ON public.avaliacoes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner()) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins delete avaliacoes" ON public.avaliacoes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE INDEX avaliacoes_criado_em_idx ON public.avaliacoes (criado_em DESC);
CREATE INDEX avaliacoes_status_idx ON public.avaliacoes (status);
CREATE TRIGGER update_avaliacoes_updated_at BEFORE UPDATE ON public.avaliacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.avaliacoes_exemplos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estrelas smallint NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
  texto text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avaliacoes_exemplos TO authenticated;
GRANT ALL ON public.avaliacoes_exemplos TO service_role;
ALTER TABLE public.avaliacoes_exemplos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read avaliacoes_exemplos" ON public.avaliacoes_exemplos FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins insert avaliacoes_exemplos" ON public.avaliacoes_exemplos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins update avaliacoes_exemplos" ON public.avaliacoes_exemplos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner()) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins delete avaliacoes_exemplos" ON public.avaliacoes_exemplos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE TRIGGER update_avaliacoes_exemplos_updated_at BEFORE UPDATE ON public.avaliacoes_exemplos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.config
  ADD COLUMN IF NOT EXISTS avaliacoes_auto_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avaliacoes_prompt text NOT NULL DEFAULT 'Responda como a loja Dream Ice: tom simpático, brasileiro, direto, sem exageros. Agradeça pela avaliação, cite o produto quando fizer sentido e nunca prometa nada que a loja não possa cumprir. Máximo 300 caracteres.';