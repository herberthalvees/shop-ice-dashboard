CREATE OR REPLACE VIEW public.tiktok_connection_status
WITH (security_invoker = true) AS
SELECT id, shop_id, shop_name, seller_name, status, token_expires_at, refresh_expires_at, updated_at
FROM public.tiktok_connection;

REVOKE ALL ON public.tiktok_connection_status FROM PUBLIC, anon;
GRANT SELECT ON public.tiktok_connection_status TO authenticated, service_role;