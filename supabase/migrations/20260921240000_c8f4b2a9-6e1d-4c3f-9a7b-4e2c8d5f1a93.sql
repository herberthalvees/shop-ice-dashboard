-- ============================================================
-- Pós-venda passa a operar por loja (contatos e envios manuais)
-- ============================================================

alter table public.pv_contatos add column if not exists loja_id bigint references public.lojas(id);
update public.pv_contatos set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.pv_contatos alter column loja_id set not null;

alter table public.pv_contatos drop constraint if exists pv_contatos_pkey;
alter table public.pv_contatos add constraint pv_contatos_pkey primary key (loja_id, to_id);

alter table public.pv_envios_manuais add column if not exists loja_id bigint references public.lojas(id);
update public.pv_envios_manuais set loja_id = (select id from public.lojas order by id limit 1) where loja_id is null;
alter table public.pv_envios_manuais alter column loja_id set not null;
