CREATE TABLE public.ia_uso (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id uuid REFERENCES public.ia_conversas(id) ON DELETE SET NULL,
  modelo text NOT NULL,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_saida integer NOT NULL DEFAULT 0,
  tokens_raciocinio integer NOT NULL DEFAULT 0,
  passos integer NOT NULL DEFAULT 1,
  custo_creditos numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ia_uso TO authenticated;
GRANT ALL ON public.ia_uso TO service_role;

ALTER TABLE public.ia_uso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner le uso ia" ON public.ia_uso FOR SELECT TO authenticated USING (public.eh_owner());
CREATE POLICY "owner grava uso ia" ON public.ia_uso FOR INSERT TO authenticated WITH CHECK (public.eh_owner());

CREATE INDEX ia_uso_created_at_idx ON public.ia_uso (created_at DESC);