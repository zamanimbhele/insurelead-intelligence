-- Broker appetite administration and invitation acceptance.
--
-- 1. Every broker/insurer organisation now always has a buyer_preferences
--    row. Previously review_broker_organisation() approved a tenant without
--    ever creating one, so fetchSupabaseBuyers() fell back to "no approved
--    products, campaigns disabled" and the campaign authoring form rendered
--    an empty product list it could never submit. Approval now creates a
--    default (empty, campaigns-off) row, and existing tenants are backfilled.
-- 2. update_buyer_preferences(): the platform-admin-only way to set a
--    tenant's approved product appetite, territory, score floor, capacity
--    and campaign/shared-lead permissions, with a before/after audit entry.
--    Appetite is a compliance control, so brokers cannot set their own.
-- 3. accept_profile_invitation(): a team member invited via
--    invite_broker_team_member() is created 'invited' and nothing ever
--    activated them. Setting their first password through the invite link
--    now accepts the invitation - own profile only, 'invited' -> 'active'
--    only, and only while the organisation itself is active. A 'suspended'
--    profile is never reactivated this way.

-- 1a. Backfill a default preferences row for every tenant missing one.
insert into public.buyer_preferences (organisation_id)
select o.id
from public.organisations o
where o.organisation_type in ('broker', 'insurer')
  and not exists (select 1 from public.buyer_preferences p where p.organisation_id = o.id);

-- 1b. Approval also creates the default row from now on.
create or replace function public.review_broker_organisation(
  p_organisation_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_org public.organisations%rowtype;
  next_onboarding_status text;
  next_status public.organisation_status;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;

  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may review an organisation' using errcode = '42501';
  end if;

  select * into target_org from public.organisations where id = p_organisation_id;
  if not found then
    raise exception 'Organisation not found' using errcode = 'P0002';
  end if;

  if p_decision = 'approve' then
    next_onboarding_status := 'approved';
    next_status := 'active';
  else
    next_onboarding_status := 'rejected';
    next_status := target_org.status;
  end if;

  update public.organisations
  set onboarding_status = next_onboarding_status, status = next_status, updated_at = now()
  where id = p_organisation_id;

  if p_decision = 'approve' and target_org.organisation_type in ('broker', 'insurer') then
    insert into public.buyer_preferences (organisation_id)
    values (p_organisation_id)
    on conflict (organisation_id) do nothing;
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'organisation', p_organisation_id, 'organisation_reviewed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('decision', p_decision, 'onboardingStatus', next_onboarding_status, 'organisationName', target_org.name)
  );

  return jsonb_build_object('id', p_organisation_id, 'onboardingStatus', next_onboarding_status, 'status', next_status);
end;
$$;

revoke all on function public.review_broker_organisation(uuid, text) from public, anon, authenticated;
grant execute on function public.review_broker_organisation(uuid, text) to authenticated;

-- 2. Platform-admin appetite and permission editor.
create or replace function public.update_buyer_preferences(
  p_organisation_id uuid,
  p_insurance_products text[],
  p_provinces text[],
  p_minimum_score integer,
  p_daily_lead_capacity integer,
  p_accepts_campaigns boolean,
  p_accepts_shared_leads boolean
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
  allowed_products constant text[] := array[
    'motor_insurance', 'home_contents_insurance', 'life_insurance', 'funeral_cover',
    'travel_insurance', 'personal_accident', 'business_insurance', 'general_insurance_review'
  ];
  allowed_provinces constant text[] := array[
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
  ];
  clean_products text[] := coalesce(array(select distinct unnest(p_insurance_products) order by 1), '{}');
  clean_provinces text[] := coalesce(array(select distinct unnest(p_provinces) order by 1), '{}');
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may change a broker''s appetite' using errcode = '42501';
  end if;

  select * into target_org from public.organisations where id = p_organisation_id;
  if not found or target_org.organisation_type not in ('broker', 'insurer') then
    raise exception 'Broker organisation not found' using errcode = 'P0002';
  end if;

  if not (clean_products <@ allowed_products) then
    raise exception 'Insurance product is not recognised' using errcode = '22023';
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

  insert into public.buyer_preferences (
    organisation_id, insurance_products, provinces, minimum_score,
    daily_lead_capacity, accepts_campaigns, accepts_shared_leads, updated_at
  ) values (
    p_organisation_id, clean_products, clean_provinces, p_minimum_score,
    p_daily_lead_capacity, coalesce(p_accepts_campaigns, false), coalesce(p_accepts_shared_leads, false), now()
  )
  on conflict (organisation_id) do update set
    insurance_products = excluded.insurance_products,
    provinces = excluded.provinces,
    minimum_score = excluded.minimum_score,
    daily_lead_capacity = excluded.daily_lead_capacity,
    accepts_campaigns = excluded.accepts_campaigns,
    accepts_shared_leads = excluded.accepts_shared_leads,
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
        'acceptsSharedLeads', previous.accepts_shared_leads
      ) end,
      'after', jsonb_build_object(
        'insuranceProducts', clean_products,
        'provinces', clean_provinces,
        'minimumScore', p_minimum_score,
        'dailyLeadCapacity', p_daily_lead_capacity,
        'acceptsCampaigns', coalesce(p_accepts_campaigns, false),
        'acceptsSharedLeads', coalesce(p_accepts_shared_leads, false)
      )
    )
  );

  return jsonb_build_object('organisationId', p_organisation_id, 'insuranceProducts', clean_products);
end;
$$;

revoke all on function public.update_buyer_preferences(uuid, text[], text[], integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.update_buyer_preferences(uuid, text[], text[], integer, integer, boolean, boolean) to authenticated;

-- 3. Invitation acceptance on first password set.
create or replace function public.accept_profile_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  own_profile public.profiles%rowtype;
  own_org public.organisations%rowtype;
begin
  select * into own_profile from public.profiles where id = auth.uid();
  if not found or own_profile.member_status <> 'invited' then
    return jsonb_build_object('accepted', false);
  end if;

  select * into own_org from public.organisations where id = own_profile.organisation_id;
  if not found or own_org.status <> 'active' then
    return jsonb_build_object('accepted', false);
  end if;

  update public.profiles set member_status = 'active', updated_at = now() where id = auth.uid();

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'profile', auth.uid(), 'profile_invitation_accepted',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('organisationName', own_org.name, 'role', own_profile.role)
  );

  return jsonb_build_object('accepted', true);
end;
$$;

revoke all on function public.accept_profile_invitation() from public, anon, authenticated;
grant execute on function public.accept_profile_invitation() to authenticated;
