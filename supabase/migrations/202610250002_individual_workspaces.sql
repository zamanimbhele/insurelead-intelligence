-- Individual workspaces (individual advisors plan, phase 2).
--
-- An organisation stays the account boundary; a solo advisor is simply an
-- organisation of one. workspace_type only changes what people see
-- (wording, team features), never what they may access.
--
-- 1. organisations.workspace_type: individual | practice | brokerage.
--    Existing organisations become 'brokerage' (what they are today).
-- 2. handle_new_user() records the type chosen at signup.
-- 3. review_broker_organisation(): approving an organisation also
--    activates the person who registered it. Before this, a self-signup
--    stayed 'invited' after approval and could not use the dashboard
--    until an admin activated them separately.
-- 4. set_workspace_type(): a platform admin, or the organisation's own
--    broker admin, changes the type (an individual who invites a
--    colleague becomes a practice).

-- 1. ------------------------------------------------------------------------
alter table public.organisations
  add column if not exists workspace_type text not null default 'brokerage';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_workspace_type_check') then
    alter table public.organisations
      add constraint organisations_workspace_type_check check (workspace_type in ('individual', 'practice', 'brokerage'));
  end if;
end;
$$;

-- 2. ------------------------------------------------------------------------
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
  requested_workspace text := new.raw_user_meta_data ->> 'workspace_type';
  safe_workspace text;
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

  safe_workspace := case
    when requested_workspace in ('individual', 'practice', 'brokerage') then requested_workspace
    else 'brokerage'
  end;

  org_slug := trim(both '-' from regexp_replace(lower(brokerage_name), '[^a-z0-9]+', '-', 'g'));
  if org_slug = '' then org_slug := 'broker'; end if;
  org_slug := org_slug || '-' || left(new.id::text, 8);

  insert into public.organisations (name, organisation_type, status, onboarding_status, fsp_number, contact_email, slug, workspace_type)
  values (brokerage_name, 'broker', 'pending', 'pending', fsp_number, new.email, org_slug, safe_workspace)
  returning id into new_org_id;

  insert into public.profiles (id, organisation_id, role, member_status, display_name)
  values (new.id, new_org_id, safe_role, 'invited', nullif(full_name, ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 3. ------------------------------------------------------------------------
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

  if p_decision = 'approve' and target_org.organisation_type in ('broker', 'insurer') then
    insert into public.buyer_preferences (organisation_id)
    values (p_organisation_id)
    on conflict (organisation_id) do nothing;
  end if;

  -- The person who registered the organisation through self-service
  -- signup is created 'invited' (handle_new_user()). Approving their
  -- organisation now also activates them, so a solo advisor can sign in
  -- straight after approval. Only that founding account: anyone invited
  -- later still accepts their own invitation.
  if p_decision = 'approve' then
    update public.profiles profile
    set member_status = 'active', updated_at = now()
    from auth.users account
    where profile.organisation_id = p_organisation_id
      and profile.member_status = 'invited'
      and account.id = profile.id
      and coalesce(trim(account.raw_user_meta_data ->> 'brokerage_name'), '') <> '';
  end if;

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

-- 4. ------------------------------------------------------------------------
create or replace function public.set_workspace_type(p_organisation_id uuid, p_workspace_type text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_org public.organisations%rowtype;
begin
  if p_workspace_type is null or p_workspace_type not in ('individual', 'practice', 'brokerage') then
    raise exception 'Workspace type must be individual, practice or brokerage' using errcode = '22023';
  end if;

  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or not (
    acting_profile.role in ('platform_admin', 'compliance_admin')
    or (acting_profile.role = 'broker_admin' and acting_profile.organisation_id = p_organisation_id)
  ) then
    raise exception 'Only a platform administrator or the organisation''s broker admin may change its workspace type' using errcode = '42501';
  end if;

  select * into target_org from public.organisations where id = p_organisation_id for update;
  if not found or target_org.organisation_type not in ('broker', 'insurer') then
    raise exception 'Broker organisation not found' using errcode = 'P0002';
  end if;
  if target_org.workspace_type = p_workspace_type then
    return jsonb_build_object('id', p_organisation_id, 'workspaceType', p_workspace_type, 'changed', false);
  end if;

  update public.organisations
  set workspace_type = p_workspace_type, updated_at = now()
  where id = p_organisation_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'organisation', p_organisation_id, 'workspace_type_changed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('organisationName', target_org.name, 'from', target_org.workspace_type, 'to', p_workspace_type)
  );

  return jsonb_build_object('id', p_organisation_id, 'workspaceType', p_workspace_type, 'changed', true);
end;
$$;

revoke all on function public.set_workspace_type(uuid, text) from public, anon, authenticated;
grant execute on function public.set_workspace_type(uuid, text) to authenticated;
