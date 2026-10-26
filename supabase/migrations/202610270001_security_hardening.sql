-- Security hardening from the October 2026 access-control review.
--
-- Who can do what after this migration:
--
-- 1. Table privileges for the public key (defence in depth). Earlier
--    migrations already revoke Supabase's default table grants table by
--    table; this re-asserts, for every public table, that anonymous
--    visitors cannot insert, update, delete or truncate, and that nobody
--    using the public key can truncate (RLS does not apply to TRUNCATE),
--    add triggers or reference tables. It also changes the default
--    privileges, so a table added by a future migration starts without
--    those grants instead of relying on that migration to revoke them.
--    Public lead capture is unaffected: it runs on the server with the
--    service role. Reads are unchanged.
--
-- 2. Audit log: platform and compliance administrators may now ADD an
--    entry under their own user id. The audit-log export, retention and
--    hotspot-threshold routes write one with the signed-in admin's
--    session, but the authenticated role only had SELECT, so those writes
--    were refused: exports failed, and setting changes were saved without
--    their audit entry. Nobody but the server can edit or delete
--    an entry, and nobody can write one in someone else's name.
--
-- 3. FYE campaign plans are now per workspace. Before: every signed-in
--    user, in any broker organisation, could read every other
--    organisation's plans (titles, notes, who created them) and change
--    their status. Now: a broker sees and changes only its own workspace's
--    plans plus platform-wide plans (created by platform staff, read-only
--    for brokers); platform staff and auditors see all. Existing plans are
--    assigned to the creator's workspace using the audit log; any plan
--    whose creator cannot be traced stays platform-wide.
--
-- 4. Lead outcomes: the old policy let brokers insert, change and delete
--    their outcomes. No table grant backed it (so it allowed nothing
--    today) and the app never used it; it is replaced by read access for
--    the owning workspace, so a future grant cannot open it up.
--
-- 5. Unused write policies on campaigns, campaign content and campaign
--    approvals are removed. They had no table grant behind them, so they
--    allowed nothing today, but a future grant would silently have let a
--    campaign manager approve or re-target campaigns directly. Campaign
--    changes keep going through the SECURITY DEFINER functions and the
--    server.

-- ---------------------------------------------------------------------
-- 1. Table privileges for the public key.

do $$
declare
  table_name text;
begin
  for table_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', table_name);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', table_name);
  end loop;
end;
$$;

alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- ---------------------------------------------------------------------
-- 2. Audit log entries written by administrators.

alter table public.audit_logs alter column actor_id set default auth.uid();

revoke all on public.audit_logs from public, anon, authenticated;
grant select, insert on public.audit_logs to authenticated;

drop policy if exists "platform staff add own audit entries" on public.audit_logs;
create policy "platform staff add own audit entries"
  on public.audit_logs for insert
  to authenticated
  with check (public.is_platform_admin() and actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 3. FYE campaign plans belong to a workspace.

alter table public.financial_year_calendars
  add column if not exists organisation_id uuid references public.organisations(id) on delete cascade;

create index if not exists financial_year_calendars_organisation_idx
  on public.financial_year_calendars (organisation_id);

-- Assign existing plans to the workspace of the broker who created them.
update public.financial_year_calendars plan
set organisation_id = creator.organisation_id
from public.audit_logs entry
join public.profiles creator on creator.id = entry.actor_id
where entry.entity_type = 'fye_campaign_plan'
  and entry.action = 'fye_campaign_plan_created'
  and entry.entity_id = plan.id
  and plan.organisation_id is null
  and creator.role in ('broker_admin', 'campaign_manager', 'broker_agent');

drop policy if exists "platform members view fye campaign plans" on public.financial_year_calendars;
drop policy if exists "fye plans visible to their workspace" on public.financial_year_calendars;
create policy "fye plans visible to their workspace"
  on public.financial_year_calendars for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or (organisation_id is null and public.current_organisation_id() is not null)
    or organisation_id = public.current_organisation_id()
  );

create or replace function public.create_fye_campaign_plan(
  p_title text,
  p_fye_month text,
  p_planned_contact_month text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  actor_label text;
  plan_organisation uuid;
  new_id uuid;
  valid_months text[] := array[
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Plan title must not be empty' using errcode = '22023';
  end if;
  if char_length(trim(p_title)) > 200 or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Plan title or notes are too long' using errcode = '22023';
  end if;
  if not (p_fye_month = any(valid_months)) then
    raise exception 'Financial year-end month is not recognised' using errcode = '22023';
  end if;
  if not (p_planned_contact_month = any(valid_months)) then
    raise exception 'Planned contact month is not recognised' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may create a campaign plan' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin', 'broker_admin', 'campaign_manager') then
    raise exception 'Only a platform administrator, broker manager, or marketing analyst may create a campaign plan' using errcode = '42501';
  end if;

  -- Platform staff create platform-wide plans; a broker's plan belongs to
  -- its own workspace (never a client-supplied organisation).
  plan_organisation := case
    when acting_profile.role in ('platform_admin', 'compliance_admin') then null
    else acting_profile.organisation_id
  end;
  if plan_organisation is null and acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only an active platform member may create a campaign plan' using errcode = '42501';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.financial_year_calendars (title, fye_month, planned_contact_month, notes, created_by, organisation_id)
  values (trim(p_title), p_fye_month, p_planned_contact_month, nullif(trim(p_notes), ''), actor_label, plan_organisation)
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'fye_campaign_plan', new_id, 'fye_campaign_plan_created', actor_label,
    jsonb_build_object('title', trim(p_title), 'fyeMonth', p_fye_month, 'buyerOrganisationId', plan_organisation)
  );

  return jsonb_build_object('id', new_id);
end;
$$;

revoke all on function public.create_fye_campaign_plan(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_fye_campaign_plan(text, text, text, text) to authenticated;

create or replace function public.update_fye_campaign_plan_status(
  p_plan_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  existing public.financial_year_calendars%rowtype;
  actor_label text;
  platform_staff boolean;
begin
  if p_status not in ('planned', 'active', 'completed', 'cancelled') then
    raise exception 'Plan status is not recognised' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may update a campaign plan' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin', 'broker_admin', 'campaign_manager') then
    raise exception 'Only a platform administrator, broker manager, or marketing analyst may update a campaign plan' using errcode = '42501';
  end if;
  platform_staff := acting_profile.role in ('platform_admin', 'compliance_admin');

  select * into existing from public.financial_year_calendars where id = p_plan_id for update;
  -- Another workspace's plan, or a platform-wide plan, looks the same to a
  -- broker as one that does not exist.
  if not found or (not platform_staff and existing.organisation_id is distinct from acting_profile.organisation_id) then
    raise exception 'Campaign plan not found' using errcode = 'P0002';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  update public.financial_year_calendars set
    status = p_status,
    updated_at = now()
  where id = p_plan_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'fye_campaign_plan', p_plan_id, 'fye_campaign_plan_status_changed', actor_label,
    jsonb_build_object('from', existing.status, 'to', p_status, 'buyerOrganisationId', existing.organisation_id)
  );

  return jsonb_build_object('id', p_plan_id, 'status', p_status);
end;
$$;

revoke all on function public.update_fye_campaign_plan_status(uuid, text) from public, anon, authenticated;
grant execute on function public.update_fye_campaign_plan_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Lead outcomes are read-only for brokers.

drop policy if exists "organisations manage own outcomes" on public.lead_outcomes;
drop policy if exists "organisations view own outcomes" on public.lead_outcomes;
drop policy if exists "platform admins manage outcomes" on public.lead_outcomes;
create policy "organisations view own outcomes"
  on public.lead_outcomes for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or exists (
      select 1 from public.lead_allocations allocation
      where allocation.id = lead_outcomes.allocation_id
        and allocation.buyer_organisation_id = public.current_organisation_id()
    )
  );
create policy "platform admins manage outcomes"
  on public.lead_outcomes for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 5. Remove write policies with no grant behind them.

drop policy if exists "campaign managers update tenant campaigns" on public.campaigns;
drop policy if exists "campaign managers add tenant content" on public.campaign_content_versions;
drop policy if exists "campaign approvers approve tenant campaigns" on public.campaign_approvals;
