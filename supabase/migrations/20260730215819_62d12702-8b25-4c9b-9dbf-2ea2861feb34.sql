alter table public.shopee_connection drop constraint if exists shopee_connection_singleton;
create sequence if not exists public.shopee_connection_id_seq owned by public.shopee_connection.id;
select setval('public.shopee_connection_id_seq', coalesce((select max(id) from public.shopee_connection), 1));
alter table public.shopee_connection alter column id set default nextval('public.shopee_connection_id_seq');
create unique index if not exists shopee_connection_app_tipo_key on public.shopee_connection (app_tipo);