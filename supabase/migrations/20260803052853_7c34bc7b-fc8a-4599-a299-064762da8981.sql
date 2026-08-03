REVOKE EXECUTE ON FUNCTION public.dashboard_serie_horaria(date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_serie_horaria(date, date) TO authenticated, service_role;