REVOKE ALL ON FUNCTION public.estoque_listar() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.estoque_movimentar(uuid, numeric, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.estoque_baixar_venda() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.estoque_devolver_cancelamento() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.estoque_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.estoque_movimentar(uuid, numeric, text, text) TO authenticated;