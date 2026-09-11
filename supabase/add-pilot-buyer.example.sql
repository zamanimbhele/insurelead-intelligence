-- Replace every REPLACE_* value. Run once per approved broker or insurer.
-- This script requires the multi-broker-tenancy migration.
do $$
declare
  buyer_name text := 'REPLACE_WITH_BUYER_NAME';
  buyer_slug text := 'REPLACE_WITH_URL_SAFE_SLUG';
  buyer_email text := 'REPLACE_WITH_BUYER_CONTACT_EMAIL';
  buyer_fsp text := 'REPLACE_WITH_FSP_NUMBER';
  sender_domain text := 'REPLACE_WITH_VERIFIED_OR_PENDING_DOMAIN';
  sender_email text := 'REPLACE_WITH_FROM_EMAIL';
  buyer_kind public.organisation_type := 'broker'; -- broker or insurer
  buyer_id uuid;
begin
  if buyer_name like 'REPLACE_%' or buyer_slug like 'REPLACE_%'
    or buyer_email like 'REPLACE_%' or buyer_fsp like 'REPLACE_%'
    or sender_domain like 'REPLACE_%' or sender_email like 'REPLACE_%' then
    raise exception 'Replace the buyer placeholders before running this script';
  end if;

  insert into public.organisations (
    name, slug, organisation_type, status, onboarding_status, contact_email, fsp_number
  ) values (
    buyer_name, buyer_slug, buyer_kind, 'active', 'approved', buyer_email, buyer_fsp
  ) returning id into buyer_id;

  insert into public.buyer_preferences (
    organisation_id, provinces, cities, industries, insurance_products,
    minimum_score, daily_lead_capacity, contact_sla_hours,
    accepts_shared_leads, accepts_campaigns
  ) values (
    buyer_id,
    array['Gauteng'],
    array['Johannesburg'],
    array['Construction and Contracting', 'Transport and Logistics'],
    array['business_insurance'],
    35,
    25,
    4,
    false,
    false
  );

  insert into public.broker_sending_identities (
    organisation_id, domain, from_name, from_email, reply_to_email, status, is_default
  ) values (
    buyer_id, sender_domain, buyer_name, sender_email, buyer_email, 'pending', true
  );
end;
$$;
