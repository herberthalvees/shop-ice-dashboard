insert into public.user_roles (user_id, role)
values ('68e7a22b-294f-447d-89a8-f7f60b2b808a', 'admin'::public.app_role)
on conflict (user_id, role) do nothing;