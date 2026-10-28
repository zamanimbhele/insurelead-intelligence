-- Multi-factor authentication for platform staff.
--
-- Who can do what after this migration:
--
-- Platform staff (platform_admin, compliance_admin, compliance_auditor)
-- must have signed in with a second factor (an authenticator app code),
-- which Supabase records in the session as "aal2". A staff session that
-- has only passed the password step ("aal1") can no longer use the Data
-- API at all, and the admin checks used by RLS policies and functions no
-- longer recognise it. A stolen staff password alone no longer reaches
-- cross-broker data or admin actions.
--
-- Brokers, anonymous visitors and the server (service role) are not
-- affected.
--
-- Enforced in two places:
--   1. public.enforce_staff_mfa() runs before every Data API (PostgREST)
--      request and refuses staff sessions below aal2. It covers every
--      table and function, including ones added later.
--   2. is_platform_admin() and is_compliance_auditor() also require aal2,
--      so RLS policies stay closed even if (1) were switched off.
--
-- Staff enrol their authenticator at /admin/mfa the next time they sign
-- in; the app sends them there. The app reads a staff member's own role
-- with the server key while their session is still aal1.
--
-- To switch the request check off in an emergency (for example if no
-- administrator can sign in), run:
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
-- and remove the factor of the locked-out user under Supabase Dashboard ->
-- Authentication -> Users. Then turn it back on by re-running this file.

create or replace function public.session_has_mfa()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

revoke all on function public.session_has_mfa() from public, anon, authenticated;
grant execute on function public.session_has_mfa() to anon, authenticated, service_role;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.session_has_mfa() and exists(
    select 1 from public.profiles
    where id = auth.uid()
      and member_status = 'active'
      and role in ('platform_admin', 'compliance_admin')
  )
$$;

create or replace function public.is_compliance_auditor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.session_has_mfa() and exists(
    select 1 from public.profiles
    where id = auth.uid()
      and member_status = 'active'
      and role = 'compliance_auditor'
  )
$$;

-- Runs before every Data API request (see the alter role below).
create or replace function public.enforce_staff_mfa()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Anonymous visitors and the server key have no user id.
  if auth.uid() is null or public.session_has_mfa() then
    return;
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('platform_admin', 'compliance_admin', 'compliance_auditor')
  ) then
    raise exception 'Platform staff must complete multi-factor authentication'
      using errcode = '42501', hint = 'mfa_required';
  end if;
end;
$$;

revoke all on function public.enforce_staff_mfa() from public, anon, authenticated;
grant execute on function public.enforce_staff_mfa() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request to 'public.enforce_staff_mfa';
notify pgrst, 'reload config';
