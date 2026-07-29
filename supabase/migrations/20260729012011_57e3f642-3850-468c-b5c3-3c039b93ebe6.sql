
-- Add new columns
ALTER TABLE public.eventos_log
  ADD COLUMN IF NOT EXISTS code integer,
  ADD COLUMN IF NOT EXISTS shop_id bigint,
  ADD COLUMN IF NOT EXISTS assinatura_valida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processado boolean NOT NULL DEFAULT false;

-- Make payload required, tipo_evento optional (code drives it now)
UPDATE public.eventos_log SET payload = '{}'::jsonb WHERE payload IS NULL;
ALTER TABLE public.eventos_log ALTER COLUMN payload SET NOT NULL;
ALTER TABLE public.eventos_log ALTER COLUMN tipo_evento DROP NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eventos_log_created ON public.eventos_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_log_code ON public.eventos_log (code);

-- Ensure RLS is on
ALTER TABLE public.eventos_log ENABLE ROW LEVEL SECURITY;

-- Reset policies: authenticated admins can read; writes only via service_role (which bypasses RLS)
DROP POLICY IF EXISTS "auth acessa eventos_log" ON public.eventos_log;
DROP POLICY IF EXISTS "admins manage eventos_log" ON public.eventos_log;
DROP POLICY IF EXISTS "admins read eventos_log" ON public.eventos_log;

CREATE POLICY "admins read eventos_log" ON public.eventos_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
