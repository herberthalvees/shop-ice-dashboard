-- Índices para os filtros por data no fuso de São Paulo
CREATE INDEX IF NOT EXISTS idx_pedidos_data_sp
  ON public.pedidos ((( data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date));
CREATE INDEX IF NOT EXISTS idx_pedidos_data_sp_status
  ON public.pedidos ((( data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date), status);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_data_sp
  ON public.pedido_itens ((( data_criacao_pedido AT TIME ZONE 'America/Sao_Paulo')::date));

-- Wrappers passam a rodar como definer (a checagem eh_owner() continua dentro deles)
ALTER FUNCTION public.dashboard_kpis_periodo(date,date) SECURITY DEFINER;
ALTER FUNCTION public.dashboard_serie_periodo(date,date) SECURITY DEFINER;
ALTER FUNCTION public.dashboard_curva_abc(date,date,integer) SECURITY DEFINER;
ALTER FUNCTION public.dashboard_top_produtos_periodo(date,date,integer) SECURITY DEFINER;
ALTER FUNCTION public.dashboard_kpis() SECURITY DEFINER;
ALTER FUNCTION public.dashboard_serie_diaria(integer) SECURITY DEFINER;
ALTER FUNCTION public.dashboard_top_produtos(integer,integer) SECURITY DEFINER;
ALTER FUNCTION public.analise_margem_sku(date,date) SECURITY DEFINER;
ALTER FUNCTION public.carteira_resumo(date,date) SECURITY DEFINER;
ALTER FUNCTION public.dre_mensal(integer,integer) SECURITY DEFINER;
ALTER FUNCTION public.pedidos_detalhe(date,date,integer,integer,text,text) SECURITY DEFINER;
ALTER FUNCTION public.pedidos_detalhe_totais(date,date,text,text) SECURITY DEFINER;

-- produtos_com_giro: exige owner e roda como definer
CREATE OR REPLACE FUNCTION public.produtos_com_giro_impl(p_de date, p_ate date)
RETURNS TABLE(item_id bigint, model_id bigint, sku text, produto text, variacao text, preco_atual numeric, estoque_disponivel integer, vendidos_periodo bigint, media_diaria numeric, dias_de_estoque numeric, status_item text, imagem_url text)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ select * from public.produtos_com_giro(p_de, p_ate) $$;

-- Funções internas não são mais chamáveis diretamente pelo cliente
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_periodo_impl(date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_serie_periodo_impl(date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_curva_abc_impl(date,date,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_top_produtos_periodo_impl(date,date,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_impl() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_serie_diaria_impl(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dashboard_top_produtos_impl(integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analise_margem_sku_impl(date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.carteira_resumo_impl(date,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dre_mensal_impl(integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedidos_detalhe_impl(date,date,integer,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pedidos_detalhe_totais_impl(date,date,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.produtos_com_giro_impl(date,date) FROM PUBLIC, anon, authenticated;

ANALYZE public.pedidos;
ANALYZE public.pedido_itens;