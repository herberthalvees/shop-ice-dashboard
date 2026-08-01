CREATE TABLE IF NOT EXISTS public.alertas_enviados (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL,
  chave text NOT NULL,
  enviado boolean NOT NULL DEFAULT false,
  erro text,
  detalhe jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);

GRANT SELECT ON public.alertas_enviados TO authenticated;
GRANT ALL ON public.alertas_enviados TO service_role;

ALTER TABLE public.alertas_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read alertas_enviados"
ON public.alertas_enviados FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());