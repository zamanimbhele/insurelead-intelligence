-- First create the person in Supabase Authentication, then replace every
-- placeholder and run this script as a platform administrator.
do $$
declare
  broker_slug text := 'REPLACE_WITH_BROKER_SLUG';
  broker_user_email text := 'REPLACE_WITH_AUTH_USER_EMAIL';
  broker_user_name text := 'REPLACE_WITH_DISPLAY_NAME';
  broker_user_role text := 'broker_agent'; -- broker_admin, campaign_manager, or broker_agent
  broker_id uuid;
  broker_user_id uuid;
begin
  if broker_slug like 'REPLACE_%' or broker_user_email like 'REPLACE_%'
    or broker_user_name like 'REPLACE_%' then
    raise exception 'Replace the broker-user placeholders before running this script';
  end if;
  if broker_user_role not in ('broker_admin', 'campaign_manager', 'broker_agent') then
    raise exception 'Invalid broker role';
  end if;

  select id into broker_id
  from public.organisations
  where lower(slug) = lower(broker_slug)
    and organisation_type in ('broker', 'insurer')
    and status = 'active'
  limit 1;
  if broker_id is null then raise exception 'Approved broker organisation not found'; end if;

  select id into broker_user_id
  from auth.users
  where lower(email) = lower(broker_user_email)
  limit 1;
  if broker_user_id is null then raise exception 'Supabase Auth user not found'; end if;

  insert into public.profiles (
    id, organisation_id, role, display_name, member_status
  ) values (
    broker_user_id, broker_id, broker_user_role, broker_user_name, 'active'
  )
  on conflict (id) do update set
    organisation_id = excluded.organisation_id,
    role = excluded.role,
    display_name = excluded.display_name,
    member_status = excluded.member_status,
    updated_at = now();
end;
$$;
