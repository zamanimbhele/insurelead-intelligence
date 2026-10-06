-- Financial-Year-End Campaign Planner (project brief section 8). A plan is
-- a lightweight reminder/calendar entry against one target FYE month - it
-- is never an outbound send itself. The brief's heavier, tenant-scoped
-- email campaign system (audience rules, content versions, Resend
-- delivery - see campaigns/campaign_content_versions/campaign_recipients
-- in 202609110002_campaign_generation_mcp.sql and src/mcp/campaign-tools.ts)
-- already exists and is out of scope here; this table only tracks "we plan
-- to run a push towards businesses whose financial year-end is <month>,
-- starting around <month>" so it shows up on the planner's calendar, plus
-- a simple status lifecycle. Any actual outreach happens as ordinary
-- LeadTask follow-ups (already shipped - 202610030002_lead_activity_
-- workflow.sql), created in a batch from this planner.
--
-- Same lockdown pattern as data_sources/opt_out_requests: the authenticated
-- role gets select-only access, every write goes through a SECURITY
-- DEFINER RPC that re-checks the caller's role. Matches the project
-- brief's role matrix: Super Admin ("Campaign settings"), Broker Manager
-- ("Create campaigns") and Marketing Analyst ("Create campaign records")
-- may all create/manage a plan - mapped onto this codebase's existing role
-- vocabulary as platform_admin/compliance_admin, broker_admin, and
-- campaign_manager respectively (the same three roles
-- src/mcp/campaign-tools.ts already grants campaign-creation to).

create table public.financial_year_calendars (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  fye_month text not null check (fye_month in (
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  )),
  planned_contact_month text not null check (planned_contact_month in (
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  )),
  notes text,
  status text not null default 'planned' check (status in (
    'planned', 'active', 'completed', 'cancelled'
  )),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_year_calendars_fye_month_idx on public.financial_year_calendars (fye_month, status);

alter table public.financial_year_calendars enable row level security;

create policy "platform members view fye campaign plans"
  on public.financial_year_calendars for select
  using (auth.uid() is not null);

revoke all on public.financial_year_calendars from public, anon, authenticated;
grant select on public.financial_year_calendars to authenticated;

-- ---------------------------------------------------------------------
-- RPCs.

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
  new_id uuid;
  valid_months text[] := array[
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Plan title must not be empty' using errcode = '22023';
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

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.financial_year_calendars (title, fye_month, planned_contact_month, notes, created_by)
  values (trim(p_title), p_fye_month, p_planned_contact_month, nullif(trim(p_notes), ''), actor_label)
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'fye_campaign_plan', new_id, 'fye_campaign_plan_created', actor_label,
    jsonb_build_object('title', trim(p_title), 'fyeMonth', p_fye_month)
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

  select * into existing from public.financial_year_calendars where id = p_plan_id;
  if not found then
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
    jsonb_build_object('from', existing.status, 'to', p_status)
  );

  return jsonb_build_object('id', p_plan_id, 'status', p_status);
end;
$$;

revoke all on function public.update_fye_campaign_plan_status(uuid, text) from public, anon, authenticated;
grant execute on function public.update_fye_campaign_plan_status(uuid, text) to authenticated;
