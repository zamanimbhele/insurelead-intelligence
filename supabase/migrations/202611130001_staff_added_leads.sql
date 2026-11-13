-- Staff-added leads: a broker's own people can record a lead they took by
-- phone, referral or in person, instead of only receiving leads from the
-- public enquiry form.
--
-- Who can now do what:
--   * An active broker_admin or broker_agent of an active, approved broker
--     organisation may call add_staff_lead() to create ONE lead at a time in
--     their own organisation. Nobody else may: not anonymous visitors, not a
--     campaign_manager, not a suspended member, not a pending or rejected
--     organisation, and not platform staff (who have no broker workspace to
--     own the lead).
--   * The organisation is always taken from the caller's own profile. A
--     client-supplied organisation is ignored.
--   * The lead is private to that organisation. It is created together with
--     an accepted, exclusive, zero-price allocation to the organisation, so
--     the existing "allocated leads" policies give its members access and
--     nobody else. Its consent record has partner-sharing and marketing
--     consent both false, so reserve_lead_for_buyer() refuses to offer it to
--     any other broker and prepare_campaign_recipients() never emails it.
--   * Products are limited to the ones the organisation is authorised for.
--   * No direct table access is added. leads, lead_consents and
--     lead_allocations keep their existing grants; the only new write path
--     is this function.
--   * A workspace may add at most 200 leads this way in any 24 hours, so the
--     function cannot be used as a bulk importer.
--
-- The person adding the lead must state how the contact gave permission to
-- be contacted. That statement is stored on the consent record and in the
-- audit log; it is the practice's own record, not proof of consent.

alter table public.leads
  add column if not exists origin text not null default 'public_form',
  add column if not exists added_by_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists added_by uuid references public.profiles(id) on delete set null;

alter table public.leads drop constraint if exists leads_origin_check;
alter table public.leads
  add constraint leads_origin_check check (origin in ('public_form', 'staff_added'));

create index if not exists leads_added_by_organisation_idx
  on public.leads (added_by_organisation_id, created_at desc)
  where origin = 'staff_added';

alter table public.lead_consents
  add column if not exists contact_basis text,
  add column if not exists contact_basis_note text,
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

alter table public.lead_consents drop constraint if exists lead_consents_contact_basis_check;
alter table public.lead_consents
  add constraint lead_consents_contact_basis_check check (
    contact_basis is null
    or contact_basis in ('direct_enquiry', 'referral', 'existing_client', 'meeting_or_event', 'other')
  );

-- Digits only, with a leading 27 country code folded to 0, so 082 555 0100
-- and +27 82 555 0100 compare equal.
create or replace function public.normalised_mobile(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when digits ~ '^27[0-9]{9}$' then '0' || substr(digits, 3)
    else digits
  end
  from (select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') as digits) cleaned;
$$;

revoke all on function public.normalised_mobile(text) from public, anon, authenticated;
grant execute on function public.normalised_mobile(text) to authenticated, service_role;

create or replace function public.add_staff_lead(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  acting_organisation public.organisations%rowtype;
  lead_data jsonb := coalesce(payload -> 'lead', '{}'::jsonb);
  consent_data jsonb := coalesce(payload -> 'consent', '{}'::jsonb);
  applicant_type text := coalesce(lead_data ->> 'applicantType', '');
  products text[];
  full_name text := trim(coalesce(lead_data ->> 'contactFullName', ''));
  email text := lower(trim(coalesce(lead_data ->> 'contactEmail', '')));
  mobile text := trim(coalesce(lead_data ->> 'contactMobile', ''));
  channel text := coalesce(lead_data ->> 'preferredContactChannel', '');
  basis text := coalesce(consent_data ->> 'contactBasis', '');
  basis_note text := nullif(trim(coalesce(consent_data ->> 'contactBasisNote', '')), '');
  lead_score integer;
  duplicate_id uuid;
  added_today integer;
  new_lead_id uuid := gen_random_uuid();
  actor_label text;
begin
  -- 1. Who is calling, and for which organisation.
  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active workspace member may add a lead' using errcode = '42501';
  end if;
  if acting_profile.role not in ('broker_admin', 'broker_agent') then
    raise exception 'Only a broker administrator or agent may add a lead' using errcode = '42501';
  end if;

  select * into acting_organisation
  from public.organisations
  where id = acting_profile.organisation_id
    and status = 'active'
    and onboarding_status = 'approved'
    and organisation_type = 'broker';
  if not found then
    raise exception 'Your organisation is not approved to add leads' using errcode = '42501';
  end if;

  -- 2. The lead itself.
  if applicant_type not in ('individual', 'business') then
    raise exception 'Invalid applicant type' using errcode = '22023';
  end if;
  if jsonb_typeof(lead_data -> 'insuranceProducts') is distinct from 'array'
    or jsonb_array_length(lead_data -> 'insuranceProducts') = 0 then
    raise exception 'At least one insurance product is required' using errcode = '22023';
  end if;
  products := array(select distinct jsonb_array_elements_text(lead_data -> 'insuranceProducts'));
  if exists (
    select 1
    from unnest(products) requested(id)
    left join public.insurance_products product on product.id = requested.id
    where product.id is null
      or not product.active
      or not applicant_type = any(product.applicant_types)
  ) then
    raise exception 'An insurance product does not match the applicant type' using errcode = '22023';
  end if;
  if not products <@ public.organisation_authorised_products(acting_organisation.id) then
    raise exception 'Your organisation is not authorised for one or more of these products' using errcode = '22023';
  end if;
  if applicant_type = 'business' and trim(coalesce(lead_data ->> 'businessName', '')) = '' then
    raise exception 'Business name is required for a business lead' using errcode = '22023';
  end if;
  if length(full_name) < 2 or length(full_name) > 200 then
    raise exception 'Contact name is required' using errcode = '22023';
  end if;
  if trim(coalesce(lead_data ->> 'province', '')) = '' or trim(coalesce(lead_data ->> 'city', '')) = '' then
    raise exception 'Province and city are required' using errcode = '22023';
  end if;
  if channel not in ('phone', 'email', 'whatsapp') then
    raise exception 'Preferred contact channel is not recognised' using errcode = '22023';
  end if;
  if email = '' and mobile = '' then
    raise exception 'An email address or a mobile number is required' using errcode = '22023';
  end if;
  if email <> '' and (length(email) > 254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Email address is not valid' using errcode = '22023';
  end if;
  if mobile <> '' and mobile !~ '^[0-9+() -]{10,15}$' then
    raise exception 'Mobile number is not valid' using errcode = '22023';
  end if;
  if length(coalesce(lead_data ->> 'mainConcern', '')) > 500 then
    raise exception 'Notes are too long' using errcode = '22023';
  end if;

  -- 3. How permission to contact was obtained.
  if basis not in ('direct_enquiry', 'referral', 'existing_client', 'meeting_or_event', 'other') then
    raise exception 'Say how this person agreed to be contacted' using errcode = '22023';
  end if;
  if coalesce((consent_data ->> 'contactPermissionConfirmed')::boolean, false) is not true then
    raise exception 'Confirm that this person agreed to be contacted' using errcode = '22023';
  end if;
  if basis = 'other' and basis_note is null then
    raise exception 'Describe how this person agreed to be contacted' using errcode = '22023';
  end if;
  if length(coalesce(basis_note, '')) > 500 then
    raise exception 'The contact permission note is too long' using errcode = '22023';
  end if;

  -- 4. Not a bulk importer.
  select count(*) into added_today
  from public.leads
  where origin = 'staff_added'
    and added_by_organisation_id = acting_organisation.id
    and created_at > now() - interval '24 hours';
  if added_today >= 200 then
    raise exception 'Daily limit for adding leads has been reached' using errcode = '22023';
  end if;

  -- 5. Already in this workspace? Same email or same mobile number.
  if coalesce((payload ->> 'allowDuplicate')::boolean, false) is not true then
    select existing.id into duplicate_id
    from public.leads existing
    join public.lead_allocations allocation on allocation.lead_id = existing.id
    where allocation.buyer_organisation_id = acting_organisation.id
      and allocation.status in ('reserved', 'accepted', 'disputed')
      and existing.deleted_at is null
      and (
        (email <> '' and lower(existing.contact_email) = email)
        or (mobile <> '' and public.normalised_mobile(existing.contact_mobile) = public.normalised_mobile(mobile))
      )
    order by existing.created_at desc
    limit 1;
    if duplicate_id is not null then
      return jsonb_build_object('status', 'duplicate', 'leadId', duplicate_id);
    end if;
  end if;

  -- 6. Create the lead, its consent record and the workspace's own allocation.
  lead_score := least(100, greatest(0, coalesce((lead_data ->> 'score')::integer, 0)));
  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.leads (
    id, applicant_type, business_name, industry, province, city, suburb,
    insurance_products, business_cover_interests, current_insurance_status,
    main_concern, preferred_contact_time, preferred_contact_channel,
    contact_full_name, contact_role, contact_email, contact_mobile, status,
    score, score_band, score_explanation, utm, do_not_contact,
    origin, added_by_organisation_id, added_by, created_at, updated_at
  ) values (
    new_lead_id, applicant_type, nullif(trim(coalesce(lead_data ->> 'businessName', '')), ''),
    nullif(trim(coalesce(lead_data ->> 'industry', '')), ''),
    trim(lead_data ->> 'province'), trim(lead_data ->> 'city'),
    nullif(trim(coalesce(lead_data ->> 'suburb', '')), ''),
    products, '{}', coalesce(nullif(lead_data ->> 'currentInsuranceStatus', ''), 'unsure'),
    nullif(trim(coalesce(lead_data ->> 'mainConcern', '')), ''),
    nullif(trim(coalesce(lead_data ->> 'preferredContactTime', '')), ''), channel,
    full_name, nullif(trim(coalesce(lead_data ->> 'contactRole', '')), ''), email, mobile, 'new',
    lead_score,
    case when coalesce(lead_data ->> 'scoreBand', '') in ('hot', 'warm', 'nurture', 'low_priority')
      then lead_data ->> 'scoreBand' else 'low_priority' end,
    left(coalesce(lead_data ->> 'scoreExplanation', ''), 2000),
    jsonb_build_object('source', 'staff'), false,
    'staff_added', acting_organisation.id, acting_profile.id, now(), now()
  );

  -- Contact permission only. The person did not accept the public privacy
  -- notice, and did not agree to marketing or to being passed to another
  -- provider, so those stay false.
  insert into public.lead_consents (
    lead_id, privacy_notice_accepted, contact_consent, marketing_consent,
    partner_sharing_consent, max_partner_recipients, accuracy_confirmed,
    non_binding_acknowledged, wording_version, source_url, consented_at,
    contact_basis, contact_basis_note, recorded_by
  ) values (
    new_lead_id, false, true, false, false, 1, false, false,
    'staff_recorded_v1', 'dashboard:new-lead', now(), basis, basis_note, acting_profile.id
  );

  insert into public.lead_allocations (
    lead_id, buyer_organisation_id, status, price_cents, exclusive,
    accepted_at, responded_at, response_by
  ) values (
    new_lead_id, acting_organisation.id, 'accepted', 0, true, now(), now(), acting_profile.id
  );

  -- No personal information in the audit entry.
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'lead', new_lead_id, 'lead_added_by_staff', actor_label,
    jsonb_build_object(
      'organisationId', acting_organisation.id,
      'applicantType', applicant_type,
      'insuranceProductCount', cardinality(products),
      'contactBasis', basis
    )
  );

  return jsonb_build_object('status', 'created', 'leadId', new_lead_id);
end;
$$;

revoke all on function public.add_staff_lead(jsonb) from public, anon, authenticated;
grant execute on function public.add_staff_lead(jsonb) to authenticated;
