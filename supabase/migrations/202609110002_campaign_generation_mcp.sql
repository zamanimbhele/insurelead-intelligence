-- Tenant-scoped campaign generation and delivery controls.
-- Content generation is versioned and separate from approval and launch.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 120),
  objective text not null check (objective in (
    'awareness', 'renewal_reminder', 'cross_sell', 'quote_follow_up', 'seasonal'
  )),
  insurance_products text[] not null check (cardinality(insurance_products) > 0),
  audience_rules jsonb not null default '{}'::jsonb,
  contact_basis text not null default 'marketing_consent'
    check (contact_basis = 'marketing_consent'),
  sending_identity_id uuid references public.broker_sending_identities(id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'pending_review', 'approved', 'scheduled', 'sending',
    'paused', 'completed', 'failed', 'cancelled'
  )),
  current_content_version integer,
  approved_content_version integer,
  created_by_label text not null,
  approved_by_label text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  launched_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_content_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  subject text not null check (char_length(trim(subject)) between 1 and 150),
  preheader text not null default '',
  html_body text not null,
  text_body text not null,
  generated_by_label text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, version_number)
);

create table if not exists public.campaign_approvals (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_version_id uuid not null references public.campaign_content_versions(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_by_label text not null,
  attestation text not null,
  approved_at timestamptz not null default now(),
  unique (campaign_id, content_version_id)
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete restrict,
  status text not null default 'queued' check (status in (
    'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed'
  )),
  exclusion_reason text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create table if not exists public.campaign_delivery_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_id uuid references public.campaign_recipients(id) on delete set null,
  event_type text not null check (event_type in (
    'draft_created', 'content_generated', 'validation_completed', 'test_sent',
    'approved', 'launch_started', 'recipient_sent', 'recipient_failed',
    'paused', 'completed', 'recipient_unsubscribed'
  )),
  actor_label text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.marketing_suppressions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('recipient_request', 'bounce', 'complaint', 'manual')),
  source_campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organisation_id, email_hash)
);

create index if not exists campaigns_organisation_status_idx
  on public.campaigns (organisation_id, status, created_at desc);
create index if not exists campaign_recipients_campaign_status_idx
  on public.campaign_recipients (campaign_id, status);
create index if not exists campaign_delivery_events_campaign_idx
  on public.campaign_delivery_events (campaign_id, occurred_at desc);
create index if not exists marketing_suppressions_organisation_idx
  on public.marketing_suppressions (organisation_id, email_hash);

alter table public.campaigns enable row level security;
alter table public.campaign_content_versions enable row level security;
alter table public.campaign_approvals enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_delivery_events enable row level security;
alter table public.marketing_suppressions enable row level security;

create or replace function public.can_manage_campaigns(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or (
      public.current_organisation_id() = p_organisation_id
      and public.current_profile_role() in ('broker_admin', 'campaign_manager')
    )
$$;

create or replace function public.can_approve_campaigns(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or (
      public.current_organisation_id() = p_organisation_id
      and public.current_profile_role() = 'broker_admin'
    )
$$;

create policy "campaign viewers use tenant scope"
  on public.campaigns for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or organisation_id = public.current_organisation_id()
  );
create policy "campaign managers create tenant campaigns"
  on public.campaigns for insert
  with check (
    public.can_manage_campaigns(organisation_id)
    and exists (
      select 1
      from public.organisations organisation
      join public.buyer_preferences preference on preference.organisation_id = organisation.id
      where organisation.id = campaigns.organisation_id
        and organisation.status = 'active'
        and organisation.onboarding_status = 'approved'
        and preference.accepts_campaigns
        and campaigns.insurance_products <@ preference.insurance_products
    )
    and exists (
      select 1 from public.broker_sending_identities identity
      where identity.id = campaigns.sending_identity_id
        and identity.organisation_id = campaigns.organisation_id
    )
    and status = 'draft'
    and current_content_version is null
    and approved_content_version is null
    and approved_by_label is null
    and approved_at is null
    and launched_at is null
  );
create policy "campaign managers update tenant campaigns"
  on public.campaigns for update
  using (public.can_manage_campaigns(organisation_id))
  with check (public.can_manage_campaigns(organisation_id));

create policy "campaign content viewers use tenant scope"
  on public.campaign_content_versions for select
  using (exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_content_versions.campaign_id
      and (
        public.is_platform_admin()
        or public.is_compliance_auditor()
        or campaign.organisation_id = public.current_organisation_id()
      )
  ));
create policy "campaign managers add tenant content"
  on public.campaign_content_versions for insert
  with check (exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_content_versions.campaign_id
      and public.can_manage_campaigns(campaign.organisation_id)
  ));

create policy "campaign approval viewers use tenant scope"
  on public.campaign_approvals for select
  using (exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_approvals.campaign_id
      and (
        public.is_platform_admin()
        or public.is_compliance_auditor()
        or campaign.organisation_id = public.current_organisation_id()
      )
  ));
create policy "campaign approvers approve tenant campaigns"
  on public.campaign_approvals for insert
  with check (exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_approvals.campaign_id
      and public.can_approve_campaigns(campaign.organisation_id)
  ));

create policy "campaign recipient viewers use tenant scope"
  on public.campaign_recipients for select
  using (exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_recipients.campaign_id
      and (
        public.is_platform_admin()
        or public.is_compliance_auditor()
        or campaign.organisation_id = public.current_organisation_id()
      )
  ));

create policy "campaign event viewers use tenant scope"
  on public.campaign_delivery_events for select
  using (exists (
    select 1 from public.campaigns campaign
    where campaign.id = campaign_delivery_events.campaign_id
      and (
        public.is_platform_admin()
        or public.is_compliance_auditor()
        or campaign.organisation_id = public.current_organisation_id()
      )
  ));

create policy "suppression viewers use tenant scope"
  on public.marketing_suppressions for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or organisation_id = public.current_organisation_id()
  );
create policy "campaign managers add tenant suppressions"
  on public.marketing_suppressions for insert
  with check (public.can_manage_campaigns(organisation_id));

revoke all on public.campaigns, public.campaign_content_versions, public.campaign_approvals,
  public.campaign_recipients, public.campaign_delivery_events, public.marketing_suppressions
  from public, anon, authenticated;
grant select on public.campaigns, public.campaign_content_versions, public.campaign_approvals,
  public.campaign_recipients, public.campaign_delivery_events, public.marketing_suppressions
  to authenticated;
grant insert on public.campaigns, public.marketing_suppressions to authenticated;

create or replace function public.reject_campaign_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Campaign content, approval, and delivery history is immutable'
    using errcode = '55000';
end;
$$;

create trigger campaign_content_versions_immutable
  before update or delete on public.campaign_content_versions
  for each row execute function public.reject_campaign_history_mutation();
create trigger campaign_approvals_immutable
  before update or delete on public.campaign_approvals
  for each row execute function public.reject_campaign_history_mutation();
create trigger campaign_delivery_events_immutable
  before update or delete on public.campaign_delivery_events
  for each row execute function public.reject_campaign_history_mutation();

create or replace function public.save_campaign_content_version(
  p_campaign_id uuid,
  p_subject text,
  p_preheader text,
  p_html_body text,
  p_text_body text,
  p_generated_by_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_campaign public.campaigns%rowtype;
  next_version integer;
  new_content_id uuid;
begin
  select * into selected_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  if auth.role() <> 'service_role' and not public.can_manage_campaigns(selected_campaign.organisation_id) then
    raise exception 'Campaign belongs to another tenant' using errcode = '42501';
  end if;
  if selected_campaign.status in ('sending', 'completed', 'cancelled') then
    raise exception 'Campaign content can no longer be changed' using errcode = '22023';
  end if;
  if char_length(trim(p_subject)) not between 1 and 150 then
    raise exception 'Campaign subject must be between 1 and 150 characters' using errcode = '22023';
  end if;
  if position('{{unsubscribe_url}}' in p_html_body) = 0
    or position('{{unsubscribe_url}}' in p_text_body) = 0 then
    raise exception 'Campaign content must include an unsubscribe link' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.campaign_content_versions where campaign_id = p_campaign_id;
  insert into public.campaign_content_versions (
    campaign_id, version_number, subject, preheader, html_body, text_body, generated_by_label
  ) values (
    p_campaign_id, next_version, p_subject, coalesce(p_preheader, ''),
    p_html_body, p_text_body, p_generated_by_label
  ) returning id into new_content_id;

  update public.campaigns set
    current_content_version = next_version,
    approved_content_version = null,
    approved_by_label = null,
    approved_at = null,
    status = 'draft',
    updated_at = now()
  where id = p_campaign_id;

  insert into public.campaign_delivery_events (campaign_id, event_type, actor_label, details)
  values (
    p_campaign_id, 'content_generated', p_generated_by_label,
    jsonb_build_object('contentVersion', next_version)
  );
  return jsonb_build_object('id', new_content_id, 'version', next_version);
end;
$$;

revoke all on function public.save_campaign_content_version(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_campaign_content_version(uuid, text, text, text, text, text)
  to authenticated, service_role;

create or replace function public.approve_campaign_content(
  p_campaign_id uuid,
  p_content_version_id uuid,
  p_approved_by_label text,
  p_attestation text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_campaign public.campaigns%rowtype;
  selected_version integer;
  approval_time timestamptz := now();
begin
  select * into selected_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  if auth.role() <> 'service_role' and not public.can_approve_campaigns(selected_campaign.organisation_id) then
    raise exception 'Campaign approval is not permitted' using errcode = '42501';
  end if;
  if selected_campaign.status not in ('draft', 'pending_review') then
    raise exception 'Only a draft or pending-review campaign can be approved' using errcode = '22023';
  end if;
  if p_attestation <> 'I approve this campaign for delivery' then
    raise exception 'Exact campaign approval attestation is required' using errcode = '22023';
  end if;

  select version_number into selected_version
  from public.campaign_content_versions
  where id = p_content_version_id and campaign_id = p_campaign_id;
  if not found or selected_version is distinct from selected_campaign.current_content_version then
    raise exception 'Approval must reference the current campaign content version' using errcode = '22023';
  end if;

  insert into public.campaign_approvals (
    campaign_id, content_version_id, approved_by, approved_by_label, attestation, approved_at
  ) values (
    p_campaign_id, p_content_version_id, auth.uid(), p_approved_by_label, p_attestation, approval_time
  )
  on conflict (campaign_id, content_version_id) do nothing;

  update public.campaigns set
    status = 'approved',
    approved_content_version = selected_version,
    approved_by_label = p_approved_by_label,
    approved_at = approval_time,
    updated_at = approval_time
  where id = p_campaign_id;
end;
$$;

revoke all on function public.approve_campaign_content(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_campaign_content(uuid, uuid, text, text)
  to authenticated, service_role;

create or replace function public.prepare_campaign_recipients(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  selected_campaign public.campaigns%rowtype;
  prepared_count integer;
begin
  select * into selected_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  if auth.role() <> 'service_role' and not public.can_manage_campaigns(selected_campaign.organisation_id) then
    raise exception 'Campaign belongs to another tenant' using errcode = '42501';
  end if;
  if selected_campaign.status not in ('approved', 'sending', 'paused')
    or selected_campaign.approved_content_version is distinct from selected_campaign.current_content_version then
    raise exception 'Campaign must have approval for its current content version' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.organisations organisation
    join public.buyer_preferences preference on preference.organisation_id = organisation.id
    where organisation.id = selected_campaign.organisation_id
      and organisation.status = 'active'
      and organisation.onboarding_status = 'approved'
      and preference.accepts_campaigns
      and selected_campaign.insurance_products <@ preference.insurance_products
  ) then
    raise exception 'Broker or product campaign permission is no longer valid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.broker_sending_identities identity
    where identity.id = selected_campaign.sending_identity_id
      and identity.organisation_id = selected_campaign.organisation_id
      and identity.status = 'verified'
  ) then
    raise exception 'Verified tenant sending identity is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.campaign_content_versions content
    join public.campaign_approvals approval
      on approval.campaign_id = content.campaign_id
      and approval.content_version_id = content.id
    where content.campaign_id = selected_campaign.id
      and content.version_number = selected_campaign.current_content_version
  ) then
    raise exception 'Immutable approval record for current content is required' using errcode = '22023';
  end if;

  insert into public.campaign_recipients (campaign_id, lead_id)
  select selected_campaign.id, lead.id
  from public.leads lead
  where not lead.do_not_contact
    and lead.insurance_products && selected_campaign.insurance_products
    and exists (
      select 1 from public.lead_allocations allocation
      where allocation.lead_id = lead.id
        and allocation.buyer_organisation_id = selected_campaign.organisation_id
        and allocation.status = 'accepted'
    )
    and exists (
      select 1 from public.lead_consents consent
      where consent.lead_id = lead.id
        and consent.marketing_consent
        and consent.withdrawn_at is null
    )
    and not exists (
      select 1 from public.marketing_suppressions suppression
      where suppression.organisation_id = selected_campaign.organisation_id
        and suppression.email_hash = encode(digest(lower(trim(lead.contact_email)), 'sha256'), 'hex')
    )
    and (
      coalesce(jsonb_array_length(selected_campaign.audience_rules -> 'applicantTypes'), 0) = 0
      or lead.applicant_type in (
        select jsonb_array_elements_text(selected_campaign.audience_rules -> 'applicantTypes')
      )
    )
    and (
      coalesce(jsonb_array_length(selected_campaign.audience_rules -> 'provinces'), 0) = 0
      or lead.province in (
        select jsonb_array_elements_text(selected_campaign.audience_rules -> 'provinces')
      )
    )
    and (
      coalesce(jsonb_array_length(selected_campaign.audience_rules -> 'cities'), 0) = 0
      or lead.city in (
        select jsonb_array_elements_text(selected_campaign.audience_rules -> 'cities')
      )
    )
    and (
      coalesce(jsonb_array_length(selected_campaign.audience_rules -> 'industries'), 0) = 0
      or lead.industry in (
        select jsonb_array_elements_text(selected_campaign.audience_rules -> 'industries')
      )
    )
    and lead.score >= coalesce((selected_campaign.audience_rules ->> 'minimumScore')::integer, 0)
  on conflict (campaign_id, lead_id) do nothing;

  get diagnostics prepared_count = row_count;
  return prepared_count;
end;
$$;

revoke all on function public.prepare_campaign_recipients(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_campaign_recipients(uuid)
  to authenticated, service_role;
