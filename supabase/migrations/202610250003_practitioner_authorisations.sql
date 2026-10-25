-- Per-person authorisation (individual advisors plan, phase 3).
--
-- Selling a product needs the right licence or accreditation. Each person
-- records what they are authorised for, per product category, with the
-- evidence (FSP licence, representative appointment, CMS accreditation,
-- NCR registration, bank mandate). Platform admins verify each claim.
-- An organisation may sell a category while at least one active member
-- holds a verified, unexpired authorisation for it.
--
-- Enforced in the database, not only in screens:
--   - broker appetite (update_buyer_preferences) only within authorised
--     categories;
--   - a lead can only be allocated to an organisation authorised for at
--     least one of its products (trigger on lead_allocations);
--   - a campaign can only be created for, approved for, or (re)started on
--     authorised products (trigger on campaigns);
--   - match evaluations give the reason.
--
-- PLACEHOLDERS: the evidence guidance per category and the representative
-- disclosure wording below are common-practice demo text, marked
-- `guidance_is_placeholder` / "PLACEHOLDER". They must be confirmed by a
-- compliance officer before go-live.

-- 1. What evidence each category accepts (placeholder guidance) ----------
alter table public.product_categories
  add column if not exists accepted_evidence text[] not null default '{}',
  add column if not exists evidence_guidance text not null default '',
  add column if not exists guidance_is_placeholder boolean not null default true;

update public.product_categories set
  accepted_evidence = array['fsp_licence', 'representative_appointment'],
  evidence_guidance = 'Your own FSP licence number if you are licensed for short-term insurance, or the name and FSP number of the financial services provider that appointed you as its representative. Representatives should appear on the FSCA register under that FSP.'
where id = 'short_term_insurance' and guidance_is_placeholder;

update public.product_categories set
  accepted_evidence = array['fsp_licence', 'representative_appointment'],
  evidence_guidance = 'Your own FSP licence number if you are licensed for long-term insurance (life, funeral and disability cover), or the name and FSP number of the financial services provider that appointed you as its representative.'
where id = 'long_term_insurance' and guidance_is_placeholder;

update public.product_categories set
  accepted_evidence = array['fsp_licence', 'representative_appointment'],
  evidence_guidance = 'Your FSP licence number, or the FSP you represent, showing authorisation for investment products such as unit trusts and retirement annuities. Investment categories usually carry extra experience and qualification requirements.'
where id = 'investments' and guidance_is_placeholder;

update public.product_categories set
  accepted_evidence = array['cms_accreditation'],
  evidence_guidance = 'Your broker accreditation number from the Council for Medical Schemes, and the FSP you act for. Medical aid also requires FAIS authorisation for health service benefits.'
where id = 'medical_schemes' and guidance_is_placeholder;

update public.product_categories set
  accepted_evidence = array['ncr_registration', 'bank_mandate'],
  evidence_guidance = 'Your National Credit Regulator registration number, or the bank or credit provider that mandated you to offer its products.'
where id = 'banking_credit' and guidance_is_placeholder;

-- 2. Authorisations ---------------------------------------------------------
create table if not exists public.practitioner_authorisations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  category_id text not null references public.product_categories(id),
  evidence_type text not null check (evidence_type in (
    'fsp_licence', 'representative_appointment', 'cms_accreditation', 'ncr_registration', 'bank_mandate'
  )),
  reference_number text not null check (char_length(reference_number) between 2 and 60),
  provider_name text check (provider_name is null or char_length(provider_name) <= 160),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'revoked', 'withdrawn')),
  expires_on date,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open claim (pending or verified) per person and category.
create unique index if not exists practitioner_authorisations_open_idx
  on public.practitioner_authorisations (profile_id, category_id)
  where status in ('pending', 'verified');
create index if not exists practitioner_authorisations_org_idx
  on public.practitioner_authorisations (organisation_id, status);

alter table public.practitioner_authorisations enable row level security;
revoke all on public.practitioner_authorisations from public, anon, authenticated;
grant select on public.practitioner_authorisations to authenticated;

drop policy if exists "authorisations visible to holder, their admin and platform staff" on public.practitioner_authorisations;
create policy "authorisations visible to holder, their admin and platform staff"
  on public.practitioner_authorisations for select
  using (
    profile_id = auth.uid()
    or public.is_platform_admin()
    or public.is_compliance_auditor()
    or (organisation_id = public.current_organisation_id() and public.current_profile_role() = 'broker_admin')
  );

-- 3. What an organisation may sell -------------------------------------------
create or replace function public.organisation_authorised_categories(p_organisation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct authorisation.category_id order by authorisation.category_id), '{}')
  from public.practitioner_authorisations authorisation
  join public.profiles holder on holder.id = authorisation.profile_id
  where holder.organisation_id = p_organisation_id
    and holder.member_status = 'active'
    and authorisation.status = 'verified'
    and (authorisation.expires_on is null or authorisation.expires_on >= current_date);
$$;

create or replace function public.organisation_authorised_products(p_organisation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(product.id order by product.id), '{}')
  from public.insurance_products product
  where product.category_id = any(public.organisation_authorised_categories(p_organisation_id));
$$;

revoke all on function public.organisation_authorised_categories(uuid) from public, anon;
revoke all on function public.organisation_authorised_products(uuid) from public, anon;
grant execute on function public.organisation_authorised_categories(uuid) to authenticated, service_role;
grant execute on function public.organisation_authorised_products(uuid) to authenticated, service_role;

-- 4. Claiming, reviewing and withdrawing ------------------------------------
create or replace function public.submit_authorisation(
  p_category_id text,
  p_evidence_type text,
  p_reference_number text,
  p_provider_name text default null,
  p_evidence_note text default null,
  p_expires_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  selected_category public.product_categories%rowtype;
  clean_reference text := nullif(trim(coalesce(p_reference_number, '')), '');
  new_id uuid;
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.organisation_id is null
    or acting_profile.role not in ('broker_admin', 'broker_agent', 'campaign_manager') then
    raise exception 'Only an active broker or advisor may record an authorisation' using errcode = '42501';
  end if;

  select * into selected_category from public.product_categories where id = p_category_id;
  if not found or selected_category.status = 'retired' then
    raise exception 'Product category not found' using errcode = 'P0002';
  end if;
  if not p_evidence_type = any(selected_category.accepted_evidence) then
    raise exception 'That evidence is not accepted for this category' using errcode = '22023';
  end if;
  if clean_reference is null or char_length(clean_reference) not between 2 and 60 then
    raise exception 'A reference number is required' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on < current_date then
    raise exception 'The expiry date has already passed' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.practitioner_authorisations
    where profile_id = acting_profile.id and category_id = p_category_id and status in ('pending', 'verified')
  ) then
    raise exception 'You already have a pending or verified authorisation for this category' using errcode = '23505';
  end if;

  insert into public.practitioner_authorisations (
    profile_id, organisation_id, category_id, evidence_type, reference_number,
    provider_name, evidence_note, expires_on
  ) values (
    acting_profile.id, acting_profile.organisation_id, p_category_id, p_evidence_type, clean_reference,
    nullif(trim(coalesce(p_provider_name, '')), ''), nullif(trim(coalesce(p_evidence_note, '')), ''), p_expires_on
  )
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'authorisation', new_id, 'authorisation_submitted',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('categoryId', p_category_id, 'evidenceType', p_evidence_type, 'organisationId', acting_profile.organisation_id)
  );

  return jsonb_build_object('id', new_id, 'status', 'pending');
end;
$$;

create or replace function public.review_authorisation(
  p_authorisation_id uuid,
  p_decision text,
  p_note text default null,
  p_expires_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  selected public.practitioner_authorisations%rowtype;
  next_status text;
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may review authorisations' using errcode = '42501';
  end if;
  if p_decision not in ('verify', 'reject', 'revoke') then
    raise exception 'Decision must be verify, reject or revoke' using errcode = '22023';
  end if;

  select * into selected from public.practitioner_authorisations where id = p_authorisation_id for update;
  if not found then raise exception 'Authorisation not found' using errcode = 'P0002'; end if;

  if p_decision in ('verify', 'reject') and selected.status <> 'pending' then
    raise exception 'Only a pending authorisation can be verified or rejected' using errcode = '22023';
  end if;
  if p_decision = 'revoke' and selected.status <> 'verified' then
    raise exception 'Only a verified authorisation can be revoked' using errcode = '22023';
  end if;
  if p_decision in ('reject', 'revoke') and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Give a reason the holder will see' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on < current_date then
    raise exception 'The expiry date has already passed' using errcode = '22023';
  end if;

  next_status := case p_decision when 'verify' then 'verified' when 'reject' then 'rejected' else 'revoked' end;

  update public.practitioner_authorisations set
    status = next_status,
    expires_on = coalesce(p_expires_on, expires_on),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_authorisation_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'authorisation', p_authorisation_id, 'authorisation_' || next_status,
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('categoryId', selected.category_id, 'organisationId', selected.organisation_id,
      'from', selected.status, 'to', next_status, 'note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return jsonb_build_object('id', p_authorisation_id, 'status', next_status);
end;
$$;

create or replace function public.withdraw_authorisation(p_authorisation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected public.practitioner_authorisations%rowtype;
begin
  select * into selected from public.practitioner_authorisations where id = p_authorisation_id for update;
  if not found or selected.profile_id <> auth.uid() then
    raise exception 'Authorisation not found' using errcode = 'P0002';
  end if;
  if selected.status not in ('pending', 'verified') then
    raise exception 'Only a pending or verified authorisation can be withdrawn' using errcode = '22023';
  end if;

  update public.practitioner_authorisations
  set status = 'withdrawn', updated_at = now()
  where id = p_authorisation_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'authorisation', p_authorisation_id, 'authorisation_withdrawn',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('categoryId', selected.category_id, 'from', selected.status)
  );
  return jsonb_build_object('id', p_authorisation_id, 'status', 'withdrawn');
end;
$$;

revoke all on function public.submit_authorisation(text, text, text, text, text, date) from public, anon, authenticated;
revoke all on function public.review_authorisation(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.withdraw_authorisation(uuid) from public, anon, authenticated;
grant execute on function public.submit_authorisation(text, text, text, text, text, date) to authenticated;
grant execute on function public.review_authorisation(uuid, text, text, date) to authenticated;
grant execute on function public.withdraw_authorisation(uuid) to authenticated;

-- 5. Enforcement --------------------------------------------------------------
-- 5a. Appetite stays within authorised categories.
create or replace function public.update_buyer_preferences(
  p_organisation_id uuid,
  p_insurance_products text[],
  p_provinces text[],
  p_minimum_score integer,
  p_daily_lead_capacity integer,
  p_accepts_campaigns boolean,
  p_accepts_shared_leads boolean,
  p_campaign_daily_send_limit integer default null,
  p_campaign_monthly_send_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_org public.organisations%rowtype;
  previous public.buyer_preferences%rowtype;
  allowed_provinces constant text[] := array[
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
  ];
  clean_products text[] := coalesce(array(select distinct unnest(p_insurance_products) order by 1), '{}');
  clean_provinces text[] := coalesce(array(select distinct unnest(p_provinces) order by 1), '{}');
  next_daily_limit integer;
  next_monthly_limit integer;
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may change a broker''s appetite' using errcode = '42501';
  end if;

  select * into target_org from public.organisations where id = p_organisation_id;
  if not found or target_org.organisation_type not in ('broker', 'insurer') then
    raise exception 'Broker organisation not found' using errcode = 'P0002';
  end if;

  -- The catalogue table is the one list of products (was a copy of it).
  if exists (
    select 1 from unnest(clean_products) requested(id)
    left join public.insurance_products product on product.id = requested.id
    where product.id is null or product.status <> 'active'
  ) then
    raise exception 'Insurance product is not recognised' using errcode = '22023';
  end if;
  -- Phase 3: a broker can only be approved for products in categories
  -- someone in the organisation is verified to sell.
  if not (clean_products <@ public.organisation_authorised_products(p_organisation_id)) then
    raise exception 'The broker is not authorised for one or more of these products' using errcode = '22023';
  end if;
  if not (clean_provinces <@ allowed_provinces) then
    raise exception 'Province is not recognised' using errcode = '22023';
  end if;
  if p_minimum_score is null or p_minimum_score not between 0 and 100 then
    raise exception 'Minimum score must be between 0 and 100' using errcode = '22023';
  end if;
  if p_daily_lead_capacity is null or p_daily_lead_capacity not between 1 and 1000 then
    raise exception 'Daily lead capacity must be between 1 and 1000' using errcode = '22023';
  end if;
  if coalesce(p_accepts_campaigns, false) and cardinality(clean_products) = 0 then
    raise exception 'Campaigns require at least one approved insurance product' using errcode = '22023';
  end if;

  select * into previous from public.buyer_preferences where organisation_id = p_organisation_id;

  next_daily_limit := coalesce(p_campaign_daily_send_limit, previous.campaign_daily_send_limit, 200);
  next_monthly_limit := coalesce(p_campaign_monthly_send_limit, previous.campaign_monthly_send_limit, 3000);
  if next_daily_limit not between 1 and 50000 then
    raise exception 'Daily campaign send limit must be between 1 and 50000' using errcode = '22023';
  end if;
  if next_monthly_limit not between 1 and 1000000 then
    raise exception 'Monthly campaign send limit must be between 1 and 1000000' using errcode = '22023';
  end if;
  if next_daily_limit > next_monthly_limit then
    raise exception 'Daily campaign send limit cannot exceed the monthly limit' using errcode = '22023';
  end if;

  insert into public.buyer_preferences (
    organisation_id, insurance_products, provinces, minimum_score,
    daily_lead_capacity, accepts_campaigns, accepts_shared_leads,
    campaign_daily_send_limit, campaign_monthly_send_limit, updated_at
  ) values (
    p_organisation_id, clean_products, clean_provinces, p_minimum_score,
    p_daily_lead_capacity, coalesce(p_accepts_campaigns, false), coalesce(p_accepts_shared_leads, false),
    next_daily_limit, next_monthly_limit, now()
  )
  on conflict (organisation_id) do update set
    insurance_products = excluded.insurance_products,
    provinces = excluded.provinces,
    minimum_score = excluded.minimum_score,
    daily_lead_capacity = excluded.daily_lead_capacity,
    accepts_campaigns = excluded.accepts_campaigns,
    accepts_shared_leads = excluded.accepts_shared_leads,
    campaign_daily_send_limit = excluded.campaign_daily_send_limit,
    campaign_monthly_send_limit = excluded.campaign_monthly_send_limit,
    updated_at = now();

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'organisation', p_organisation_id, 'buyer_preferences_updated',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object(
      'organisationName', target_org.name,
      'before', case when previous.organisation_id is null then null else jsonb_build_object(
        'insuranceProducts', previous.insurance_products,
        'provinces', previous.provinces,
        'minimumScore', previous.minimum_score,
        'dailyLeadCapacity', previous.daily_lead_capacity,
        'acceptsCampaigns', previous.accepts_campaigns,
        'acceptsSharedLeads', previous.accepts_shared_leads,
        'campaignDailySendLimit', previous.campaign_daily_send_limit,
        'campaignMonthlySendLimit', previous.campaign_monthly_send_limit
      ) end,
      'after', jsonb_build_object(
        'insuranceProducts', clean_products,
        'provinces', clean_provinces,
        'minimumScore', p_minimum_score,
        'dailyLeadCapacity', p_daily_lead_capacity,
        'acceptsCampaigns', coalesce(p_accepts_campaigns, false),
        'acceptsSharedLeads', coalesce(p_accepts_shared_leads, false),
        'campaignDailySendLimit', next_daily_limit,
        'campaignMonthlySendLimit', next_monthly_limit
      )
    )
  );

  return jsonb_build_object('organisationId', p_organisation_id, 'insuranceProducts', clean_products);
end;
$$;

revoke all on function public.update_buyer_preferences(uuid, text[], text[], integer, integer, boolean, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.update_buyer_preferences(uuid, text[], text[], integer, integer, boolean, boolean, integer, integer) to authenticated;

-- 5b. Match evaluations explain a missing authorisation.
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
    if not selected_lead.insurance_products && public.organisation_authorised_products(p_buyer_id) then
      reasons := array_append(reasons, 'Broker is not authorised for the lead''s products');
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

revoke all on function public.evaluate_lead_buyer_match(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.evaluate_lead_buyer_match(uuid, uuid, text) to authenticated, service_role;

-- 5c. Every new allocation, whichever path creates it.
create or replace function public.enforce_allocation_authorisation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lead_products text[];
begin
  select insurance_products into lead_products from public.leads where id = new.lead_id;
  if not coalesce(lead_products, '{}') && public.organisation_authorised_products(new.buyer_organisation_id) then
    raise exception 'Broker is not authorised for the lead''s products' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists lead_allocations_authorisation on public.lead_allocations;
create trigger lead_allocations_authorisation
  before insert on public.lead_allocations
  for each row execute function public.enforce_allocation_authorisation();

-- 5d. Campaigns: on creation, when products change, and when a campaign
-- moves into approved, scheduled or sending. Pausing, completing or
-- cancelling is never blocked, so a campaign can always be stopped.
create or replace function public.enforce_campaign_authorisation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
    or new.insurance_products is distinct from old.insurance_products
    or (new.status is distinct from old.status and new.status in ('approved', 'scheduled', 'sending')) then
    if not (new.insurance_products <@ public.organisation_authorised_products(new.organisation_id)) then
      raise exception 'Broker is not authorised for one or more of this campaign''s products' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_authorisation on public.campaigns;
create trigger campaigns_authorisation
  before insert or update of status, insurance_products on public.campaigns
  for each row execute function public.enforce_campaign_authorisation();

-- 6. Placeholder representative disclosure (used by phase 4) ---------------
alter table public.legal_text_documents drop constraint if exists legal_text_documents_document_key_check;
alter table public.legal_text_documents add constraint legal_text_documents_document_key_check check (document_key in (
  'privacy_notice', 'consent_wording', 'contact_permission_wording',
  'marketing_wording', 'fsp_disclosures', 'terms_of_use', 'data_retention_policy',
  'representative_disclosure'
));

insert into public.legal_text_documents (document_key, title, content)
values (
  'representative_disclosure',
  'Representative Disclosure (campaign footer)',
  E'PLACEHOLDER - confirm this wording with a compliance officer before go-live.\n\n{{advisor_name}} is a {{capacity}} of {{fsp_name}}, an authorised financial services provider (FSP {{fsp_number}}). Products are provided by the relevant product suppliers. This message is not financial advice; advice is given only after a needs analysis.'
)
on conflict (document_key) do nothing;
