-- 1) Leitura restrita a admin + owner (modelo de dono único)
DROP POLICY IF EXISTS "admins read pedido_itens" ON public.pedido_itens;
CREATE POLICY "owner admins read pedido_itens"
ON public.pedido_itens FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.eh_owner());

DROP POLICY IF EXISTS "admins read produtos" ON public.produtos;
CREATE POLICY "owner admins read produtos"
ON public.produtos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.eh_owner());

DROP POLICY IF EXISTS "admins read sync_log" ON public.sync_log;
CREATE POLICY "owner admins read sync_log"
ON public.sync_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.eh_owner());

DROP POLICY IF EXISTS "admins read eventos_log" ON public.eventos_log;
CREATE POLICY "owner admins read eventos_log"
ON public.eventos_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.eh_owner());

-- 2) Histórico de push: somente owner/admin
DROP POLICY IF EXISTS "push_envios_select_auth" ON public.push_envios;
CREATE POLICY "owner admins read push_envios"
ON public.push_envios FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.eh_owner());