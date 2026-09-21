-- ============================================================
-- Correção da constraint única de produtos (Etapa 1 corrigida)
-- A chave natural real é (item_id, model_id) — cada produto pode
-- ter várias variações, cada uma com seu próprio model_id
-- (confirmado via export direto da tabela de produção). A
-- primeira tentativa da Etapa 1 criou uma constraint (loja_id,
-- item_id) sem o model_id, que já foi aplicada neste ambiente de
-- teste; esta migration corrige o que ficou errado.
-- ============================================================

alter table public.produtos drop constraint if exists produtos_loja_item_id_key;
alter table public.produtos drop constraint if exists produtos_item_id_model_id_key;

alter table public.produtos
  add constraint produtos_loja_item_id_key unique (loja_id, item_id, model_id);
