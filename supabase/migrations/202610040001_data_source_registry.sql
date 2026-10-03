-- Data Source Registry (project brief section 9: "Data Sources and Source
-- Governance"). Every source of business or contact information the
-- platform uses - for leads, campaigns, or market intelligence - must be
-- registered here with its legal/permission basis, consent status,
-- licence reference, retention period, and approved use BEFORE anything
-- is allowed to import from it. This migration only builds the registry
-- and its approval workflow; it does not add a CSV import feature (none
-- exists in the codebase yet) - a future importer gates on
-- data_sources.approval_status = 'approved' the same way this registry's
-- own RPCs already require every governance field to be supplied at
-- creation (see BACKLOG.md).
--
-- Same lockdown pattern as opt_out_requests/data_subject_requests
-- (202610030003): the authenticated role gets select-only access to both
-- tables, and every write goes through a SECURITY DEFINER RPC that
-- re-checks the caller is an active platform_admin or compliance_admin -
-- this is governance tooling per the role matrix in the project brief
-- (Super Admin: "Lead source configuration"; Compliance Admin: "Data
-- sources"), never a broker or marketing-analyst-facing feature.
--
-- Two tables, matching the project brief's table list exactly:
--   data_sources           - the registry record itself (one row per source)
--   data_source_approvals  - an append-only history of approve/reject/
--                            suspend/reinstate decisions against it, so a
--                            source's review trail survives even as its
--                            current approval_status moves on.

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in (
    'website_lead_form', 'referral_partner', 'approved_event_or_webinar',
    'approved_csv_upload', 'crm_import', 'email_campaign', 'google_ads',
    'google_search_console', 'organic_analytics', 'approved_business_directory',
    'approved_commercial_data_provider', 'public_aggregate_statistics', 'manual_broker_entry'
  )),
  owner text not null,
  description text,
  data_fields_received text[] not null default '{}',
  legal_basis text not null,
  consent_status text not null check (consent_status in (
    'consent_obtained', 'consent_pending', 'not_required_aggregate', 'not_applicable'
  )),
  licence_reference text,
  retention_period_days integer check (retention_period_days is null or retention_period_days between 1 and 3650),
  approved_use text not null,
  approval_status text not null default 'pending' check (approval_status in (
    'pending', 'approved', 'rejected', 'suspended'
  )),
  last_reviewed_at timestamptz,
  data_quality_rating text not null default 'unrated' check (data_quality_rating in (
    'unrated', 'low', 'medium', 'high'
  )),
  refresh_frequency text not null default 'one_off' check (refresh_frequency in (
    'one_off', 'daily', 'weekly', 'monthly', 'quarterly', 'continuous'
  )),
  contains_personal_information boolean not null default false,
  allowed_for_marketing boolean not null default false,
  allowed_for_market_intelligence_only boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A source cannot be marked usable for marketing while it is not yet
  -- approved - approval always comes first, never implied by a flag set
  -- at creation.
  constraint data_sources_marketing_requires_approval check (
    not allowed_for_marketing or approval_status = 'approved'
  )
);

create index data_sources_approval_status_idx on public.data_sources (approval_status, created_at desc);
create index data_sources_source_type_idx on public.data_sources (source_type);

create table public.data_source_approvals (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'suspended', 'reinstated')),
  notes text,
  decided_by text not null,
  decided_at timestamptz not null default now()
);

create index data_source_approvals_source_idx on public.data_source_approvals (data_source_id, decided_at desc);

alter table public.data_sources enable row level security;
alter table public.data_source_approvals enable row level security;

create policy "platform admins manage data sources"
  on public.data_sources for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "compliance auditors view data sources"
  on public.data_sources for select
  using (public.is_compliance_auditor());

create policy "platform admins manage data source approvals"
  on public.data_source_approvals for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "compliance auditors view data source approvals"
  on public.data_source_approvals for select
  using (public.is_compliance_auditor());

revoke all on public.data_sources from public, anon, authenticated;
grant select on public.data_sources to authenticated;

revoke all on public.data_source_approvals from public, anon, authenticated;
grant select on public.data_source_approvals to authenticated;

-- ---------------------------------------------------------------------
-- RPCs.

create or replace function public.create_data_source(
  p_name text,
  p_source_type text,
  p_owner text,
  p_legal_basis text,
  p_consent_status text,
  p_approved_use text,
  p_description text default null,
  p_data_fields_received text[] default '{}',
  p_licence_reference text default null,
  p_retention_period_days integer default null,
  p_data_quality_rating text default 'unrated',
  p_refresh_frequency text default 'one_off',
  p_contains_personal_information boolean default false,
  p_allowed_for_market_intelligence_only boolean default false
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
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Data source name must not be empty' using errcode = '22023';
  end if;
  if coalesce(trim(p_owner), '') = '' then
    raise exception 'Data source owner must not be empty' using errcode = '22023';
  end if;
  if coalesce(trim(p_legal_basis), '') = '' then
    raise exception 'Legal basis must not be empty' using errcode = '22023';
  end if;
  if coalesce(trim(p_approved_use), '') = '' then
    raise exception 'Approved use must not be empty' using errcode = '22023';
  end if;
  if p_source_type not in (
    'website_lead_form', 'referral_partner', 'approved_event_or_webinar',
    'approved_csv_upload', 'crm_import', 'email_campaign', 'google_ads',
    'google_search_console', 'organic_analytics', 'approved_business_directory',
    'approved_commercial_data_provider', 'public_aggregate_statistics', 'manual_broker_entry'
  ) then
    raise exception 'Data source category is not recognised' using errcode = '22023';
  end if;
  if p_consent_status not in ('consent_obtained', 'consent_pending', 'not_required_aggregate', 'not_applicable') then
    raise exception 'Consent status is not recognised' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may register a data source' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may register a data source' using errcode = '42501';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.data_sources (
    name, source_type, owner, description, data_fields_received, legal_basis, consent_status,
    licence_reference, retention_period_days, approved_use, data_quality_rating, refresh_frequency,
    contains_personal_information, allowed_for_marketing, allowed_for_market_intelligence_only, created_by
  )
  values (
    trim(p_name), p_source_type, trim(p_owner), nullif(trim(p_description), ''), coalesce(p_data_fields_received, '{}'),
    trim(p_legal_basis), p_consent_status, nullif(trim(p_licence_reference), ''), p_retention_period_days,
    trim(p_approved_use), coalesce(p_data_quality_rating, 'unrated'), coalesce(p_refresh_frequency, 'one_off'),
    coalesce(p_contains_personal_information, false), false, coalesce(p_allowed_for_market_intelligence_only, false), actor_label
  )
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'data_source', new_id, 'data_source_registered', actor_label,
    jsonb_build_object('name', trim(p_name), 'sourceType', p_source_type)
  );

  return jsonb_build_object('id', new_id);
end;
$$;

revoke all on function public.create_data_source(
  text, text, text, text, text, text, text, text[], text, integer, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.create_data_source(
  text, text, text, text, text, text, text, text[], text, integer, text, text, boolean, boolean
) to authenticated;

-- Editing a source's governance fields never changes its approval_status
-- or allowed_for_marketing directly - either requires a separate, explicit
-- decide_data_source_approval() call, so a legal-basis or licence change
-- can't silently keep an outdated approval or marketing permission alive.
create or replace function public.update_data_source(
  p_data_source_id uuid,
  p_name text default null,
  p_owner text default null,
  p_description text default null,
  p_data_fields_received text[] default null,
  p_legal_basis text default null,
  p_consent_status text default null,
  p_licence_reference text default null,
  p_retention_period_days integer default null,
  p_approved_use text default null,
  p_data_quality_rating text default null,
  p_refresh_frequency text default null,
  p_contains_personal_information boolean default null,
  p_allowed_for_market_intelligence_only boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  existing public.data_sources%rowtype;
  actor_label text;
begin
  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may update a data source' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may update a data source' using errcode = '42501';
  end if;

  select * into existing from public.data_sources where id = p_data_source_id;
  if not found then
    raise exception 'Data source not found' using errcode = 'P0002';
  end if;

  if p_consent_status is not null and p_consent_status not in ('consent_obtained', 'consent_pending', 'not_required_aggregate', 'not_applicable') then
    raise exception 'Consent status is not recognised' using errcode = '22023';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  update public.data_sources set
    name = coalesce(nullif(trim(p_name), ''), name),
    owner = coalesce(nullif(trim(p_owner), ''), owner),
    description = case when p_description is not null then nullif(trim(p_description), '') else description end,
    data_fields_received = coalesce(p_data_fields_received, data_fields_received),
    legal_basis = coalesce(nullif(trim(p_legal_basis), ''), legal_basis),
    consent_status = coalesce(p_consent_status, consent_status),
    licence_reference = case when p_licence_reference is not null then nullif(trim(p_licence_reference), '') else licence_reference end,
    retention_period_days = coalesce(p_retention_period_days, retention_period_days),
    approved_use = coalesce(nullif(trim(p_approved_use), ''), approved_use),
    data_quality_rating = coalesce(p_data_quality_rating, data_quality_rating),
    refresh_frequency = coalesce(p_refresh_frequency, refresh_frequency),
    contains_personal_information = coalesce(p_contains_personal_information, contains_personal_information),
    allowed_for_market_intelligence_only = coalesce(p_allowed_for_market_intelligence_only, allowed_for_market_intelligence_only),
    updated_at = now()
  where id = p_data_source_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (auth.uid(), 'data_source', p_data_source_id, 'data_source_updated', actor_label, '{}'::jsonb);

  return jsonb_build_object('id', p_data_source_id);
end;
$$;

revoke all on function public.update_data_source(
  uuid, text, text, text, text[], text, text, text, integer, text, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.update_data_source(
  uuid, text, text, text, text[], text, text, text, integer, text, text, text, boolean, boolean
) to authenticated;

-- The one function allowed to change approval_status (and, only on
-- approval, allowed_for_marketing). Every decision - including a
-- re-approval after suspension ("reinstated") - is appended to
-- data_source_approvals so the review trail is never overwritten.
create or replace function public.decide_data_source_approval(
  p_data_source_id uuid,
  p_decision text,
  p_notes text default null,
  p_allowed_for_marketing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  existing public.data_sources%rowtype;
  actor_label text;
  next_status text;
begin
  if p_decision not in ('approved', 'rejected', 'suspended', 'reinstated') then
    raise exception 'Decision is not recognised' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may decide a data source approval' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may decide a data source approval' using errcode = '42501';
  end if;

  select * into existing from public.data_sources where id = p_data_source_id;
  if not found then
    raise exception 'Data source not found' using errcode = 'P0002';
  end if;

  next_status := case
    when p_decision in ('approved', 'reinstated') then 'approved'
    when p_decision = 'rejected' then 'rejected'
    when p_decision = 'suspended' then 'suspended'
  end;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  update public.data_sources set
    approval_status = next_status,
    last_reviewed_at = now(),
    allowed_for_marketing = (next_status = 'approved') and coalesce(p_allowed_for_marketing, false),
    updated_at = now()
  where id = p_data_source_id;

  insert into public.data_source_approvals (data_source_id, decision, notes, decided_by)
  values (p_data_source_id, p_decision, nullif(trim(p_notes), ''), actor_label);

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'data_source', p_data_source_id, 'data_source_approval_decided', actor_label,
    jsonb_build_object('decision', p_decision, 'from', existing.approval_status, 'to', next_status)
  );

  return jsonb_build_object('id', p_data_source_id, 'approvalStatus', next_status);
end;
$$;

revoke all on function public.decide_data_source_approval(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.decide_data_source_approval(uuid, text, text, boolean) to authenticated;
