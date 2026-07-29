alter table public.shopee_connection
  add column if not exists app_tipo text not null default 'principal',
  add column if not exists partner_id bigint;

alter table public.shopee_connection drop constraint if exists shopee_connection_pkey;
alter table public.shopee_connection drop constraint if exists shopee_connection_id_check;
alter table public.shopee_connection alter column id drop default;

update public.shopee_connection set app_tipo = 'principal' where id = 1;

create unique index if not exists uq_shopee_connection_app
  on public.shopee_connection (app_tipo);

alter table public.shopee_connection add primary key (id);

drop view if exists public.shopee_connection_status;
create view public.shopee_connection_status
with (security_invoker = true) as
  select id, app_tipo, partner_id, shop_id, shop_name, token_expires_at, status, updated_at
  from public.shopee_connection;

grant select on public.shopee_connection_status to authenticated;