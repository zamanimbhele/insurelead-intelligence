-- Geographic hotspot dashboard: a single configurable value for how many
-- leads an area needs before it is displayed as a hotspot at all,
-- mirroring the lead_retention_days column already on this singleton
-- settings table (same plain-RLS idiom, same reasoning: "is this user an
-- admin", no cross-tenant logic to arbitrate via a SECURITY DEFINER RPC).

alter table public.application_settings
  add column if not exists hotspot_min_lead_threshold integer not null default 10;

alter table public.application_settings
  drop constraint if exists application_settings_hotspot_threshold_check;
alter table public.application_settings
  add constraint application_settings_hotspot_threshold_check
    check (hotspot_min_lead_threshold between 1 and 500);
