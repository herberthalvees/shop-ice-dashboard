
REVOKE EXECUTE ON FUNCTION public.resumo_horarios_aplicar() FROM authenticated;
REVOKE ALL ON FUNCTION public.resumo_horarios_sincronizar() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resumo_horarios_sincronizar() TO service_role;
