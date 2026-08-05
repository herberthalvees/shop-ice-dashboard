CREATE OR REPLACE FUNCTION public.estoque_baixar_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v RECORD; v_qtd numeric; v_saldo numeric; v_data timestamptz;
BEGIN
  v_data := COALESCE(NEW.data_criacao_pedido, now());

  FOR v IN
    SELECT ev.estoque_item_id, ev.fator, GREATEST(ei.created_at, ev.created_at) AS corte
    FROM estoque_vinculos ev
    JOIN estoque_itens ei ON ei.id = ev.estoque_item_id
    WHERE ev.ativo
      AND ev.marketplace = COALESCE(NEW.marketplace, 'shopee')
      AND ev.item_id = NEW.item_id
      AND ev.model_id = COALESCE(NEW.model_id, 0)
  LOOP
    IF v_data < v.corte THEN CONTINUE; END IF;

    v_qtd := COALESCE(NEW.quantidade, 0) * COALESCE(v.fator, 1);
    IF v_qtd = 0 THEN CONTINUE; END IF;

    INSERT INTO estoque_movimentos
      (estoque_item_id, tipo, quantidade, origem, marketplace, order_sn, item_id, model_id)
    VALUES
      (v.estoque_item_id, 'saida', -v_qtd, 'venda',
       COALESCE(NEW.marketplace, 'shopee'), NEW.order_sn, NEW.item_id, COALESCE(NEW.model_id, 0))
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      UPDATE estoque_itens SET saldo = saldo - v_qtd
      WHERE id = v.estoque_item_id RETURNING saldo INTO v_saldo;

      UPDATE estoque_movimentos SET saldo_apos = v_saldo
      WHERE estoque_item_id = v.estoque_item_id AND origem = 'venda'
        AND marketplace = COALESCE(NEW.marketplace, 'shopee')
        AND order_sn = NEW.order_sn AND item_id = NEW.item_id
        AND model_id = COALESCE(NEW.model_id, 0);
    END IF;
  END LOOP;

  RETURN NEW;
END; $function$;