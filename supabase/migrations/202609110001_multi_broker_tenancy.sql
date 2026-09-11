-- Multi-broker tenancy. This migration turns the pilot buyer records into
-- operational broker workspaces while retaining platform-admin oversight.

alter table public.organisations
  add column if not exists slug text,
  add column if not exists website_url text,
  add column if not exists support_phone text,
  add column if not exists onboarding_status text not null default 'pending',
  add column if not exists updated_at timestamptz not null default now();

update public.organisations
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
  || '-' || left(id::text, 8)
where slug is null or trim(slug) = '';

alter table public.organisations alter column slug set not null;
alter table public.organisations drop constraint if exists organisations_onboarding_status_check;
alter table public.organisations add constraint organisations_onboarding_status_check
  check (onboarding_status in ('pending', 'in_review', 'approved', 'rejected'));
create unique index if not exists organisations_slug_uidx on public.organisations (lower(slug));

update public.organisations
set onboarding_status = 'approved', updated_at = now()
where status = 'active' and organisation_type in ('broker', 'insurer');

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists job_title text,
  add column if not exists member_status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'broker_admin' where role = 'buyer_manager';
update public.profiles set role = 'broker_agent' where role = 'broker';

alter table public.profiles add constraint profiles_role_check check (role in (
  'platform_admin', 'compliance_admin', 'compliance_auditor',
  'broker_admin', 'campaign_manager', 'broker_agent'
));
alter table public.profiles drop constraint if exists profiles_member_status_check;
alter table public.profiles add constraint profiles_member_status_check
  check (member_status in ('invited', 'active', 'suspended'));

alter table public.buyer_preferences
  add column if not exists cities text[] not null default '{}',
  add column if not exists daily_lead_capacity integer not null default 25,
  add column if not exists contact_sla_hours integer not null default 24,
  add column if not exists accepts_campaigns boolean not null default false;

alter table public.buyer_preferences drop constraint if exists buyer_preferences_daily_capacity_check;
alter table public.buyer_preferences add constraint buyer_preferences_daily_capacity_check
  check (daily_lead_capacity between 1 and 1000);
alter table public.buyer_preferences drop constraint if exists buyer_preferences_contact_sla_check;
alter table public.buyer_preferences add constraint buyer_preferences_contact_sla_check
  check (contact_sla_hours between 1 and 168);

alter table public.lead_allocations
  add column if not exists responded_at timestamptz,
  add column if not exists response_by uuid references public.profiles(id) on delete set null;

create table if not exists public.broker_sending_identities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  domain text not null,
  from_name text not null,
  from_email text not null,
  reply_to_email text,
  provider text not null default 'resend',
  provider_domain_id text,
  status text not null default 'pending',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_sending_identity_provider_check check (provider in ('resend')),
  constraint broker_sending_identity_status_check check (status in ('pending', 'verified', 'disabled')),
  unique (organisation_id, from_email)
);

create unique index if not exists broker_sending_identities_default_uidx
  on public.broker_sending_identities (organisation_id)
  where is_default;

create table if not exists public.lead_match_evaluations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  buyer_organisation_id uuid not null references public.organisations(id) on delete cascade,
  matched boolean not null,
  reasons text[] not null default '{}',
  source text not null default 'platform',
  evaluated_by uuid references auth.users(id) on delete set null,
  evaluated_at timestamptz not null default now()
);

create index if not exists lead_match_evaluations_lead_idx
  on public.lead_match_evaluations (lead_id, evaluated_at desc);
create index if not exists lead_match_evaluations_buyer_idx
  on public.lead_match_evaluations (buyer_organisation_id, evaluated_at desc);
create index if not exists buyer_preferences_cities_idx
  on public.buyer_preferences using gin (cities);

alter table public.broker_sending_identities enable row level security;
alter table public.lead_match_evaluations enable row level security;

create or replace function public.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organisation_id
  from public.profiles
  where id = auth.uid() and member_status = 'active'
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.profiles
  where id = auth.uid() and member_status = 'active'
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
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
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and member_status = 'active'
      and role = 'compliance_auditor'
  )
$$;

create or replace function public.is_broker_operator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_profile_role() in ('broker_admin', 'broker_agent'), false)
$$;

drop policy if exists "platform admins manage organisations" on public.organisations;
create policy "platform admins manage organisations"
  on public.organisations for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
drop policy if exists "buyers view own organisation" on public.organisations;
create policy "members view own organisation"
  on public.organisations for select
  using (id = public.current_organisation_id());
create policy "compliance auditors view organisations"
  on public.organisations for select
  using (public.is_compliance_auditor());

drop policy if exists "users view own profile" on public.profiles;
drop policy if exists "platform admins manage profiles" on public.profiles;
create policy "members view organisation profiles"
  on public.profiles for select
  using (
    id = auth.uid()
    or organisation_id = public.current_organisation_id()
    or public.is_platform_admin()
    or public.is_compliance_auditor()
  );
create policy "platform admins manage profiles"
  on public.profiles for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "buyers manage own preferences" on public.buyer_preferences;
drop policy if exists "platform admins manage buyer preferences" on public.buyer_preferences;
create policy "platform admins manage buyer preferences"
  on public.buyer_preferences for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy "members view own buyer preferences"
  on public.buyer_preferences for select
  using (organisation_id = public.current_organisation_id());
create policy "compliance auditors view buyer preferences"
  on public.buyer_preferences for select
  using (public.is_compliance_auditor());

drop policy if exists "buyers view accepted leads" on public.leads;
create policy "broker organisations view allocated leads"
  on public.leads for select
  using (
    exists (
      select 1
      from public.lead_allocations allocation
      where allocation.lead_id = leads.id
        and allocation.buyer_organisation_id = public.current_organisation_id()
        and allocation.status in ('reserved', 'accepted', 'disputed')
    )
  );
create policy "compliance auditors view leads"
  on public.leads for select
  using (public.is_compliance_auditor());

create policy "compliance auditors view consents"
  on public.lead_consents for select
  using (public.is_compliance_auditor());

drop policy if exists "organisations view own allocations" on public.lead_allocations;
create policy "organisations view scoped allocations"
  on public.lead_allocations for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or buyer_organisation_id = public.current_organisation_id()
  );

create policy "compliance auditors view audit logs"
  on public.audit_logs for select
  using (public.is_compliance_auditor());
create policy "broker organisations view own audit logs"
  on public.audit_logs for select
  using (details ->> 'buyerOrganisationId' = public.current_organisation_id()::text);

create policy "platform admins manage sending identities"
  on public.broker_sending_identities for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy "members view own sending identities"
  on public.broker_sending_identities for select
  using (organisation_id = public.current_organisation_id());
create policy "compliance auditors view sending identities"
  on public.broker_sending_identities for select
  using (public.is_compliance_auditor());

create policy "platform reviewers view match evaluations"
  on public.lead_match_evaluations for select
  using (public.is_platform_admin() or public.is_compliance_auditor());
create policy "broker organisations view own match evaluations"
  on public.lead_match_evaluations for select
  using (buyer_organisation_id = public.current_organisation_id());

revoke all on public.broker_sending_identities, public.lead_match_evaluations
  from public, anon, authenticated;
grant select on public.broker_sending_identities, public.lead_match_evaluations
  to authenticated;

create or replace function public.evaluate_lead_buyer_match(
  p_lead_id uuid,
  p_buyer_id uuid,
  p_source text default 'platform'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_lead public.leads%rowtype;
  selected_buyer public.organisations%rowtype;
  selected_preference public.buyer_preferences%rowtype;
  reasons text[] := '{}';
  allocated_today integer := 0;
  is_match boolean;
begin
  if auth.role() <> 'service_role' and not public.is_platform_admin() then
    raise exception 'Only platform administrators may evaluate marketplace matches' using errcode = '42501';
  end if;

  select * into selected_lead from public.leads where id = p_lead_id;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;

  select * into selected_buyer
  from public.organisations
  where id = p_buyer_id and organisation_type in ('broker', 'insurer');
  if not found then raise exception 'Approved buyer not found' using errcode = 'P0002'; end if;

  select * into selected_preference
  from public.buyer_preferences
  where organisation_id = p_buyer_id;

  if selected_buyer.status <> 'active' or selected_buyer.onboarding_status <> 'approved' then
    reasons := array_append(reasons, 'Buyer organisation is not approved and active');
  end if;
  if selected_preference.organisation_id is null then
    reasons := array_append(reasons, 'Buyer appetite is not configured');
  else
    if selected_lead.score < selected_preference.minimum_score then
      reasons := array_append(reasons, 'Lead score is below the approved minimum');
    end if;
    if cardinality(selected_preference.provinces) > 0
      and not selected_lead.province = any(selected_preference.provinces) then
      reasons := array_append(reasons, 'Lead province is outside the approved territory');
    end if;
    if cardinality(selected_preference.cities) > 0
      and not selected_lead.city = any(selected_preference.cities) then
      reasons := array_append(reasons, 'Lead city is outside the approved territory');
    end if;
    if cardinality(selected_preference.industries) > 0
      and (selected_lead.industry is null or not selected_lead.industry = any(selected_preference.industries)) then
      reasons := array_append(reasons, 'Lead industry is outside the approved appetite');
    end if;
    if cardinality(selected_preference.insurance_products) > 0
      and not selected_lead.insurance_products && selected_preference.insurance_products then
      reasons := array_append(reasons, 'No selected insurance product matches the approved appetite');
    end if;

    select count(*) into allocated_today
    from public.lead_allocations
    where buyer_organisation_id = p_buyer_id
      and status <> 'released'
      and allocated_at >= date_trunc('day', now());
    if allocated_today >= selected_preference.daily_lead_capacity then
      reasons := array_append(reasons, 'Daily lead capacity has been reached');
    end if;
  end if;

  is_match := cardinality(reasons) = 0;
  insert into public.lead_match_evaluations (
    lead_id, buyer_organisation_id, matched, reasons, source, evaluated_by
  ) values (
    p_lead_id, p_buyer_id, is_match, reasons, left(coalesce(p_source, 'platform'), 100), auth.uid()
  );

  return jsonb_build_object(
    'leadId', p_lead_id,
    'buyerId', p_buyer_id,
    'matched', is_match,
    'reasons', to_jsonb(reasons)
  );
end;
$$;

revoke all on function public.evaluate_lead_buyer_match(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.evaluate_lead_buyer_match(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.respond_to_lead_allocation(
  p_allocation_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  selected_allocation public.lead_allocations%rowtype;
  next_status public.allocation_status;
begin
  if p_decision not in ('accepted', 'released') then
    raise exception 'Decision must be accepted or released' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('broker_admin', 'broker_agent') then
    raise exception 'Only an active broker operator may respond to an allocation' using errcode = '42501';
  end if;

  select * into selected_allocation
  from public.lead_allocations
  where id = p_allocation_id
  for update;
  if not found then raise exception 'Allocation not found' using errcode = 'P0002'; end if;
  if selected_allocation.buyer_organisation_id <> acting_profile.organisation_id then
    raise exception 'Allocation belongs to another organisation' using errcode = '42501';
  end if;
  if selected_allocation.status <> 'reserved' then
    raise exception 'Only reserved allocations may be accepted or released' using errcode = '22023';
  end if;

  next_status := p_decision::public.allocation_status;
  update public.lead_allocations
  set status = next_status,
      accepted_at = case when next_status = 'accepted' then now() else accepted_at end,
      responded_at = now(),
      response_by = auth.uid()
  where id = p_allocation_id;

  if next_status = 'accepted' then
    update public.leads
    set assigned_broker = auth.uid(), updated_at = now()
    where id = selected_allocation.lead_id;
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'assignment', p_allocation_id, 'allocation_' || next_status::text,
    coalesce(auth.jwt() ->> 'email', 'broker_user'),
    jsonb_build_object(
      'leadId', selected_allocation.lead_id,
      'buyerOrganisationId', selected_allocation.buyer_organisation_id,
      'decision', next_status
    )
  );

  return jsonb_build_object(
    'allocationId', p_allocation_id,
    'leadId', selected_allocation.lead_id,
    'status', next_status
  );
end;
$$;

revoke all on function public.respond_to_lead_allocation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.respond_to_lead_allocation(uuid, text)
  to authenticated;

create or replace function public.reserve_lead_for_buyer(
  p_lead_id uuid,
  p_buyer_id uuid,
  p_price_cents integer,
  p_exclusive boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_lead public.leads%rowtype;
  selected_consent public.lead_consents%rowtype;
  selected_preference public.buyer_preferences%rowtype;
  selected_buyer public.organisations%rowtype;
  active_count integer;
  allocated_today integer;
  has_exclusive boolean;
  new_allocation_id uuid;
begin
  if auth.role() <> 'service_role' and not public.is_platform_admin() then
    raise exception 'Only platform administrators may reserve leads' using errcode = '42501';
  end if;
  if p_price_cents < 0 then
    raise exception 'Price must not be negative' using errcode = '22023';
  end if;

  select * into selected_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if selected_lead.do_not_contact then raise exception 'Lead is marked do not contact' using errcode = '22023'; end if;

  select * into selected_consent
  from public.lead_consents
  where lead_id = p_lead_id and withdrawn_at is null
  order by consented_at desc limit 1;
  if not found or not selected_consent.contact_consent or not selected_consent.partner_sharing_consent then
    raise exception 'Partner-sharing consent is not recorded' using errcode = '22023';
  end if;

  select * into selected_buyer
  from public.organisations
  where id = p_buyer_id
    and status = 'active'
    and onboarding_status = 'approved'
    and organisation_type in ('broker', 'insurer');
  if not found then raise exception 'Approved buyer not found' using errcode = 'P0002'; end if;

  select * into selected_preference
  from public.buyer_preferences
  where organisation_id = p_buyer_id;
  if not found then raise exception 'Buyer appetite is not configured' using errcode = 'P0002'; end if;

  if selected_lead.score < selected_preference.minimum_score
    or (cardinality(selected_preference.provinces) > 0 and not selected_lead.province = any(selected_preference.provinces))
    or (cardinality(selected_preference.cities) > 0 and not selected_lead.city = any(selected_preference.cities))
    or (cardinality(selected_preference.industries) > 0
      and (selected_lead.industry is null or not selected_lead.industry = any(selected_preference.industries)))
    or (cardinality(selected_preference.insurance_products) > 0
      and not selected_lead.insurance_products && selected_preference.insurance_products) then
    raise exception 'Lead does not match the buyer appetite' using errcode = '22023';
  end if;
  if not p_exclusive and not selected_preference.accepts_shared_leads then
    raise exception 'Buyer does not accept shared leads' using errcode = '22023';
  end if;

  select count(*) into allocated_today
  from public.lead_allocations
  where buyer_organisation_id = p_buyer_id
    and status <> 'released'
    and allocated_at >= date_trunc('day', now());
  if allocated_today >= selected_preference.daily_lead_capacity then
    raise exception 'Buyer daily lead capacity has been reached' using errcode = '22023';
  end if;

  select count(*), coalesce(bool_or(exclusive), false)
    into active_count, has_exclusive
  from public.lead_allocations
  where lead_id = p_lead_id and status <> 'released';
  if active_count >= selected_consent.max_partner_recipients then
    raise exception 'Consent recipient limit reached' using errcode = '22023';
  end if;
  if has_exclusive or (p_exclusive and active_count > 0) then
    raise exception 'Lead already has an incompatible active allocation' using errcode = '22023';
  end if;

  insert into public.lead_allocations (lead_id, buyer_organisation_id, price_cents, exclusive)
  values (p_lead_id, p_buyer_id, p_price_cents, p_exclusive)
  returning id into new_allocation_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'assignment', new_allocation_id, 'lead_reserved',
    coalesce(auth.jwt() ->> 'email', 'mcp_service'),
    jsonb_build_object('leadId', p_lead_id, 'buyerOrganisationId', p_buyer_id, 'exclusive', p_exclusive)
  );
  return new_allocation_id;
end;
$$;

revoke all on function public.reserve_lead_for_buyer(uuid, uuid, integer, boolean)
  from public, anon;
grant execute on function public.reserve_lead_for_buyer(uuid, uuid, integer, boolean)
  to authenticated, service_role;
