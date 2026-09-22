-- ============================================================
-- Custo compartilhado entre lojas por SKU: quando um item de uma
-- loja secundária não tem custo próprio cadastrado, mas o mesmo SKU
-- já tem custo vigente na loja principal (menor id ativo), usa esse
-- valor. Nunca sobrescreve um custo já cadastrado especificamente
-- para a própria loja/item.
-- ============================================================

create or replace view public.pedido_itens_custeado
with (security_invoker = on) as
select
  pi.id, pi.order_sn, pi.item_id, pi.model_id, pi.produto, pi.sku,
  pi.quantidade, pi.preco_unitario, pi.receita, pi.status_pedido,
  pi.data_criacao_pedido, pi.created_at,
  coalesce(c.custo_unitario, cf.custo_unitario) as custo_vigente,
  pi.quantidade::numeric * coalesce(c.custo_unitario, cf.custo_unitario) as custo_total,
  pi.marketplace,
  pi.loja_id
from public.pedido_itens pi
left join lateral (
  select pc.custo_unitario
  from public.produto_custos pc
  where pc.item_id = pi.item_id
    and pc.model_id = pi.model_id
    and pc.vigencia_inicio <= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
    and coalesce(pc.vigencia_fim, '9999-12-31'::date) >= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
  order by pc.vigencia_inicio desc
  limit 1
) c on true
left join lateral (
  select pc2.custo_unitario
  from public.produtos pp
  join public.produto_custos pc2
    on pc2.item_id = pp.item_id and pc2.model_id = pp.model_id
  where c.custo_unitario is null
    and nullif(pi.sku, '') is not null
    and pp.sku = pi.sku
    and pp.loja_id = (select min(id) from public.lojas where status = 'ativa')
    and pc2.vigencia_inicio <= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
    and coalesce(pc2.vigencia_fim, '9999-12-31'::date) >= (pi.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
  order by pc2.vigencia_inicio desc
  limit 1
) cf on true;

grant select on public.pedido_itens_custeado to authenticated;

-- analise_margem_sku_impl faz seu próprio lookup de "custo atual"
-- (fora da view acima) — ganha o mesmo fallback. O nome já é
-- "_impl" porque a função pública analise_margem_sku(date,date) foi
-- renomeada para isto num migration anterior e virou um wrapper fino
-- que só checa eh_owner() e delega pra cá; não tocamos no wrapper.
create or replace function public.analise_margem_sku_impl(p_de date, p_ate date)
returns table(item_id bigint, model_id bigint, sku text, produto text, unidades bigint, preco_medio numeric, custo_periodo numeric, custo_atual numeric, liquido_unitario numeric, lucro_unitario numeric, margem_pct numeric, preco_minimo numeric, roas_minimo numeric, situacao text)
language sql stable set search_path to 'public'
as $function$
  with vendas as (
    select
      pic.item_id,
      pic.model_id,
      sum(pic.quantidade)::bigint as unidades,
      case when sum(pic.quantidade) = 0 then null
           else sum(pic.receita) / sum(pic.quantidade) end as preco_vendido,
      case when sum(pic.quantidade) filter (where pic.custo_vigente is not null) = 0
           then null
           else sum(pic.custo_total) filter (where pic.custo_vigente is not null)
                / sum(pic.quantidade) filter (where pic.custo_vigente is not null)
      end as custo_medio
    from public.pedido_itens_custeado pic
    where (pic.data_criacao_pedido at time zone 'America/Sao_Paulo')::date
          between p_de and p_ate
      and pic.status_pedido not in ('UNPAID', 'CANCELLED', 'TO_RETURN')
    group by pic.item_id, pic.model_id
  ),
  calc as (
    select
      p.item_id,
      p.model_id,
      p.sku,
      coalesce(p.produto, '') || case
        when nullif(p.variacao, '') is null then ''
        else ' - ' || p.variacao
      end as produto,
      coalesce(v.unidades, 0)::bigint as unidades,
      coalesce(v.preco_vendido, p.preco_atual) as preco_medio,
      v.custo_medio,
      coalesce(atual.custo_unitario, atual_fallback.custo_unitario) as custo_atual
    from public.produtos p
    left join vendas v
      on v.item_id = p.item_id and v.model_id = p.model_id
    left join lateral (
      select pc.custo_unitario
      from public.produto_custos pc
      where pc.item_id = p.item_id
        and pc.model_id = p.model_id
        and pc.vigencia_fim is null
      order by pc.vigencia_inicio desc
      limit 1
    ) atual on true
    left join lateral (
      select pc2.custo_unitario
      from public.produtos pp
      join public.produto_custos pc2
        on pc2.item_id = pp.item_id and pc2.model_id = pp.model_id
      where atual.custo_unitario is null
        and nullif(p.sku, '') is not null
        and pp.sku = p.sku
        and pp.loja_id = (select min(id) from public.lojas where status = 'ativa')
        and pc2.vigencia_fim is null
      order by pc2.vigencia_inicio desc
      limit 1
    ) atual_fallback on true
  ),
  fim as (
    select c.*,
           coalesce(c.custo_medio, c.custo_atual) as custo_periodo,
           c.preco_medio * 0.80 - 4.00 as liquido_un
    from calc c
  )
  select
    f.item_id, f.model_id, f.sku, f.produto, f.unidades,
    round(f.preco_medio, 2),
    round(f.custo_periodo, 4),
    round(f.custo_atual, 4),
    round(f.liquido_un, 2),
    case when f.custo_periodo is null then null
         else round(f.liquido_un - f.custo_periodo, 2) end,
    case when f.custo_periodo is null or coalesce(f.preco_medio, 0) = 0 then null
         else round(100.0 * (f.liquido_un - f.custo_periodo) / f.preco_medio, 1) end,
    case when f.custo_atual is null then null
         else round((f.custo_atual + 4.00) / 0.80, 2) end,
    case when f.custo_atual is null
           or (f.liquido_un - f.custo_atual) <= 0 then null
         else round(f.preco_medio / (f.liquido_un - f.custo_atual), 2) end,
    case
      when f.custo_periodo is null then 'sem custo'
      when f.liquido_un - f.custo_periodo < 0 then 'prejuizo'
      when 100.0 * (f.liquido_un - f.custo_periodo)
           / nullif(f.preco_medio, 0) < 10 then 'margem baixa'
      else 'ok'
    end
  from fim f
  order by f.unidades desc, f.produto;
$function$;
