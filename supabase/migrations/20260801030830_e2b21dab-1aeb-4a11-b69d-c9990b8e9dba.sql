-- 1. Revoke direct execute on internal / unused SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.eh_owner_ou_service_role() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_periodo(date, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.dashboard_serie_diaria(integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.dashboard_top_produtos(integer, integer) FROM anon, authenticated, public;

-- 2. alertas_enviados: explicit admin-only writes (backend keeps using service_role)
DROP POLICY IF EXISTS "admins insert alertas_enviados" ON public.alertas_enviados;
DROP POLICY IF EXISTS "admins update alertas_enviados" ON public.alertas_enviados;
DROP POLICY IF EXISTS "admins delete alertas_enviados" ON public.alertas_enviados;
CREATE POLICY "admins insert alertas_enviados" ON public.alertas_enviados FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update alertas_enviados" ON public.alertas_enviados FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete alertas_enviados" ON public.alertas_enviados FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. dim_produto: explicit admin-only delete
DROP POLICY IF EXISTS "admins delete dim_produto" ON public.dim_produto;
CREATE POLICY "admins delete dim_produto" ON public.dim_produto FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. usuarios_papeis: explicit admin-only writes (blocks privilege escalation)
DROP POLICY IF EXISTS "admins insert usuarios_papeis" ON public.usuarios_papeis;
DROP POLICY IF EXISTS "admins update usuarios_papeis" ON public.usuarios_papeis;
DROP POLICY IF EXISTS "admins delete usuarios_papeis" ON public.usuarios_papeis;
CREATE POLICY "admins insert usuarios_papeis" ON public.usuarios_papeis FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update usuarios_papeis" ON public.usuarios_papeis FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete usuarios_papeis" ON public.usuarios_papeis FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));