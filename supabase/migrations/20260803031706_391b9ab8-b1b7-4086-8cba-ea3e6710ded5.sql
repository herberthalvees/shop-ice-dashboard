CREATE TABLE public.push_dispositivos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  apelido text,
  user_agent text,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_envio_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_dispositivos TO authenticated;
GRANT ALL ON public.push_dispositivos TO service_role;
ALTER TABLE public.push_dispositivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_dispositivos_owner_all" ON public.push_dispositivos
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_push_dispositivos_user ON public.push_dispositivos(user_id) WHERE ativo;

CREATE TABLE public.push_envios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL,
  titulo text NOT NULL,
  corpo text,
  referencia text,
  dispositivos int NOT NULL DEFAULT 0,
  sucesso int NOT NULL DEFAULT 0,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_envios TO authenticated;
GRANT ALL ON public.push_envios TO service_role;
ALTER TABLE public.push_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_envios_select_auth" ON public.push_envios
  FOR SELECT TO authenticated
  USING (true);

CREATE UNIQUE INDEX idx_push_envios_ref ON public.push_envios(tipo, referencia) WHERE referencia IS NOT NULL;