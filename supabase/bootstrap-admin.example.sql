-- Run this only after creating the administrator in Supabase Authentication.
-- Replace both values before executing it in the Supabase SQL editor.
do $$
declare
  admin_email text := 'REPLACE_WITH_ADMIN_EMAIL';
  platform_name text := 'REPLACE_WITH_PLATFORM_ORGANISATION_NAME';
  admin_user_id uuid;
  platform_organisation_id uuid;
begin
  if admin_email like 'REPLACE_%' or platform_name like 'REPLACE_%' then
    raise exception 'Replace the bootstrap placeholders before running this script';
  end if;

  select id into admin_user_id from auth.users where lower(email) = lower(admin_email) limit 1;
  if admin_user_id is null then
    raise exception 'No Supabase Auth user exists for %', admin_email;
  end if;

  select id into platform_organisation_id
  from public.organisations
  where lower(name) = lower(platform_name)
  limit 1;

  if platform_organisation_id is null then
    insert into public.organisations (name, organisation_type, status, contact_email)
    values (platform_name, 'platform', 'active', admin_email)
    returning id into platform_organisation_id;
  end if;

  insert into public.profiles (id, organisation_id, role)
  values (admin_user_id, platform_organisation_id, 'platform_admin')
  on conflict (id) do update
  set organisation_id = excluded.organisation_id, role = excluded.role;
end;
$$;
