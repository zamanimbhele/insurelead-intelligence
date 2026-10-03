-- Compliance dashboard (MVP).
--
-- Everything the dashboard needs to READ (leads, lead_consents,
-- lead_allocations, audit_logs) is already reachable by platform admins,
-- compliance admins (both covered by is_platform_admin()) and compliance
-- auditors via existing RLS policies - no new grants required there.
--
-- The one new piece of state is a single configurable value: how many days
-- a lead may age before it is flagged as a retention exception. This is a
-- plain, directly-RLS-managed singleton table (following the
-- insurance_products idiom), not a SECURITY DEFINER RPC, because there is
-- no cross-tenant business logic to arbitrate - just "is this user an
-- admin".

create table if not exists public.application_settings (
  id smallint primary key default 1,
  lead_retention_days integer not null default 730,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint application_settings_singleton check (id = 1),
  constraint application_settings_retention_days_check
    check (lead_retention_days between 30 and 3650)
);

insert into public.application_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.application_settings enable row level security;

drop policy if exists "platform admins manage application settings" on public.application_settings;
create policy "platform admins manage application settings"
  on public.application_settings for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "compliance auditors view application settings" on public.application_settings;
create policy "compliance auditors view application settings"
  on public.application_settings for select
  using (public.is_compliance_auditor());

revoke all on public.application_settings from public, anon, authenticated;
grant select on public.application_settings to authenticated;
grant insert, update on public.application_settings to authenticated;
