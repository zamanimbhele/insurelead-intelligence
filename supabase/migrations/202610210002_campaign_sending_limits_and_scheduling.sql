-- Campaign sending limits and scheduled sending.
--
-- 1. Per-tenant send quotas on buyer_preferences: a daily and a monthly
--    ceiling on campaign emails, counted across all of a broker's
--    campaigns. Usage is derived from campaign_recipients.sent_at (the
--    source of truth for what was actually handed to the provider), so
--    there is no separate counter that can drift. Days and months are
--    South African calendar days/months (SAST, UTC+02:00, no DST).
-- 2. update_buyer_preferences() gains the two limits. The new parameters
--    default to null, meaning "keep the current value", so the existing
--    7-argument call shape keeps working unchanged.
-- 3. A send lease on campaigns (send_lease_until) claimed atomically by
--    claim_campaign_send_lease(), so two overlapping scheduler runs (or a
--    scheduler run and an MCP launch) can never process the same
--    campaign's queue at the same time.
-- 4. New delivery event types for scheduling: 'scheduled',
--    'schedule_cancelled', 'quota_deferred' and 'resumed'.

-- 1. Quotas
alter table public.buyer_preferences
  add column if not exists campaign_daily_send_limit integer not null default 200,
  add column if not exists campaign_monthly_send_limit integer not null default 3000;

alter table public.buyer_preferences drop constraint if exists buyer_preferences_campaign_daily_send_limit_check;
alter table public.buyer_preferences add constraint buyer_preferences_campaign_daily_send_limit_check
  check (campaign_daily_send_limit between 1 and 50000);
alter table public.buyer_preferences drop constraint if exists buyer_preferences_campaign_monthly_send_limit_check;
alter table public.buyer_preferences add constraint buyer_preferences_campaign_monthly_send_limit_check
  check (campaign_monthly_send_limit between 1 and 1000000);
alter table public.buyer_preferences drop constraint if exists buyer_preferences_campaign_send_limits_order_check;
alter table public.buyer_preferences add constraint buyer_preferences_campaign_send_limits_order_check
  check (campaign_daily_send_limit <= campaign_monthly_send_limit);

create index if not exists campaign_recipients_sent_at_idx
  on public.campaign_recipients (sent_at)
  where sent_at is not null;

-- Server-side usage count (service role only). p_since_day / p_since_month
-- are computed by the caller (src/lib/campaign-quota.ts) so the SAST
-- boundary logic lives in one unit-tested place.
create or replace function public.campaign_send_usage(
  p_organisation_id uuid,
  p_since_day timestamptz,
  p_since_month timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'sentToday', count(*) filter (where recipient.sent_at >= p_since_day),
    'sentThisMonth', count(*) filter (where recipient.sent_at >= p_since_month)
  )
  from public.campaign_recipients recipient
  join public.campaigns campaign on campaign.id = recipient.campaign_id
  where campaign.organisation_id = p_organisation_id
    and recipient.sent_at >= least(p_since_day, p_since_month);
$$;

revoke all on function public.campaign_send_usage(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_send_usage(uuid, timestamptz, timestamptz) to service_role;

-- 2. Admin editor gains the limits (drop + recreate: the signature changes).
drop function if exists public.update_buyer_preferences(uuid, text[], text[], integer, integer, boolean, boolean);

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

-- 3. Send lease
alter table public.campaigns add column if not exists send_lease_until timestamptz;

-- Returns true only for the caller that atomically moved an empty or
-- expired lease forward. Service role only: the scheduler and the MCP
-- launch tool both run server-side with the secret key.
create or replace function public.claim_campaign_send_lease(p_campaign_id uuid, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed uuid;
begin
  if p_seconds is null or p_seconds not between 10 and 900 then
    raise exception 'Lease duration must be between 10 and 900 seconds' using errcode = '22023';
  end if;
  update public.campaigns
  set send_lease_until = now() + make_interval(secs => p_seconds)
  where id = p_campaign_id
    and (send_lease_until is null or send_lease_until < now())
  returning id into claimed;
  return claimed is not null;
end;
$$;

create or replace function public.release_campaign_send_lease(p_campaign_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.campaigns set send_lease_until = null where id = p_campaign_id;
$$;

revoke all on function public.claim_campaign_send_lease(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_campaign_send_lease(uuid) from public, anon, authenticated;
grant execute on function public.claim_campaign_send_lease(uuid, integer) to service_role;
grant execute on function public.release_campaign_send_lease(uuid) to service_role;

-- 4. Event types
alter table public.campaign_delivery_events
  drop constraint if exists campaign_delivery_events_event_type_check;
alter table public.campaign_delivery_events
  add constraint campaign_delivery_events_event_type_check
  check (event_type in (
    'draft_created', 'content_generated', 'validation_completed', 'test_sent',
    'approved', 'launch_started', 'recipient_sent', 'recipient_failed',
    'paused', 'completed', 'recipient_unsubscribed',
    'delivered', 'bounced', 'complained', 'opened', 'clicked',
    'scheduled', 'schedule_cancelled', 'quota_deferred', 'resumed'
  ));
