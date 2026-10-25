-- Product catalogue (implementation plan, phase 1).
--
-- public.insurance_products becomes the single source of truth for which
-- products exist, which are offered, and which regulated category each
-- belongs to. Until now the same eight ids were also hard-coded in the
-- application and in update_buyer_preferences(); adding or hiding a
-- product needed a code release.
--
-- 1. product_categories: the regulated families products belong to, with
--    the authorisation a person needs to sell them (enforced from phase 3).
-- 2. insurance_products gains category_id and a three-state status
--    (active | hidden | retired). The old boolean `active` becomes a
--    generated column, so existing checks (submit lead, RLS) keep working
--    and can never disagree with status.
-- 3. New categories and products are seeded HIDDEN: nothing changes for
--    users until each one is switched on (phase 7).
-- 4. update_buyer_preferences() checks the table instead of its own copy.
--
-- Product ids never change, so no lead, consent, appetite or campaign row
-- is rewritten.

-- 1. Categories -------------------------------------------------------------
create table if not exists public.product_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null,
  description text not null default '',
  required_authorisation text not null,
  status text not null default 'hidden' check (status in ('active', 'hidden', 'retired')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.product_categories (id, name, description, required_authorisation, status, display_order)
values
  ('short_term_insurance', 'Short-term insurance', 'Cover for vehicles, property, businesses, travel and accidents.', 'fais_short_term', 'active', 10),
  ('long_term_insurance', 'Life and funeral cover', 'Life, funeral and other long-term cover.', 'fais_long_term', 'active', 20),
  ('investments', 'Investments and retirement', 'Investment and retirement planning advice.', 'fais_investments', 'hidden', 30),
  ('medical_schemes', 'Medical aid', 'Medical scheme membership and gap cover.', 'cms_accreditation', 'hidden', 40),
  ('banking_credit', 'Banking and credit', 'Banking and credit products.', 'banking_or_credit_mandate', 'hidden', 50)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  required_authorisation = excluded.required_authorisation,
  display_order = excluded.display_order,
  updated_at = now();
-- status is deliberately not overwritten on re-run: once an admin
-- switches a category on, re-applying this migration must not hide it.

alter table public.product_categories enable row level security;
revoke all on public.product_categories from public, anon, authenticated;
grant select on public.product_categories to anon, authenticated;

drop policy if exists "public views active product categories" on public.product_categories;
create policy "public views active product categories"
  on public.product_categories for select
  using (status = 'active' or public.is_platform_admin());

-- 2. Products: category and status ----------------------------------------
alter table public.insurance_products
  add column if not exists category_id text references public.product_categories(id),
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'insurance_products_status_check'
  ) then
    alter table public.insurance_products
      add constraint insurance_products_status_check check (status in ('active', 'hidden', 'retired'));
  end if;
end;
$$;

-- Carry the old boolean over, then replace it with a generated column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'insurance_products'
      and column_name = 'active' and is_generated = 'NEVER'
  ) then
    update public.insurance_products set status = 'retired' where not active and status = 'active';
    drop policy if exists "public views active insurance products" on public.insurance_products;
    alter table public.insurance_products drop column active;
    alter table public.insurance_products
      add column active boolean generated always as (status = 'active') stored;
  end if;
end;
$$;

drop policy if exists "public views active insurance products" on public.insurance_products;
create policy "public views active insurance products"
  on public.insurance_products for select
  using (status = 'active' or public.is_platform_admin());

update public.insurance_products set category_id = case id
  when 'life_insurance' then 'long_term_insurance'
  when 'funeral_cover' then 'long_term_insurance'
  else 'short_term_insurance'
end
where category_id is null;

insert into public.insurance_products (id, name, description, applicant_types, display_order, category_id, status)
values
  ('investment_planning', 'Investment Planning', 'Advice on growing savings and investments.', array['individual'], 90, 'investments', 'hidden'),
  ('retirement_planning', 'Retirement Planning', 'Planning income for retirement.', array['individual'], 100, 'investments', 'hidden'),
  ('medical_aid', 'Medical Aid', 'Medical scheme options for individuals, families and employers.', array['individual', 'business'], 110, 'medical_schemes', 'hidden'),
  ('gap_cover', 'Gap Cover', 'Cover for the shortfall between medical costs and scheme benefits.', array['individual'], 120, 'medical_schemes', 'hidden')
on conflict (id) do nothing;

-- The form has always shown this wording; the table had an older one.
-- Now that the form reads the table, align it so nothing visible changes.
update public.insurance_products
set description = 'A general review when you are unsure which product fits.', updated_at = now()
where id = 'general_insurance_review'
  and description = 'A general review when the applicant is unsure which product fits.';

alter table public.insurance_products alter column category_id set not null;
create index if not exists insurance_products_category_idx on public.insurance_products (category_id, display_order);

-- A product can only be offered while its category is offered. Kept as
-- a rule in the database so every existing check that reads
-- insurance_products.active (lead capture, appetite) also respects the
-- category. Switch a category on before its products, and its products
-- off before the category.
create or replace function public.enforce_product_category_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'insurance_products' then
    if new.status = 'active' and not exists (
      select 1 from public.product_categories where id = new.category_id and status = 'active'
    ) then
      raise exception 'Switch the product category on before offering its products' using errcode = '23514';
    end if;
  elsif new.status <> 'active' and exists (
    select 1 from public.insurance_products where category_id = new.id and status = 'active'
  ) then
    raise exception 'Hide or retire this category''s products before switching the category off' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists insurance_products_category_status on public.insurance_products;
create trigger insurance_products_category_status
  before insert or update of status, category_id on public.insurance_products
  for each row execute function public.enforce_product_category_status();

drop trigger if exists product_categories_status on public.product_categories;
create trigger product_categories_status
  before update of status on public.product_categories
  for each row execute function public.enforce_product_category_status();

-- 3. Appetite checks the catalogue ----------------------------------------
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
