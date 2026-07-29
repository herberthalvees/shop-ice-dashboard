create or replace function public.analise_margem_sku(
  p_de date,
  p_ate date
)
returns table (
  sku text,
  produto text,
  unidades bigint,
  preco_medio numeric,
  custo_unitario numeric,
  taxa_percentual numeric,
  taxa_fixa numeric,
  liquido_unitario numeric,
  lucro_unitario numeric,
  margem_pct numeric,
  preco_minimo numeric,
  situacao text
)
language sql
stable
set search_path to 'public'
as $$
  with vendas as (
    select
      pi.sku,
      max(pi.produto) as produto,
      sum(pi.quantidade)::bigint as unidades,
      case when sum(pi.quantidade) = 0 then 0
           else sum(pi.receita) / sum(pi.quantidade) end as preco_medio
    from public.pedido_itens pi
    where (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pi.status_pedido not in ('UNPAID', 'CANCELLED')
    group by pi.sku
  )
  select
    v.sku,
    v.produto,
    v.unidades,
    round(v.preco_medio, 2),
    d.custo_unitario,
    0.20::numeric,
    4.00::numeric,
    round(v.preco_medio * 0.80 - 4.00, 2),
    case when d.custo_unitario is null then null
         else round(v.preco_medio * 0.80 - 4.00 - d.custo_unitario, 2) end,
    case when d.custo_unitario is null or v.preco_medio = 0 then null
         else round(100.0 * (v.preco_medio * 0.80 - 4.00 - d.custo_unitario)
                    / v.preco_medio, 1) end,
    case when d.custo_unitario is null then null
         else round((d.custo_unitario + 4.00) / 0.80, 2) end,
    case
      when d.custo_unitario is null then 'sem custo'
      when v.preco_medio * 0.80 - 4.00 - d.custo_unitario < 0 then 'prejuizo'
      when 100.0 * (v.preco_medio * 0.80 - 4.00 - d.custo_unitario)
           / nullif(v.preco_medio, 0) < 10 then 'margem baixa'
      else 'ok'
    end
  from vendas v
  left join public.dim_produto d on d.sku = v.sku
  order by v.unidades desc;
$$;

revoke execute on function public.analise_margem_sku(date, date) from public, anon;
grant execute on function public.analise_margem_sku(date, date) to authenticated;

-- Permitir admin fazer upsert de custo em dim_produto
drop policy if exists "admins insert dim_produto" on public.dim_produto;
create policy "admins insert dim_produto" on public.dim_produto
  for insert to authenticated
  with check (has_role(auth.uid(), 'admin'::app_role));