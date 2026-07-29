DROP POLICY IF EXISTS "authenticated read pedido_itens" ON public.pedido_itens;
CREATE POLICY "admins read pedido_itens"
  ON public.pedido_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "authenticated read dim_produto" ON public.dim_produto;
DROP POLICY IF EXISTS "authenticated update dim_produto" ON public.dim_produto;
CREATE POLICY "admins read dim_produto"
  ON public.dim_produto FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update dim_produto"
  ON public.dim_produto FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));