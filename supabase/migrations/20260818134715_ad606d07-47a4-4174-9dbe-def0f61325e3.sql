CREATE INDEX IF NOT EXISTS pedidos_comprador_lower_idx ON public.pedidos (lower(comprador_username));
CREATE INDEX IF NOT EXISTS avaliacoes_order_sn_idx ON public.avaliacoes (order_sn);
CREATE INDEX IF NOT EXISTS pv_envios_manuais_to_id_idx ON public.pv_envios_manuais (to_id) WHERE ok;

CREATE OR REPLACE FUNCTION public.pv_contatos_lista(
  _busca text DEFAULT NULL,
  _janela_dias integer DEFAULT 30,
  _limite integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res jsonb;
  _total bigint;
  _janela interval := (greatest(coalesce(_janela_dias, 30), 0)::text || ' days')::interval;
BEGIN
  IF NOT public.eh_owner() THEN RAISE EXCEPTION 'acesso negado'; END IF;

  SELECT count(*)::bigint INTO _total
  FROM public.pv_contatos c
  WHERE _busca IS NULL OR _busca = ''
    OR coalesce(c.comprador_username, '') ILIKE '%' || _busca || '%'
    OR coalesce(c.nome, '') ILIKE '%' || _busca || '%';

  WITH base AS (
    SELECT
      c.to_id,
      c.conversation_id,
      lower(coalesce(c.comprador_username, c.nome, '')) AS chave,
      coalesce(c.comprador_username, c.nome) AS comprador,
      c.ultima_em
    FROM public.pv_contatos c
    WHERE _busca IS NULL OR _busca = ''
      OR coalesce(c.comprador_username, '') ILIKE '%' || _busca || '%'
      OR coalesce(c.nome, '') ILIKE '%' || _busca || '%'
  ), ped AS (
    SELECT
      lower(pp.comprador_username) AS chave,
      count(*)::bigint AS pedidos,
      sum(coalesce(pp.valor_total, 0)) AS total_gasto,
      max(pp.data_criacao_pedido) AS ultimo_pedido_em,
      (array_agg(pp.valor_total ORDER BY pp.data_criacao_pedido DESC NULLS LAST))[1] AS ultimo_ticket,
      (array_agg(pp.order_sn ORDER BY pp.data_criacao_pedido DESC NULLS LAST))[1] AS ultimo_order_sn
    FROM public.pedidos pp
    JOIN base b ON b.chave = lower(pp.comprador_username)
    WHERE pp.comprador_username IS NOT NULL
      AND pp.status NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
    GROUP BY 1
  ), aval AS (
    SELECT
      lower(coalesce(p3.comprador_username, '')) AS chave,
      round(avg(a.rating)::numeric, 1) AS nota_media,
      count(*)::bigint AS avaliacoes
    FROM public.avaliacoes a
    JOIN public.pedidos p3 ON p3.order_sn = a.order_sn
    JOIN base b ON b.chave = lower(coalesce(p3.comprador_username, ''))
    WHERE a.rating IS NOT NULL
    GROUP BY 1
  ), contatos_camp AS (
    SELECT lower(coalesce(en.comprador, '')) AS chave, max(en.enviado_em) AS em
    FROM public.pv_envios en
    WHERE en.status = 'enviado'
    GROUP BY 1
  ), contatos_man AS (
    SELECT m.to_id, lower(coalesce(m.comprador, '')) AS chave, m.created_at AS em
    FROM public.pv_envios_manuais m
    WHERE m.ok
  ), pagina AS (
    SELECT
      b.to_id,
      b.conversation_id,
      b.chave,
      b.comprador,
      b.ultima_em,
      coalesce(p.pedidos, 0) AS pedidos,
      coalesce(p.total_gasto, 0) AS total_gasto,
      p.ultimo_pedido_em,
      p.ultimo_ticket,
      p.ultimo_order_sn,
      av.nota_media,
      coalesce(av.avaliacoes, 0) AS avaliacoes,
      greatest(
        (SELECT cc.em FROM contatos_camp cc WHERE cc.chave = b.chave),
        (SELECT max(cm.em) FROM contatos_man cm WHERE cm.to_id = b.to_id OR (b.chave <> '' AND cm.chave = b.chave))
      ) AS ultimo_contato_em,
      EXISTS (SELECT 1 FROM public.pv_optout o WHERE lower(o.comprador_username) = b.chave) AS optout
    FROM base b
    LEFT JOIN ped p ON p.chave = b.chave
    LEFT JOIN aval av ON av.chave = b.chave
    ORDER BY coalesce(p.total_gasto, 0) DESC NULLS LAST, b.ultima_em DESC NULLS LAST
    LIMIT greatest(coalesce(_limite, 50), 1)
    OFFSET greatest(coalesce(_offset, 0), 0)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(sub) ORDER BY sub.ord), '[]'::jsonb)
  INTO _res
  FROM (
    SELECT
      row_number() OVER (ORDER BY g.total_gasto DESC NULLS LAST, g.ultima_em DESC NULLS LAST) AS ord,
      g.to_id,
      g.conversation_id,
      g.comprador,
      g.ultima_em,
      g.pedidos,
      g.total_gasto,
      g.ultimo_pedido_em,
      g.ultimo_ticket,
      (SELECT i.produto FROM public.pedido_itens i
        WHERE i.order_sn = g.ultimo_order_sn
        ORDER BY i.receita DESC NULLS LAST LIMIT 1) AS ultimo_produto,
      g.nota_media,
      g.avaliacoes,
      g.ultimo_contato_em,
      g.optout,
      (g.optout OR (g.ultimo_contato_em IS NOT NULL AND g.ultimo_contato_em > now() - _janela)) AS bloqueado
    FROM pagina g
  ) sub;

  RETURN jsonb_build_object('total', _total, 'itens', coalesce(_res, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.pv_contatos_lista(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pv_contatos_lista(text, integer, integer, integer) TO authenticated, service_role;