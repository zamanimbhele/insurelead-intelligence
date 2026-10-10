-- Broker-side self-service team invitations.
--
-- BACKLOG.md and docs/BROKER_TENANCY_SETUP.md both flagged this as the
-- next refinement after platform_admin_onboarding: a second team member
-- joining an *already-approved* organisation had no path except another
-- self-service signup, which - because handle_new_user() always creates
-- a brand-new organisation - produced a second, duplicate pending
-- organisation rather than joining the existing one.
--
-- This migration adds the real invitation path: a broker_admin invites a
-- teammate by email from the dashboard, the application layer uses the
-- Supabase Admin API (service-role only, never exposed to the browser) to
-- create the auth user and send Supabase's own invite email, and this RPC
-- attaches the resulting user to the *inviter's own* organisation as an
-- 'invited' profile - never a new organisation. handle_new_user() already
-- leaves an admin-invited user alone (it only acts when raw_user_meta_data
-- has brokerage_name set, which the invite call deliberately never sets),
-- so there is no risk of the trigger also firing and creating a stray
-- second organisation for the same signup.
--
-- Known, explicitly accepted limitation: inviting an email address that
-- already has a Supabase auth user (for example, someone who previously
-- self-signed-up and is stuck in their own duplicate pending organisation)
-- still fails, since the Admin API refuses to invite an address that is
-- already registered. Resolving that case needs an account-merge flow,
-- which is a reasonable further refinement, not attempted here.

create or replace function public.invite_broker_team_member(
  p_user_id uuid,
  p_role text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_email text;
  clean_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role <> 'broker_admin' then
    raise exception 'Only a broker manager may invite a team member' using errcode = '42501';
  end if;

  if p_role not in ('broker_admin', 'campaign_manager', 'broker_agent') then
    raise exception 'Role is not recognised' using errcode = '22023';
  end if;

  select email into target_email from auth.users where id = p_user_id;
  if not found then
    raise exception 'Invited user not found' using errcode = 'P0002';
  end if;

  if exists(select 1 from public.profiles where id = p_user_id) then
    raise exception 'This person already has a profile' using errcode = '23505';
  end if;

  insert into public.profiles (id, organisation_id, role, member_status, display_name)
  values (p_user_id, acting_profile.organisation_id, p_role, 'invited', clean_display_name);

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'profile', p_user_id, 'profile_invited',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object(
      'organisationId', acting_profile.organisation_id, 'role', p_role, 'email', target_email
    )
  );

  return jsonb_build_object(
    'id', p_user_id, 'organisationId', acting_profile.organisation_id, 'role', p_role,
    'memberStatus', 'invited', 'displayName', clean_display_name, 'email', target_email
  );
end;
$$;

revoke all on function public.invite_broker_team_member(uuid, text, text) from public, anon, authenticated;
grant execute on function public.invite_broker_team_member(uuid, text, text) to authenticated;
