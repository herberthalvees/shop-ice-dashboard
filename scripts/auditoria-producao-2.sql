-- ============================================================
-- AUDITORIA DE PRODUÇÃO #2 — SOMENTE LEITURA, NÃO ALTERA NADA.
-- Pega o código-fonte real das funções que têm um parâmetro
-- "p_marketplace" que não existe em nenhuma migração rastreada no
-- git (drift não documentado) — preciso disso pra não perder essa
-- lógica ao adicionar o filtro de loja. Também confere se
-- shopee_connection.app_tipo tem um índice único (não aparece como
-- "constraint" na auditoria anterior, pode ser um índice solto).
-- ============================================================

select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) as definicao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'dashboard_kpis_periodo', 'dashboard_kpis_periodo_impl',
    'dashboard_curva_abc', 'dashboard_curva_abc_impl',
    'dashboard_serie_periodo', 'dashboard_serie_periodo_impl',
    'dashboard_top_produtos_periodo', 'dashboard_top_produtos_periodo_impl',
    'dashboard_serie_horaria', 'dashboard_serie_horaria_impl',
    'pedidos_detalhe', 'pedidos_detalhe_impl',
    'pedidos_detalhe_totais', 'pedidos_detalhe_totais_impl',
    'produtos_com_giro'
  )

union all

select
  'INDICE_shopee_connection' as funcao,
  indexdef as argumentos,
  null as definicao
from pg_indexes
where schemaname = 'public' and tablename = 'shopee_connection'

order by 1;
