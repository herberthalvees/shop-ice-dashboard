-- Lock down shopee_connection: only service role
DROP POLICY IF EXISTS "auth acessa shopee_connection" ON public.shopee_connection;
REVOKE ALL ON public.shopee_connection FROM anon, authenticated;
GRANT ALL ON public.shopee_connection TO service_role;

-- Safe status view for the frontend
CREATE OR REPLACE VIEW public.shopee_connection_status
WITH (security_invoker = true) AS
SELECT id, shop_id, shop_name, status, token_expires_at, updated_at
FROM public.shopee_connection;

-- Frontend precisa ler o status; a tabela base está sem policy de select,
-- então liberamos leitura via uma policy só para a leitura vinda da view (security_invoker).
CREATE POLICY "auth le status shopee_connection"
ON public.shopee_connection
FOR SELECT
TO authenticated
USING (true);

-- Mas queremos esconder tokens do PostgREST direto. Revogamos SELECT na tabela
-- e concedemos SELECT apenas na view, mantendo a policy acima para a view resolver.
GRANT SELECT (id, shop_id, shop_name, status, token_expires_at, updated_at)
  ON public.shopee_connection TO authenticated;

REVOKE ALL ON public.shopee_connection_status FROM anon;
GRANT SELECT ON public.shopee_connection_status TO authenticated;