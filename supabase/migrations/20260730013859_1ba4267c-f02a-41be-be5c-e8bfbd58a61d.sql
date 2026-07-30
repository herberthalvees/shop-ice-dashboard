create table if not exists public.usuarios_papeis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null default 'colaborador' check (papel in ('owner', 'colaborador')),
  nome text,
  created_at timestamptz not null default now()
);

grant select on public.usuarios_papeis to authenticated;
grant all on public.usuarios_papeis to service_role;

alter table public.usuarios_papeis enable row level security;

create policy "ver proprio papel" on public.usuarios_papeis
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.eh_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_papeis
    where user_id = auth.uid() and papel = 'owner'
  );
$$;

revoke execute on function public.eh_owner() from public, anon;
grant execute on function public.eh_owner() to authenticated;

insert into public.usuarios_papeis (user_id, papel, nome)
values ('eaafbdbc-dc83-494b-bf0f-7e7b92f482b8', 'owner', 'Herberth')
on conflict (user_id) do update set papel = 'owner';