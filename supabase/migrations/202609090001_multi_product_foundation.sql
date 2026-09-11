-- Multi-product foundation. Existing commercial enquiries are retained as
-- business-insurance leads and their original cover selections are preserved.

create table if not exists public.insurance_products (
  id text primary key,
  name text not null,
  description text not null default '',
  applicant_types text[] not null default '{}',
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_products_applicant_types_check
    check (applicant_types <@ array['individual', 'business']::text[])
);

insert into public.insurance_products (id, name, description, applicant_types, display_order)
values
  ('motor_insurance', 'Motor Insurance', 'Cover options for personal vehicles.', array['individual'], 10),
  ('home_contents_insurance', 'Home & Contents', 'Protection for a home and its contents.', array['individual'], 20),
  ('life_insurance', 'Life Insurance', 'Financial protection for the people who depend on you.', array['individual'], 30),
  ('funeral_cover', 'Funeral Cover', 'Cover intended to help with funeral expenses.', array['individual'], 40),
  ('travel_insurance', 'Travel Insurance', 'Cover options for domestic and international travel.', array['individual'], 50),
  ('personal_accident', 'Personal Accident', 'Cover options following specified accidental injury events.', array['individual'], 60),
  ('business_insurance', 'Business Insurance', 'Commercial cover options shaped around business risks.', array['business'], 70),
  ('general_insurance_review', 'Insurance Review', 'A general review when the applicant is unsure which product fits.', array['individual', 'business'], 80)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  applicant_types = excluded.applicant_types,
  display_order = excluded.display_order,
  updated_at = now();

alter table public.insurance_products enable row level security;

drop policy if exists "public views active insurance products" on public.insurance_products;
create policy "public views active insurance products"
  on public.insurance_products for select
  using (active);

drop policy if exists "platform admins manage insurance products" on public.insurance_products;
create policy "platform admins manage insurance products"
  on public.insurance_products for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.insurance_products from public, anon, authenticated;
grant select on public.insurance_products to anon, authenticated;
grant insert, update, delete on public.insurance_products to authenticated;

alter table public.leads
  add column if not exists applicant_type text not null default 'business',
  add column if not exists business_cover_interests text[] not null default '{}';

alter table public.leads
  drop constraint if exists leads_applicant_type_check;
alter table public.leads
  add constraint leads_applicant_type_check
  check (applicant_type in ('individual', 'business'));

alter table public.leads
  alter column business_name drop not null,
  alter column industry drop not null;

update public.leads
set
  applicant_type = 'business',
  business_cover_interests = insurance_products,
  insurance_products = array['business_insurance']
where not (insurance_products && array[
  'motor_insurance', 'home_contents_insurance', 'life_insurance', 'funeral_cover',
  'travel_insurance', 'personal_accident', 'business_insurance', 'general_insurance_review'
]::text[]);

alter table public.buyer_preferences
  add column if not exists insurance_products text[] not null default '{}';

update public.buyer_preferences
set insurance_products = array['business_insurance']
where cardinality(insurance_products) = 0;

create or replace function public.capture_public_lead(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lead_data jsonb := payload -> 'lead';
  consent_data jsonb := payload -> 'consent';
  new_lead_id uuid := coalesce(nullif(lead_data ->> 'id', '')::uuid, gen_random_uuid());
  selected_applicant_type text := coalesce(lead_data ->> 'applicantType', 'business');
begin
  if selected_applicant_type not in ('individual', 'business') then
    raise exception 'Invalid applicant type' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(lead_data -> 'insuranceProducts', '[]'::jsonb)) = 0 then
    raise exception 'At least one insurance product is required' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(lead_data -> 'insuranceProducts') requested(id)
    left join public.insurance_products product on product.id = requested.id
    where product.id is null
      or not product.active
      or not selected_applicant_type = any(product.applicant_types)
  ) then
    raise exception 'An insurance product does not match the applicant type' using errcode = '22023';
  end if;
  if selected_applicant_type = 'individual'
    and jsonb_array_length(coalesce(lead_data -> 'businessCoverInterests', '[]'::jsonb)) > 0 then
    raise exception 'Business cover areas are not valid for an individual enquiry' using errcode = '22023';
  end if;
  if selected_applicant_type = 'business'
    and coalesce(nullif(trim(lead_data ->> 'businessName'), ''), '') = '' then
    raise exception 'Business name is required for a business enquiry' using errcode = '22023';
  end if;
  if coalesce((consent_data ->> 'privacyNoticeAccepted')::boolean, false) is not true
    or coalesce((consent_data ->> 'contactConsent')::boolean, false) is not true
    or coalesce((consent_data ->> 'partnerSharingConsent')::boolean, false) is not true
    or coalesce((consent_data ->> 'accuracyConfirmed')::boolean, false) is not true
    or coalesce((consent_data ->> 'nonBindingAcknowledged')::boolean, false) is not true then
    raise exception 'Required consent is missing' using errcode = '22023';
  end if;

  insert into public.leads (
    id, applicant_type, business_name, trading_name, industry, business_type,
    employee_band, turnover_band, years_in_operation, province, city, suburb,
    postal_code, website, insurance_products, business_cover_interests,
    current_insurance_status, renewal_month, financial_year_end_month,
    main_concern, preferred_contact_time, preferred_contact_channel,
    contact_full_name, contact_role, contact_email, contact_mobile, status,
    score, score_band, score_explanation, campaign_source, utm, referrer,
    do_not_contact, created_at, updated_at
  ) values (
    new_lead_id, selected_applicant_type, nullif(lead_data ->> 'businessName', ''),
    nullif(lead_data ->> 'tradingName', ''), nullif(lead_data ->> 'industry', ''),
    nullif(lead_data ->> 'businessType', ''), nullif(lead_data ->> 'employeeBand', ''),
    nullif(lead_data ->> 'turnoverBand', ''), nullif(lead_data ->> 'yearsInOperation', ''),
    lead_data ->> 'province', lead_data ->> 'city', nullif(lead_data ->> 'suburb', ''),
    nullif(lead_data ->> 'postalCode', ''), nullif(lead_data ->> 'website', ''),
    coalesce(array(select jsonb_array_elements_text(lead_data -> 'insuranceProducts')), '{}'),
    coalesce(array(select jsonb_array_elements_text(lead_data -> 'businessCoverInterests')), '{}'),
    lead_data ->> 'currentInsuranceStatus', nullif(lead_data ->> 'renewalMonth', ''),
    nullif(lead_data ->> 'financialYearEndMonth', ''), nullif(lead_data ->> 'mainConcern', ''),
    nullif(lead_data ->> 'preferredContactTime', ''), lead_data ->> 'preferredContactChannel',
    lead_data ->> 'contactFullName', nullif(lead_data ->> 'contactRole', ''),
    lower(lead_data ->> 'contactEmail'), lead_data ->> 'contactMobile',
    coalesce(lead_data ->> 'status', 'new'), coalesce((lead_data ->> 'score')::integer, 0),
    coalesce(lead_data ->> 'scoreBand', 'low_priority'),
    coalesce(lead_data ->> 'scoreExplanation', ''), nullif(lead_data ->> 'campaignSource', ''),
    coalesce(lead_data -> 'utm', '{}'), nullif(lead_data ->> 'referrer', ''),
    coalesce((lead_data ->> 'doNotContact')::boolean, false),
    coalesce(nullif(lead_data ->> 'createdAt', '')::timestamptz, now()), now()
  );

  insert into public.lead_consents (
    lead_id, privacy_notice_accepted, contact_consent, marketing_consent,
    partner_sharing_consent, max_partner_recipients, accuracy_confirmed,
    non_binding_acknowledged, wording_version, source_url, consented_at
  ) values (
    new_lead_id, true, true,
    coalesce((consent_data ->> 'marketingConsent')::boolean, false), true,
    coalesce((consent_data ->> 'maxPartnerRecipients')::integer, 1), true, true,
    consent_data ->> 'consentWordingVersion', consent_data ->> 'sourceUrl',
    coalesce(nullif(consent_data ->> 'timestamp', '')::timestamptz, now())
  );

  insert into public.audit_logs (entity_type, entity_id, action, actor_label, details)
  values (
    'lead', new_lead_id, 'lead_created', 'public_form',
    jsonb_build_object(
      'applicantType', selected_applicant_type,
      'insuranceProductCount', jsonb_array_length(coalesce(lead_data -> 'insuranceProducts', '[]'::jsonb))
    )
  );

  return new_lead_id;
end;
$$;

revoke all on function public.capture_public_lead(jsonb) from public, anon, authenticated;
grant execute on function public.capture_public_lead(jsonb) to service_role;

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
  active_count integer;
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

  select preference.* into selected_preference
  from public.organisations organisation
  join public.buyer_preferences preference on preference.organisation_id = organisation.id
  where organisation.id = p_buyer_id
    and organisation.status = 'active'
    and organisation.organisation_type in ('broker', 'insurer');
  if not found then raise exception 'Approved buyer not found' using errcode = 'P0002'; end if;
  if selected_lead.score < selected_preference.minimum_score
    or (cardinality(selected_preference.provinces) > 0 and not selected_lead.province = any(selected_preference.provinces))
    or (cardinality(selected_preference.industries) > 0
      and (selected_lead.industry is null or not selected_lead.industry = any(selected_preference.industries)))
    or (cardinality(selected_preference.insurance_products) > 0
      and not selected_lead.insurance_products && selected_preference.insurance_products) then
    raise exception 'Lead does not match the buyer appetite' using errcode = '22023';
  end if;
  if not p_exclusive and not selected_preference.accepts_shared_leads then
    raise exception 'Buyer does not accept shared leads' using errcode = '22023';
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

revoke all on function public.reserve_lead_for_buyer(uuid, uuid, integer, boolean) from public, anon;
grant execute on function public.reserve_lead_for_buyer(uuid, uuid, integer, boolean) to authenticated, service_role;

create index if not exists leads_applicant_type_idx on public.leads (applicant_type);
create index if not exists leads_insurance_products_idx on public.leads using gin (insurance_products);
create index if not exists buyer_preferences_insurance_products_idx
  on public.buyer_preferences using gin (insurance_products);
