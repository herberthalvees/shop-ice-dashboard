CREATE TABLE IF NOT EXISTS public.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo text,
  de timestamptz,
  ate timestamptz,
  encontrados integer,
  gravados integer,
  duracao_ms integer,
  ok boolean NOT NULL DEFAULT true,
  erros jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON public.sync_log (created_at DESC);
GRANT SELECT ON public.sync_log TO authenticated;
GRANT ALL ON public.sync_log TO service_role;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read sync_log" ON public.sync_log FOR SELECT TO authenticated USING (true);