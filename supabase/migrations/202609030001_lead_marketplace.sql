create extension if not exists pgcrypto;
create type public.organisation_type as enum ('platform', 'broker', 'insurer');
create type public.organisation_status as enum ('pending', 'active', 'suspended');
create type public.allocation_status as enum ('reserved', 'accepted', 'disputed', 'released');

create table public.organisations (
  id uuid primary key default gen_random_uuid(), name text not null,
  organisation_type public.organisation_type not null,
  status public.organisation_status not null default 'pending',
  fsp_number text, contact_email text not null, created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references public.organisations(id),
  role text not null check (role in ('platform_admin','compliance_admin','buyer_manager','broker')),
  created_at timestamptz not null default now()
);
create table public.buyer_preferences (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  provinces text[] not null default '{}', industries text[] not null default '{}',
  minimum_score integer not null default 0 check (minimum_score between 0 and 100),
  accepts_shared_leads boolean not null default false, updated_at timestamptz not null default now()
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), business_name text not null, industry text not null,
  province text not null, city text not null, contact_full_name text not null,
  contact_email text not null, contact_mobile text not null, insurance_products text[] not null default '{}',
  score integer not null default 0 check (score between 0 and 100), status text not null default 'new',
  do_not_contact boolean not null default false, campaign_source text, created_at timestamptz not null default now()
);
create table public.lead_consents (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
  contact_consent boolean not null, partner_sharing_consent boolean not null,
  marketing_consent boolean not null default false,
  max_partner_recipients integer not null default 1 check (max_partner_recipients in (1,3)),
  wording_version text not null, source_url text not null, consented_at timestamptz not null default now(), withdrawn_at timestamptz
);
create table public.lead_allocations (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id),
  buyer_organisation_id uuid not null references public.organisations(id),
  status public.allocation_status not null default 'reserved', price_cents integer not null check (price_cents >= 0),
  exclusive boolean not null default true, allocated_at timestamptz not null default now(), accepted_at timestamptz,
  unique (lead_id,buyer_organisation_id)
);
create table public.lead_outcomes (
  id uuid primary key default gen_random_uuid(), allocation_id uuid not null references public.lead_allocations(id) on delete cascade,
  outcome text not null check (outcome in ('contacted','quoted','won','lost','invalid','duplicate')),
  notes text, recorded_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id),
  entity_type text not null, entity_id uuid not null, action text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.buyer_preferences enable row level security;
alter table public.leads enable row level security;
alter table public.lead_consents enable row level security;
alter table public.lead_allocations enable row level security;
alter table public.lead_outcomes enable row level security;
alter table public.audit_logs enable row level security;

create function public.current_organisation_id() returns uuid language sql stable security definer set search_path=public as $$
  select organisation_id from public.profiles where id=auth.uid()
$$;
create function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('platform_admin','compliance_admin'))
$$;
create policy "platform admins manage organisations" on public.organisations for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "buyers view own organisation" on public.organisations for select using (id=public.current_organisation_id());
create policy "users view own profile" on public.profiles for select using (id=auth.uid());
create policy "platform admins manage profiles" on public.profiles for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "buyers manage own preferences" on public.buyer_preferences for all using (organisation_id=public.current_organisation_id()) with check (organisation_id=public.current_organisation_id());
create policy "platform admins manage leads" on public.leads for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "buyers view accepted leads" on public.leads for select using (exists(select 1 from public.lead_allocations a where a.lead_id=id and a.buyer_organisation_id=public.current_organisation_id() and a.status='accepted'));
create policy "platform admins manage consents" on public.lead_consents for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "organisations view own allocations" on public.lead_allocations for select using (public.is_platform_admin() or buyer_organisation_id=public.current_organisation_id());
create policy "platform admins create allocations" on public.lead_allocations for insert with check (public.is_platform_admin());
create policy "buyers update own allocations" on public.lead_allocations for update using (buyer_organisation_id=public.current_organisation_id());
create policy "organisations manage own outcomes" on public.lead_outcomes for all using (exists(select 1 from public.lead_allocations a where a.id=allocation_id and (public.is_platform_admin() or a.buyer_organisation_id=public.current_organisation_id()))) with check (exists(select 1 from public.lead_allocations a where a.id=allocation_id and (public.is_platform_admin() or a.buyer_organisation_id=public.current_organisation_id())));
create policy "platform admins view audit logs" on public.audit_logs for select using (public.is_platform_admin());
