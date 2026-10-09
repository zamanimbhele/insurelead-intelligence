-- Platform administration: organisation approval, invitations, and role
-- changes (project brief section 4's Super Admin role: "Can manage: Users,
-- Broker teams... Approved brand configuration", and section 14's "Add a
-- platform administration UI for invitations, role changes, organisation
-- approval, and sending-domain verification; the database roles and tenant
-- policies are already in place").
--
-- The schema already had everything this needed, designed but never wired
-- up: organisations.onboarding_status supports 'pending'/'in_review'/
-- 'approved'/'rejected' and profiles.member_status supports 'invited' (see
-- 202609110001_multi_broker_tenancy.sql) - but nothing ever wrote an
-- 'invited' profile, and the only documented way to provision a broker was
-- a platform admin manually running supabase/add-pilot-buyer.example.sql
-- and supabase/add-broker-user.example.sql by hand (docs/
-- BROKER_TENANCY_SETUP.md). Worse: self-service signup
-- (src/app/(auth)/signup/actions.ts) creates a Supabase auth user with
-- brokerage_name/fsp_number/requested_role in its metadata, but nothing
-- ever turned that into a profiles row - getDashboardIdentity() already has
-- a `reason: "profile_missing"` branch and /access-denied already tells the
-- person "ask a platform administrator to complete your access setup", but
-- there was no way for an admin to ever discover that signup happened at
-- all. This migration closes that loop: a trigger provisions a pending
-- organisation + invited profile at signup time, and three new RPCs let a
-- platform admin review it.
--
-- Security note: raw_user_meta_data on auth.users is supplied by the
-- client at signup time (a direct call to Supabase's own auth.signUp REST
-- endpoint can set it to anything, bypassing this app's own signup form
-- entirely), so it must never be trusted for anything above the lowest
-- privilege tier. handle_new_user() below unconditionally creates the new
-- profile with member_status = 'invited' (never 'active') and clamps
-- requested_role to the three broker-side roles only, defaulting to
-- broker_admin - a spoofed "platform_admin" in the metadata can never
-- result in anything but an invited, access-denied broker-role profile
-- that still requires a real platform admin's explicit review via
-- update_profile_membership() (itself re-validated server-side) before it
-- gets any access at all.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  brokerage_name text := trim(coalesce(new.raw_user_meta_data ->> 'brokerage_name', ''));
  requested_role text := new.raw_user_meta_data ->> 'requested_role';
  safe_role text;
  full_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  fsp_number text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'fsp_number', '')), '');
  new_org_id uuid;
  org_slug text;
begin
  -- Only the self-service broker signup form sets brokerage_name. A user
  -- created any other way (platform/compliance admins, manually-added
  -- broker staff per docs/BROKER_TENANCY_SETUP.md) is left alone - those
  -- continue to be provisioned deliberately, not auto-created here.
  if brokerage_name = '' then
    return new;
  end if;

  safe_role := case
    when requested_role in ('broker_admin', 'broker_agent', 'campaign_manager') then requested_role
    else 'broker_admin'
  end;

  org_slug := trim(both '-' from regexp_replace(lower(brokerage_name), '[^a-z0-9]+', '-', 'g'));
  if org_slug = '' then org_slug := 'broker'; end if;
  org_slug := org_slug || '-' || left(new.id::text, 8);

  insert into public.organisations (name, organisation_type, status, onboarding_status, fsp_number, contact_email, slug)
  values (brokerage_name, 'broker', 'pending', 'pending', fsp_number, new.email, org_slug)
  returning id into new_org_id;

  insert into public.profiles (id, organisation_id, role, member_status, display_name)
  values (new.id, new_org_id, safe_role, 'invited', nullif(full_name, ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.review_broker_organisation(
  p_organisation_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_org public.organisations%rowtype;
  next_onboarding_status text;
  next_status public.organisation_status;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;

  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may review an organisation' using errcode = '42501';
  end if;

  select * into target_org from public.organisations where id = p_organisation_id;
  if not found then
    raise exception 'Organisation not found' using errcode = 'P0002';
  end if;

  if p_decision = 'approve' then
    next_onboarding_status := 'approved';
    next_status := 'active';
  else
    next_onboarding_status := 'rejected';
    next_status := target_org.status;
  end if;

  update public.organisations
  set onboarding_status = next_onboarding_status, status = next_status, updated_at = now()
  where id = p_organisation_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'organisation', p_organisation_id, 'organisation_reviewed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('decision', p_decision, 'onboardingStatus', next_onboarding_status, 'organisationName', target_org.name)
  );

  return jsonb_build_object('id', p_organisation_id, 'onboardingStatus', next_onboarding_status, 'status', next_status);
end;
$$;

revoke all on function public.review_broker_organisation(uuid, text) from public, anon, authenticated;
grant execute on function public.review_broker_organisation(uuid, text) to authenticated;

create or replace function public.update_profile_membership(
  p_profile_id uuid,
  p_role text,
  p_member_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
begin
  if p_role not in (
    'platform_admin', 'compliance_admin', 'compliance_auditor',
    'broker_admin', 'campaign_manager', 'broker_agent'
  ) then
    raise exception 'Role is not recognised' using errcode = '22023';
  end if;
  if p_member_status not in ('invited', 'active', 'suspended') then
    raise exception 'Membership status is not recognised' using errcode = '22023';
  end if;

  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may change a member''s role or status' using errcode = '42501';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'You cannot change your own role or membership status' using errcode = '42501';
  end if;

  select * into target_profile from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_role, member_status = p_member_status, updated_at = now()
  where id = p_profile_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'profile', p_profile_id, 'profile_membership_updated',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object(
      'fromRole', target_profile.role, 'toRole', p_role,
      'fromStatus', target_profile.member_status, 'toStatus', p_member_status
    )
  );

  return jsonb_build_object('id', p_profile_id, 'role', p_role, 'memberStatus', p_member_status);
end;
$$;

revoke all on function public.update_profile_membership(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_profile_membership(uuid, text, text) to authenticated;

create or replace function public.review_sending_identity(
  p_identity_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_identity public.broker_sending_identities%rowtype;
begin
  if p_status not in ('verified', 'disabled') then
    raise exception 'Status must be verified or disabled' using errcode = '22023';
  end if;

  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may review a sending identity' using errcode = '42501';
  end if;

  select * into target_identity from public.broker_sending_identities where id = p_identity_id;
  if not found then
    raise exception 'Sending identity not found' using errcode = 'P0002';
  end if;

  update public.broker_sending_identities
  set status = p_status, updated_at = now()
  where id = p_identity_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'sending_identity', p_identity_id, 'sending_identity_reviewed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('fromStatus', target_identity.status, 'toStatus', p_status, 'domain', target_identity.domain)
  );

  return jsonb_build_object('id', p_identity_id, 'status', p_status);
end;
$$;

revoke all on function public.review_sending_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.review_sending_identity(uuid, text) to authenticated;
