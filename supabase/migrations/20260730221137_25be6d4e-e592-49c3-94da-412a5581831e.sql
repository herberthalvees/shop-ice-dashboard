REVOKE ALL ON TABLE public.shopee_connection FROM authenticated;
GRANT SELECT (id, app_tipo, partner_id, shop_id, shop_name, token_expires_at, status, updated_at) ON TABLE public.shopee_connection TO authenticated;
GRANT SELECT ON TABLE public.shopee_connection_status TO authenticated;
GRANT ALL ON TABLE public.shopee_connection TO service_role;
GRANT SELECT ON TABLE public.shopee_connection_status TO service_role;