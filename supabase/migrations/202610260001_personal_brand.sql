-- Personal brand and representative disclosure (individual advisors
-- plan, phase 4).
--
-- Many advisors may not market under their employer's or FSP's brand.
-- In "personal" brand mode a campaign is signed with the advisor's own
-- name and always carries a representative disclosure: who they are, in
-- what capacity, for which authorised FSP. The disclosure wording is the
-- editable legal text 'representative_disclosure' (placeholder until a
-- compliance officer confirms it); the details below fill it in.
--
-- The disclosure is written into campaign content when it is generated,
-- so the email that is approved is exactly the email that is sent. The
-- application blocks approval and sending when the details are missing or
-- the content's disclosure is out of date.

alter table public.organisations
  add column if not exists brand_mode text not null default 'company',
  add column if not exists disclosure_name text,
  add column if not exists disclosure_capacity text,
  add column if not exists disclosure_fsp_name text,
  add column if not exists disclosure_fsp_number text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_brand_mode_check') then
    alter table public.organisations
      add constraint organisations_brand_mode_check check (brand_mode in ('company', 'personal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_disclosure_capacity_check') then
    alter table public.organisations
      add constraint organisations_disclosure_capacity_check
      check (disclosure_capacity is null or disclosure_capacity in ('representative', 'key_individual'));
  end if;
end;
$$;

create or replace function public.update_brand_settings(
  p_organisation_id uuid,
  p_brand_mode text,
  p_disclosure_name text,
  p_disclosure_capacity text,
  p_disclosure_fsp_name text,
  p_disclosure_fsp_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_org public.organisations%rowtype;
  clean_name text := nullif(trim(coalesce(p_disclosure_name, '')), '');
  clean_capacity text := nullif(trim(coalesce(p_disclosure_capacity, '')), '');
  clean_fsp_name text := nullif(trim(coalesce(p_disclosure_fsp_name, '')), '');
  clean_fsp_number text := nullif(trim(coalesce(p_disclosure_fsp_number, '')), '');
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or not (
    acting_profile.role in ('platform_admin', 'compliance_admin')
    or (acting_profile.role = 'broker_admin' and acting_profile.organisation_id = p_organisation_id)
  ) then
    raise exception 'Only a platform administrator or the organisation''s broker admin may change its branding' using errcode = '42501';
  end if;

  select * into target_org from public.organisations where id = p_organisation_id for update;
  if not found or target_org.organisation_type not in ('broker', 'insurer') then
    raise exception 'Broker organisation not found' using errcode = 'P0002';
  end if;

  if p_brand_mode is null or p_brand_mode not in ('company', 'personal') then
    raise exception 'Brand mode must be company or personal' using errcode = '22023';
  end if;
  if clean_capacity is not null and clean_capacity not in ('representative', 'key_individual') then
    raise exception 'Capacity must be representative or key individual' using errcode = '22023';
  end if;
  if p_brand_mode = 'personal'
    and (clean_name is null or clean_capacity is null or clean_fsp_name is null or clean_fsp_number is null) then
    raise exception 'A personal brand needs your name, capacity, FSP name and FSP number' using errcode = '22023';
  end if;
  if char_length(coalesce(clean_name, '')) > 120 or char_length(coalesce(clean_fsp_name, '')) > 160
    or char_length(coalesce(clean_fsp_number, '')) > 40 then
    raise exception 'One of the branding details is too long' using errcode = '22023';
  end if;

  update public.organisations set
    brand_mode = p_brand_mode,
    disclosure_name = clean_name,
    disclosure_capacity = clean_capacity,
    disclosure_fsp_name = clean_fsp_name,
    disclosure_fsp_number = clean_fsp_number,
    updated_at = now()
  where id = p_organisation_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'organisation', p_organisation_id, 'brand_settings_updated',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object(
      'organisationName', target_org.name,
      'before', jsonb_build_object('brandMode', target_org.brand_mode, 'name', target_org.disclosure_name,
        'capacity', target_org.disclosure_capacity, 'fspName', target_org.disclosure_fsp_name, 'fspNumber', target_org.disclosure_fsp_number),
      'after', jsonb_build_object('brandMode', p_brand_mode, 'name', clean_name,
        'capacity', clean_capacity, 'fspName', clean_fsp_name, 'fspNumber', clean_fsp_number)
    )
  );

  return jsonb_build_object('id', p_organisation_id, 'brandMode', p_brand_mode);
end;
$$;

revoke all on function public.update_brand_settings(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_brand_settings(uuid, text, text, text, text, text) to authenticated;
