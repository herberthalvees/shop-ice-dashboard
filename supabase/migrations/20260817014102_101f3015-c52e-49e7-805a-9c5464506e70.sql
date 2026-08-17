REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ads_campanhas FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.chat_envios FROM authenticated;
REVOKE ALL ON public.ads_campanhas FROM anon;
REVOKE ALL ON public.chat_envios FROM anon;
GRANT SELECT ON public.ads_campanhas TO authenticated;
GRANT SELECT ON public.chat_envios TO authenticated;
GRANT ALL ON public.ads_campanhas TO service_role;
GRANT ALL ON public.chat_envios TO service_role;