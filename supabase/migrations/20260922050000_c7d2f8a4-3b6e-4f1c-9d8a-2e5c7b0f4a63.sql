-- ============================================================
-- Corrige "permission denied for function ..._impl" em 4 wrappers
-- do dashboard: dashboard_serie_periodo, dashboard_top_produtos_periodo
-- e dashboard_curva_abc chamam a própria _impl sem SECURITY DEFINER,
-- mas a _impl teve EXECUTE revogado de authenticated — a chamada
-- interna falha porque roda com o papel de quem chamou (authenticated),
-- que não tem permissão na _impl. O padrão correto (usado em
-- dashboard_kpis_periodo, dashboard_serie_horaria etc.) é o wrapper
-- rodar como SECURITY DEFINER.
-- ============================================================

create or replace function public.dashboard_serie_periodo(p_de date, p_ate date, p_loja_id bigint default null)
returns table(periodo date, rotulo text, pedidos bigint, faturamento numeric, parcial boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.periodo, s.rotulo, s.pedidos, s.faturamento, s.parcial
    from public.dashboard_serie_periodo_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

create or replace function public.dashboard_top_produtos_periodo(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, quantidade bigint, receita numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_top_produtos_periodo_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

create or replace function public.dashboard_curva_abc(p_de date, p_ate date, p_limite integer, p_loja_id bigint default null)
returns table(produto text, sku text, unidades bigint, receita numeric, participacao numeric, acumulado numeric, classe text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.dashboard_curva_abc_impl(p_de, p_ate, p_limite, p_loja_id);
end; $function$;

create or replace function public.dashboard_serie_horaria(p_de date, p_ate date, p_loja_id bigint default null)
returns table(hora smallint, rotulo text, pedidos bigint, faturamento numeric, ads_investimento numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select s.hora, s.rotulo, s.pedidos, s.faturamento, s.ads_investimento
    from public.dashboard_serie_horaria_impl(p_de, p_ate, p_loja_id) s;
end; $function$;

-- O mesmo problema existia em analise_margem_sku, pedidos_detalhe e
-- pedidos_detalhe_totais: o original tinha SECURITY DEFINER aplicado
-- via ALTER FUNCTION numa migração posterior à que eu usei como base
-- pra recriar o corpo, e essa marcação se perdeu na reescrita.
create or replace function public.analise_margem_sku(p_de date, p_ate date, p_loja_id bigint default null)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.analise_margem_sku_impl(p_de, p_ate, p_loja_id);
end; $$;

create or replace function public.pedidos_detalhe(
  p_de date, p_ate date, p_offset integer, p_limite integer, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (total_linhas bigint, order_sn text, data_pedido timestamp with time zone, status text, produto text, sku text, imagem_url text, quantidade integer, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, margem_pct numeric, comprador text, tem_escrow boolean)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_impl(p_de, p_ate, p_offset, p_limite, p_busca, p_status, p_loja_id);
end; $$;

create or replace function public.pedidos_detalhe_totais(
  p_de date, p_ate date, p_busca text, p_status text, p_loja_id bigint default null
)
returns table (linhas bigint, valor numeric, tarifa numeric, frete_vendedor numeric, custo numeric, imposto numeric, lucro numeric, linhas_estimadas bigint)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.eh_owner() then raise exception 'acesso negado'; end if;
  return query select * from public.pedidos_detalhe_totais_impl(p_de, p_ate, p_busca, p_status, p_loja_id);
end; $$;
