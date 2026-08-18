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

  WITH base AS (
    SELECT
      c.to_id,
      c.conversation_id,
      coalesce(c.comprador_username, c.nome) AS comprador,
      c.ultima_em
    FROM public.pv_contatos c
    WHERE _busca IS NULL OR _busca = ''
      OR coalesce(c.comprador_username, '') ILIKE '%' || _busca || '%'
      OR coalesce(c.nome, '') ILIKE '%' || _busca || '%'
  ), agg AS (
    SELECT
      b.*,
      p.pedidos,
      p.total_gasto,
      p.ultimo_pedido_em,
      p.ultimo_ticket,
      p.ultimo_produto,
      av.nota_media,
      av.avaliacoes,
      ult.ultimo_contato_em,
      EXISTS (SELECT 1 FROM public.pv_optout o WHERE lower(o.comprador_username) = lower(coalesce(b.comprador, ''))) AS optout
    FROM base b
    LEFT JOIN LATERAL (
      SELECT
        count(*)::bigint AS pedidos,
        sum(coalesce(pp.valor_total, 0)) AS total_gasto,
        max(pp.data_criacao_pedido) AS ultimo_pedido_em,
        (array_agg(pp.valor_total ORDER BY pp.data_criacao_pedido DESC NULLS LAST))[1] AS ultimo_ticket,
        (SELECT i.produto FROM public.pedido_itens i
          WHERE i.order_sn = (array_agg(pp.order_sn ORDER BY pp.data_criacao_pedido DESC NULLS LAST))[1]
          ORDER BY i.receita DESC NULLS LAST LIMIT 1) AS ultimo_produto
      FROM public.pedidos pp
      WHERE pp.comprador_username IS NOT NULL
        AND lower(pp.comprador_username) = lower(coalesce(b.comprador, ''))
        AND pp.status NOT IN ('UNPAID', 'CANCELLED', 'TO_RETURN')
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT round(avg(a.rating)::numeric, 1) AS nota_media, count(*)::bigint AS avaliacoes
      FROM public.avaliacoes a
      JOIN public.pedidos p3 ON p3.order_sn = a.order_sn
      WHERE lower(coalesce(p3.comprador_username, '')) = lower(coalesce(b.comprador, ''))
        AND a.rating IS NOT NULL
    ) av ON true
    LEFT JOIN LATERAL (
      SELECT max(x.em) AS ultimo_contato_em FROM (
        SELECT en.enviado_em AS em FROM public.pv_envios en
          WHERE en.status = 'enviado' AND lower(coalesce(en.comprador, '')) = lower(coalesce(b.comprador, ''))
        UNION ALL
        SELECT m.created_at FROM public.pv_envios_manuais m
          WHERE m.ok AND (m.to_id = b.to_id OR lower(coalesce(m.comprador, '')) = lower(coalesce(b.comprador, '')))
      ) x
    ) ult ON true
  )
  SELECT coalesce(jsonb_agg(to_jsonb(sub) ORDER BY sub.ord), '[]'::jsonb)
  INTO _res
  FROM (
    SELECT
      row_number() OVER (ORDER BY coalesce(a.total_gasto, 0) DESC NULLS LAST, a.ultima_em DESC NULLS LAST) AS ord,
      a.to_id,
      a.conversation_id,
      a.comprador,
      a.ultima_em,
      coalesce(a.pedidos, 0) AS pedidos,
      coalesce(a.total_gasto, 0) AS total_gasto,
      a.ultimo_pedido_em,
      a.ultimo_ticket,
      a.ultimo_produto,
      a.nota_media,
      coalesce(a.avaliacoes, 0) AS avaliacoes,
      a.ultimo_contato_em,
      a.optout,
      (a.optout OR (a.ultimo_contato_em IS NOT NULL AND a.ultimo_contato_em > now() - _janela)) AS bloqueado
    FROM agg a
    ORDER BY coalesce(a.total_gasto, 0) DESC NULLS LAST, a.ultima_em DESC NULLS LAST
    LIMIT greatest(coalesce(_limite, 50), 1)
    OFFSET greatest(coalesce(_offset, 0), 0)
  ) sub;

  SELECT count(*)::bigint INTO _total
  FROM public.pv_contatos c
  WHERE _busca IS NULL OR _busca = ''
    OR coalesce(c.comprador_username, '') ILIKE '%' || _busca || '%'
    OR coalesce(c.nome, '') ILIKE '%' || _busca || '%';

  RETURN jsonb_build_object('total', _total, 'itens', coalesce(_res, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.pv_contatos_lista(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pv_contatos_lista(text, integer, integer, integer) TO authenticated, service_role;