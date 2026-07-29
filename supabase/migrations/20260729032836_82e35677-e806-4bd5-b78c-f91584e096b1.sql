
-- 1) Restrict pedidos SELECT to admins only
DROP POLICY IF EXISTS "authenticated read pedidos" ON public.pedidos;
CREATE POLICY "admins read pedidos"
ON public.pedidos
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Restrict sync_log SELECT to admins only
DROP POLICY IF EXISTS "authenticated read sync_log" ON public.sync_log;
CREATE POLICY "admins read sync_log"
ON public.sync_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Restrict user_roles writes to admins only (SELECT own already exists)
DROP POLICY IF EXISTS "admins insert user_roles" ON public.user_roles;
CREATE POLICY "admins insert user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admins update user_roles" ON public.user_roles;
CREATE POLICY "admins update user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admins delete user_roles" ON public.user_roles;
CREATE POLICY "admins delete user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Revoke execute on SECURITY DEFINER functions from public/anon/authenticated
-- Trigger functions don't need caller EXECUTE
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_first_user_admin() FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies; policy expressions evaluate under the
-- calling role, so authenticated must retain EXECUTE. Revoke from public/anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
