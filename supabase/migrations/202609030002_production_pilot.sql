alter table public.leads
  add column if not exists trading_name text,
  add column if not exists business_type text,
  add column if not exists employee_band text,
  add column if not exists turnover_band text,
  add column if not exists years_in_operation text,
  add column if not exists suburb text,
  add column if not exists postal_code text,
  add column if not exists website text,
  add column if not exists current_insurance_status text,
  add column if not exists renewal_month text,
  add column if not exists financial_year_end_month text,
  add column if not exists main_concern text,
  add column if not exists preferred_contact_time text,
  add column if not exists preferred_contact_channel text,
  add column if not exists contact_role text,
  add column if not exists score_band text not null default 'low_priority',
  add column if not exists score_explanation text not null default '',
  add column if not exists utm jsonb not null default '{}',
  add column if not exists referrer text,
  add column if not exists assigned_broker uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.leads
  drop constraint if exists leads_score_band_check;
alter table public.leads
  add constraint leads_score_band_check
  check (score_band in ('hot', 'warm', 'nurture', 'low_priority'));

alter table public.leads
  drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in (
    'new', 'contact_attempted', 'contacted', 'qualified', 'consultation_booked',
    'quote_requested', 'quote_issued', 'negotiation', 'won', 'lost', 'nurture',
    'do_not_contact', 'archived'
  ));

alter table public.lead_consents
  add column if not exists privacy_notice_accepted boolean not null default false,
  add column if not exists accuracy_confirmed boolean not null default false,
  add column if not exists non_binding_acknowledged boolean not null default false;

alter table public.audit_logs
  add column if not exists actor_label text;

drop policy if exists "platform admins manage buyer preferences" on public.buyer_preferences;
create policy "platform admins manage buyer preferences"
  on public.buyer_preferences for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "buyers update own allocations" on public.lead_allocations;
-- Buyer response mutations are deliberately withheld until the buyer portal
-- can expose a narrow, audited acceptance/release RPC.

revoke all on public.organisations, public.profiles, public.buyer_preferences,
  public.leads, public.lead_consents, public.lead_allocations,
  public.lead_outcomes, public.audit_logs from anon, authenticated;
grant select on public.organisations, public.profiles, public.buyer_preferences,
  public.leads, public.lead_consents, public.lead_allocations,
  public.lead_outcomes, public.audit_logs to authenticated;

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
begin
  if coalesce((consent_data ->> 'privacyNoticeAccepted')::boolean, false) is not true
    or coalesce((consent_data ->> 'contactConsent')::boolean, false) is not true
    or coalesce((consent_data ->> 'partnerSharingConsent')::boolean, false) is not true
    or coalesce((consent_data ->> 'accuracyConfirmed')::boolean, false) is not true
    or coalesce((consent_data ->> 'nonBindingAcknowledged')::boolean, false) is not true then
    raise exception 'Required consent is missing' using errcode = '22023';
  end if;

  insert into public.leads (
    id, business_name, trading_name, industry, business_type, employee_band,
    turnover_band, years_in_operation, province, city, suburb, postal_code,
    website, insurance_products, current_insurance_status, renewal_month,
    financial_year_end_month, main_concern, preferred_contact_time,
    preferred_contact_channel, contact_full_name, contact_role, contact_email,
    contact_mobile, status, score, score_band, score_explanation,
    campaign_source, utm, referrer, do_not_contact, created_at, updated_at
  ) values (
    new_lead_id,
    lead_data ->> 'businessName', lead_data ->> 'tradingName', lead_data ->> 'industry',
    lead_data ->> 'businessType', lead_data ->> 'employeeBand', lead_data ->> 'turnoverBand',
    lead_data ->> 'yearsInOperation', lead_data ->> 'province', lead_data ->> 'city',
    lead_data ->> 'suburb', lead_data ->> 'postalCode', lead_data ->> 'website',
    coalesce(array(select jsonb_array_elements_text(lead_data -> 'insuranceProducts')), '{}'),
    lead_data ->> 'currentInsuranceStatus', lead_data ->> 'renewalMonth',
    lead_data ->> 'financialYearEndMonth', lead_data ->> 'mainConcern',
    lead_data ->> 'preferredContactTime', lead_data ->> 'preferredContactChannel',
    lead_data ->> 'contactFullName', lead_data ->> 'contactRole',
    lower(lead_data ->> 'contactEmail'), lead_data ->> 'contactMobile',
    coalesce(lead_data ->> 'status', 'new'), coalesce((lead_data ->> 'score')::integer, 0),
    coalesce(lead_data ->> 'scoreBand', 'low_priority'), coalesce(lead_data ->> 'scoreExplanation', ''),
    lead_data ->> 'campaignSource', coalesce(lead_data -> 'utm', '{}'),
    lead_data ->> 'referrer', coalesce((lead_data ->> 'doNotContact')::boolean, false),
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
    jsonb_build_object('insuranceProductCount', jsonb_array_length(coalesce(lead_data -> 'insuranceProducts', '[]'::jsonb)))
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
    or (cardinality(selected_preference.industries) > 0 and not selected_lead.industry = any(selected_preference.industries)) then
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

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_business_created_idx on public.leads (lower(contact_email), lower(business_name), created_at desc);
create index if not exists lead_consents_lead_time_idx on public.lead_consents (lead_id, consented_at desc);
create index if not exists lead_allocations_lead_status_idx on public.lead_allocations (lead_id, status);
