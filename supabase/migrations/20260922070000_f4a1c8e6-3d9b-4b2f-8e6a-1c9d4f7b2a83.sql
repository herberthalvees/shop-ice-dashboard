-- ============================================================
-- Cada loja pode ter seu próprio app cadastrado na Shopee (CNPJs
-- diferentes = apps diferentes, com partner_id/partner_key próprios).
-- partner_id já existia (público, exposto via shopee_connection_status);
-- partner_key é segredo — fica só na tabela base, nunca na view.
-- ============================================================

alter table public.shopee_connection add column if not exists partner_key text;
