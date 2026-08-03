CREATE TABLE public.chat_respostas_rapidas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  corpo text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_respostas_rapidas TO authenticated;
GRANT ALL ON public.chat_respostas_rapidas TO service_role;
ALTER TABLE public.chat_respostas_rapidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read chat_respostas_rapidas" ON public.chat_respostas_rapidas
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins insert chat_respostas_rapidas" ON public.chat_respostas_rapidas
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins update chat_respostas_rapidas" ON public.chat_respostas_rapidas
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());
CREATE POLICY "admins delete chat_respostas_rapidas" ON public.chat_respostas_rapidas
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());

CREATE TRIGGER chat_respostas_rapidas_updated_at
  BEFORE UPDATE ON public.chat_respostas_rapidas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.chat_envios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text,
  to_id text,
  comprador text,
  texto text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_envios TO authenticated;
GRANT ALL ON public.chat_envios TO service_role;
ALTER TABLE public.chat_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read chat_envios" ON public.chat_envios
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) AND eh_owner());

INSERT INTO public.chat_respostas_rapidas (titulo, corpo, ordem) VALUES
('Endereço incorreto', E'Olá! Tudo bem?\n\nSeu pedido já está em preparação para envio, por isso não é mais possível alterar o endereço.\n\nAgora basta aguardar. Se houver dificuldade na entrega, o entregador entrará contato pedindo instruções para o endereço correto. Caso a entrega não seja realizada, a Shopee fará o reembolso do seu dinheiro.', 1),
('Cancelar pedido', E'Olá! Tudo bem?\n\nSeu pedido já foi faturado e está em preparação para envio, por isso não é mais possível desistir da compra neste momento.\n\nInfelizmente nós vendedores não conseguimos agir nessa etapa. Se ainda desejar desistir da compra, basta recusar a entrega e a Shopee realizará o reembolso após o retorno do pedido.', 2),
('Cancelar pós postagem', E'Olá! Tudo bem?\n\nSeu pedido já foi postado e está em transporte, então não é mais possível desistir da compra neste momento.\n\nSe ainda desejar desistir da compra, basta recusar a entrega. Após o retorno do pedido, a Shopee realizará o reembolso.', 3),
('Reclamação sobre produto', E'Olá! Tudo bem?\n\nEntendemos sua frustração e lamentamos o ocorrido.\n\nNo entanto, as informações sobre o produto estão descritas no anúncio, tanto nas imagens quanto na descrição. Pedimos, por gentileza, que verifique se essa informação realmente não está informada no anúncio.\n\nCaso não esteja, você tem todo o direito de reclamar, e ficaremos à disposição para ajudar da melhor forma possível.', 4),
('Não recebimento', E'Olá! Tudo bem?\n\nCaso o seu pedido conste como entregue, mas você não o tenha recebido, peço que acesse a página do seu pedido, clique em "Reportar problema" e selecione a opção "Não recebi meu pedido".\n\nDessa forma, a Shopee poderá analisar o ocorrido com prioridade e fornecer um retorno o mais rápido possível sobre a situação da sua entrega.', 5);