-- 1. View: usar security_invoker
ALTER VIEW public.shopee_connection_status SET (security_invoker = on);
GRANT SELECT ON public.shopee_connection_status TO authenticated;
GRANT ALL ON public.shopee_connection_status TO service_role;

-- 2. Funções SECURITY DEFINER internas: apenas service_role
REVOKE ALL ON FUNCTION public.aplicar_carteira(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_escrow(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aplicar_produtos(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_carteira(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_escrow(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_produtos(jsonb) TO service_role;

-- 3. carteira_resumo passa a SECURITY INVOKER (RLS de admin se aplica)
CREATE OR REPLACE FUNCTION public.carteira_resumo(p_de date, p_ate date)
RETURNS TABLE(saldo_atual numeric, saldo_em timestamp with time zone, entradas numeric, saidas numeric, saques numeric, em_transito numeric, pedidos_em_transito bigint)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  with ultimo as (
    select saldo_apos, data_transacao
    from public.carteira_transacoes
    order by data_transacao desc, transaction_id desc
    limit 1
  ),
  periodo as (
    select
      coalesce(sum(valor) filter (where fluxo = 'MONEY_IN'), 0) as ent,
      coalesce(sum(abs(valor)) filter (where fluxo = 'MONEY_OUT'), 0) as sai,
      coalesce(sum(abs(valor)) filter (
        where withdrawal_id is not null and withdrawal_id > 0), 0) as saq
    from public.carteira_transacoes
    where (data_transacao at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
  ),
  transito as (
    select
      coalesce(sum(p.valor_liquido), 0) as valor,
      count(*)::bigint as qtd
    from public.pedidos p
    where p.valor_liquido is not null
      and p.status not in ('UNPAID', 'CANCELLED')
      and not exists (
        select 1 from public.carteira_transacoes c
        where c.order_sn = p.order_sn and c.fluxo = 'MONEY_IN'
      )
  )
  select
    (select saldo_apos from ultimo),
    (select data_transacao from ultimo),
    (select ent from periodo),
    (select sai from periodo),
    (select saq from periodo),
    (select valor from transito),
    (select qtd from transito);
$function$;
REVOKE ALL ON FUNCTION public.carteira_resumo(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_resumo(date, date) TO authenticated, service_role;

-- 4. registrar_custo: exige admin dentro da função
CREATE OR REPLACE FUNCTION public.registrar_custo(p_item_id bigint, p_model_id bigint, p_custo numeric, p_inicio date DEFAULT NULL::date, p_observacao text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_inicio date := coalesce(p_inicio, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'acesso negado';
  end if;

  if p_custo is null or p_custo < 0 then
    raise exception 'custo inválido';
  end if;

  update public.produto_custos
     set vigencia_fim = v_inicio - 1
   where item_id = p_item_id
     and model_id = p_model_id
     and vigencia_fim is null
     and vigencia_inicio < v_inicio;

  delete from public.produto_custos
   where item_id = p_item_id
     and model_id = p_model_id
     and vigencia_inicio = v_inicio;

  insert into public.produto_custos (item_id, model_id, custo_unitario, vigencia_inicio, observacao)
  values (p_item_id, p_model_id, p_custo, v_inicio, p_observacao);
end;
$function$;
REVOKE ALL ON FUNCTION public.registrar_custo(bigint, bigint, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_custo(bigint, bigint, numeric, date, text) TO authenticated, service_role;

-- 5. Políticas explícitas de escrita restritas a admin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos','pedido_itens','produtos','produto_custos','carteira_transacoes','eventos_log','sync_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admins insert '||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admins update '||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admins delete '||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))', 'admins insert '||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))', 'admins update '||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role))', 'admins delete '||t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;