-- ============================================================
-- AUDITORIA DE PRODUÇÃO — SOMENTE LEITURA, NÃO ALTERA NADA.
-- Roda isso no SQL Editor do projeto de PRODUÇÃO (o do Lovable) e
-- me manda o resultado completo (é uma tabela só, com uma linha por
-- seção — pode copiar tudo).
-- ============================================================

with

migracoes_aplicadas as (
  select jsonb_build_object(
    'total', count(*),
    'mais_recentes', coalesce((
      select jsonb_agg(version order by version desc)
      from (select version from supabase_migrations.schema_migrations order by version desc limit 15) x
    ), '[]'::jsonb)
  ) as v
  from supabase_migrations.schema_migrations
),

tabelas_multiloja as (
  select jsonb_build_object(
    'tabela_lojas_existe', exists(select 1 from information_schema.tables where table_schema='public' and table_name='lojas'),
    'shopee_connection_tem_loja_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='shopee_connection' and column_name='loja_id'),
    'pedidos_tem_loja_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='pedidos' and column_name='loja_id'),
    'produtos_tem_loja_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='produtos' and column_name='loja_id'),
    'pedido_itens_tem_loja_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='pedido_itens' and column_name='loja_id'),
    'pv_contatos_tem_loja_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='pv_contatos' and column_name='loja_id')
  ) as v
),

constraints_unicas as (
  select jsonb_build_object(
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', conname, 'colunas', cols))
      from (
        select c.conname,
          (select string_agg(a.attname, ',' order by k.ord)
           from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
          ) as cols
        from pg_constraint c
        where c.conrelid = 'public.pedidos'::regclass and c.contype = 'u'
      ) c(conname, cols)
    ), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', conname, 'colunas', cols))
      from (
        select c.conname,
          (select string_agg(a.attname, ',' order by k.ord)
           from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
          ) as cols
        from pg_constraint c
        where c.conrelid = 'public.produtos'::regclass and c.contype = 'u'
      ) c(conname, cols)
    ), '[]'::jsonb),
    'shopee_connection', coalesce((
      select jsonb_agg(jsonb_build_object('nome', conname, 'colunas', cols))
      from (
        select c.conname,
          (select string_agg(a.attname, ',' order by k.ord)
           from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
          ) as cols
        from pg_constraint c
        where c.conrelid = 'public.shopee_connection'::regclass and c.contype in ('u','p')
      ) c(conname, cols)
    ), '[]'::jsonb)
  ) as v
),

funcoes as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', p.proname,
    'argumentos', pg_get_function_identity_arguments(p.oid),
    'security_definer', p.prosecdef
  ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb) as v
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'eh_owner', 'eh_owner_ou_service_role',
      'dashboard_kpis_periodo', 'dashboard_kpis_periodo_impl',
      'dashboard_kpis_parcial', 'dashboard_kpis_parcial_impl',
      'dashboard_serie_periodo', 'dashboard_serie_periodo_impl',
      'dashboard_top_produtos_periodo', 'dashboard_top_produtos_periodo_impl',
      'dashboard_curva_abc', 'dashboard_curva_abc_impl',
      'dashboard_serie_horaria', 'dashboard_serie_horaria_impl',
      'pedidos_em_transito', 'pedidos_em_transito_impl',
      'produtos_com_giro', 'produtos_com_giro_impl',
      'produtos_com_ads',
      'analise_margem_sku', 'analise_margem_sku_impl',
      'carteira_resumo', 'carteira_resumo_impl',
      'ads_resumo', 'ads_totais_periodo',
      'pedidos_detalhe', 'pedidos_detalhe_impl',
      'pedidos_detalhe_totais', 'pedidos_detalhe_totais_impl',
      'dre_mensal', 'dre_variaveis_detalhe', 'contar_pedidos_periodo',
      'registrar_custo', 'aplicar_produtos', 'aplicar_ads', 'aplicar_carteira',
      'aplicar_escrow', 'pedidos_escrow_pendentes'
    )
),

view_custeado as (
  select coalesce(jsonb_agg(column_name order by ordinal_position), '[]'::jsonb) as v
  from information_schema.columns
  where table_schema = 'public' and table_name = 'pedido_itens_custeado'
),

cron_jobs as (
  select coalesce(jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule) order by jobname), '[]'::jsonb) as v
  from cron.job
),

contagens as (
  select jsonb_build_object(
    'pedidos', (select count(*) from public.pedidos),
    'produtos', (select count(*) from public.produtos),
    'shopee_connection', (select count(*) from public.shopee_connection)
    -- contagem de "lojas" fica de fora daqui de propósito: referenciar a
    -- tabela direto quebra a query inteira se ela ainda não existir (é
    -- exatamente esse o caso hoje). A seção "tabelas_multiloja" já informa
    -- se a tabela existe ou não.
  ) as v
)

select 'migracoes_aplicadas' as secao, v from migracoes_aplicadas
union all
select 'tabelas_multiloja', v from tabelas_multiloja
union all
select 'constraints_unicas', v from constraints_unicas
union all
select 'funcoes', v from funcoes
union all
select 'view_pedido_itens_custeado_colunas', v from view_custeado
union all
select 'cron_jobs', v from cron_jobs
union all
select 'contagens', v from contagens;
