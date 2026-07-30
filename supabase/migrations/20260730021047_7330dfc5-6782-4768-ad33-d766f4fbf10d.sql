-- 1) shopee_connection: tokens somente para owner
drop policy if exists "admins read shopee_connection" on public.shopee_connection;
create policy "owner read shopee_connection"
on public.shopee_connection for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role) and public.eh_owner());

-- 2) dim_produto: leitura somente owner + insert explicito
drop policy if exists "admins read dim_produto" on public.dim_produto;
create policy "owner read dim_produto"
on public.dim_produto for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role) and public.eh_owner());

drop policy if exists "admins insert dim_produto" on public.dim_produto;
create policy "admins insert dim_produto"
on public.dim_produto for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) produtos: insert explicito para admin
drop policy if exists "admins insert produtos" on public.produtos;
create policy "admins insert produtos"
on public.produtos for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) registrar_custo: exige admin + owner
create or replace function public.registrar_custo(p_item_id bigint, p_model_id bigint, p_custo numeric, p_inicio date DEFAULT NULL::date, p_observacao text DEFAULT NULL::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inicio date := coalesce(p_inicio, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) or not public.eh_owner() then
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

revoke all on function public.registrar_custo(bigint, bigint, numeric, date, text) from public, anon;
grant execute on function public.registrar_custo(bigint, bigint, numeric, date, text) to authenticated, service_role;