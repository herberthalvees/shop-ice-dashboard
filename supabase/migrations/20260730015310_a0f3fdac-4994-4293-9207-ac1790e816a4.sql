-- 1. RLS: leitura financeira só para owner

drop policy if exists "admins read pedidos" on public.pedidos;
create policy "owner read pedidos" on public.pedidos
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

drop policy if exists "admins read carteira_transacoes" on public.carteira_transacoes;
create policy "owner read carteira_transacoes" on public.carteira_transacoes
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

drop policy if exists "admins read produto_custos" on public.produto_custos;
create policy "owner read produto_custos" on public.produto_custos
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

drop policy if exists "admins read despesas_fixas" on public.despesas_fixas;
create policy "owner read despesas_fixas" on public.despesas_fixas
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

-- config tinha uma policy ALL; separa leitura (owner) das escritas (admin)
drop policy if exists "admins manage config" on public.config;
create policy "owner read config" on public.config
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());
create policy "admins insert config" on public.config
  for insert to authenticated
  with check (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());
create policy "admins update config" on public.config
  for update to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner())
  with check (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());
create policy "admins delete config" on public.config
  for delete to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) and public.eh_owner());

-- shopee_connection: mantida como está (somente admin), sem afrouxar

-- 2. Guarda eh_owner() nas funções de relatório financeiro
alter function public.dashboard_kpis_periodo(date, date) rename to dashboard_kpis_periodo_impl;
alter function public.dashboard_serie_periodo(date, date) rename to dashboard_serie_periodo_impl;
alter function public.dashboard_serie_diaria(integer) rename to dashboard_serie_diaria_impl;
alter function public.dashboard_curva_abc(date, date, integer) rename to dashboard_curva_abc_impl;
alter function public.dashboard_top_produtos(integer, integer) rename to dashboard_top_produtos_impl;
alter function public.dashboard_top_produtos_periodo(date, date, integer) rename to dashboard_top_produtos_periodo_impl;
alter function public.dashboard_kpis() rename to dashboard_kpis_impl;
alter function public.dre_mensal(integer, integer) rename to dre_mensal_impl;
alter function public.carteira_resumo(date, date) rename to carteira_resumo_impl;
alter function public.analise_margem_sku(date, date) rename to analise_margem_sku_impl;
alter function public.pedidos_detalhe(date, date, integer, integer, text, text) rename to pedidos_detalhe_impl;
alter function public.pedidos_detalhe_totais(date, date, text, text) rename to pedidos_detalhe_totais_impl;

create or replace function public.dashboard_kpis_periodo(p_de date, p_ate date)
returns table(pedidos_validos bigint, unidades bigint, faturamento numeric, ticket_medio numeric, pedidos_cancelados bigint, valor_cancelado numeric, pedidos_devolvidos bigint, valor_devolvido numeric, taxas numeric, taxas_pct numeric, custo_total numeric, custo_pct numeric, cobertura_custo numeric, imposto numeric, imposto_pct numeric, valor_liquido numeric, lucro numeric, lucro_pct numeric, lucro_medio numeric)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_periodo_impl(p_de, p_ate);
end; $$;

create or replace function public.dashboard_serie_periodo(p_de date, p_ate date)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento from public.dashboard_serie_periodo_impl(p_de, p_ate) s;
end; $$;

create or replace function public.dashboard_serie_diaria(p_dias integer)
returns table(dia date, pedidos bigint, faturamento numeric)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_serie_diaria_impl(p_dias);
end; $$;

create or replace function public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite);
end; $$;

create or replace function public.dashboard_top_produtos(p_dias integer, p_limite integer)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_impl(p_dias, p_limite);
end; $$;

create or replace function public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite);
end; $$;

create or replace function public.dashboard_kpis()
returns table(pedidos_hoje bigint, faturamento_hoje numeric, pedidos_mes bigint, faturamento_mes numeric, aguardando_envio bigint)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_kpis_impl();
end; $$;

create or replace function public.dre_mensal(p_ano integer, p_mes integer)
returns table(receita_bruta numeric, cancelamentos numeric, receita_liquida numeric, cmv numeric, cmv_pct numeric, lucro_bruto numeric, lucro_bruto_pct numeric, taxas_marketplace numeric, taxas_pct numeric, ads numeric, ads_pct numeric, despesas_fixas numeric, despesas_fixas_pct numeric, resultado_operacional numeric, resultado_operacional_pct numeric, impostos numeric, impostos_pct numeric, lucro_liquido numeric, lucro_liquido_pct numeric)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dre_mensal_impl(p_ano, p_mes);
end; $$;

create or replace function public.carteira_resumo(p_de date, p_ate date)
returns table(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.carteira_resumo_impl(p_de, p_ate);
end; $$;

create or replace function public.analise_margem_sku(p_de date, p_ate date)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.analise_margem_sku_impl(p_de, p_ate);
end; $$;

create or replace function public.pedidos_detalhe(p_de date, p_ate date, p_offset integer, p_limite integer, p_busca text, p_status text)
returns table(total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_impl(p_de, p_ate, p_offset, p_limite, p_busca, p_status);
end; $$;

create or replace function public.pedidos_detalhe_totais(p_de date, p_ate date, p_busca text, p_status text)
returns table(linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
language plpgsql stable set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_totais_impl(p_de, p_ate, p_busca, p_status);
end; $$;

revoke all on function public.dashboard_kpis_periodo(date, date) from public, anon;
revoke all on function public.dashboard_serie_periodo(date, date) from public, anon;
revoke all on function public.dashboard_serie_diaria(integer) from public, anon;
revoke all on function public.dashboard_curva_abc(date, date, integer) from public, anon;
revoke all on function public.dashboard_top_produtos(integer, integer) from public, anon;
revoke all on function public.dashboard_top_produtos_periodo(date, date, integer) from public, anon;
revoke all on function public.dashboard_kpis() from public, anon;
revoke all on function public.dre_mensal(integer, integer) from public, anon;
revoke all on function public.carteira_resumo(date, date) from public, anon;
revoke all on function public.analise_margem_sku(date, date) from public, anon;
revoke all on function public.pedidos_detalhe(date, date, integer, integer, text, text) from public, anon;
revoke all on function public.pedidos_detalhe_totais(date, date, text, text) from public, anon;

grant execute on function public.dashboard_kpis_periodo(date, date) to authenticated;
grant execute on function public.dashboard_serie_periodo(date, date) to authenticated;
grant execute on function public.dashboard_serie_diaria(integer) to authenticated;
grant execute on function public.dashboard_curva_abc(date, date, integer) to authenticated;
grant execute on function public.dashboard_top_produtos(integer, integer) to authenticated;
grant execute on function public.dashboard_top_produtos_periodo(date, date, integer) to authenticated;
grant execute on function public.dashboard_kpis() to authenticated;
grant execute on function public.dre_mensal(integer, integer) to authenticated;
grant execute on function public.carteira_resumo(date, date) to authenticated;
grant execute on function public.analise_margem_sku(date, date) to authenticated;
grant execute on function public.pedidos_detalhe(date, date, integer, integer, text, text) to authenticated;
grant execute on function public.pedidos_detalhe_totais(date, date, text, text) to authenticated;