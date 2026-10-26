-- Platform-managed sending (individual advisors plan, phase 5).
--
-- Most individual advisors do not own or verify an email domain. They can
-- now send as "<Name> via InsureLead" from the platform's own sending
-- domain (one domain verified once in Resend), with replies going to their
-- own confirmed email address.
--
-- Everyone using the platform domain shares its sender reputation, so:
--   - a platform identity is created only by the server (service role),
--     never by a client, so nobody can claim an arbitrary domain;
--   - the application pauses any sender whose bounce or complaint rate
--     passes a threshold (pause_sending_identity), which in turn pauses
--     its campaigns through the existing sender safety check;
--   - new platform senders start on lower daily limits (warm-up, in the
--     application);
--   - a platform admin re-enables a paused sender by verifying it again.

alter table public.broker_sending_identities
  add column if not exists kind text not null default 'custom',
  add column if not exists status_reason text,
  add column if not exists paused_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'broker_sending_identity_kind_check') then
    alter table public.broker_sending_identities
      add constraint broker_sending_identity_kind_check check (kind in ('custom', 'platform'));
  end if;
end;
$$;

-- One platform identity per organisation.
create unique index if not exists broker_sending_identities_platform_uidx
  on public.broker_sending_identities (organisation_id)
  where kind = 'platform';

-- Called by the server after it has checked the caller (service role only).
create or replace function public.create_platform_sending_identity(
  p_profile_id uuid,
  p_domain text,
  p_from_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_org public.organisations%rowtype;
  reply_to text;
  clean_domain text := lower(trim(coalesce(p_domain, '')));
  clean_name text := trim(coalesce(p_from_name, ''));
  local_part text;
  make_default boolean;
  new_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Platform sending identities are created by the server only' using errcode = '42501';
  end if;
  select * into acting_profile from public.profiles where id = p_profile_id and member_status = 'active';
  if not found or acting_profile.role not in ('broker_admin', 'campaign_manager') or acting_profile.organisation_id is null then
    raise exception 'Only a broker manager or campaign manager may add a sending identity' using errcode = '42501';
  end if;
  select * into target_org from public.organisations
  where id = acting_profile.organisation_id and status = 'active' and onboarding_status = 'approved';
  if not found then
    raise exception 'Your organisation must be approved before it can send' using errcode = '22023';
  end if;
  if clean_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'The platform sending domain is not configured' using errcode = '22023';
  end if;
  if char_length(clean_name) not between 2 and 80 then
    raise exception 'A from-name is required' using errcode = '22023';
  end if;
  select lower(email) into reply_to from auth.users where id = p_profile_id;
  if reply_to is null or reply_to not like '%@%' then
    raise exception 'Your account has no confirmed email address for replies' using errcode = '22023';
  end if;

  -- e.g. lerato-ndlovu-1a2b3c4d@mail.insurelead.online
  local_part := trim(both '-' from regexp_replace(lower(clean_name), '[^a-z0-9]+', '-', 'g'));
  if local_part = '' then local_part := 'advisor'; end if;
  local_part := left(local_part, 40) || '-' || left(replace(target_org.id::text, '-', ''), 8);

  select not exists(
    select 1 from public.broker_sending_identities
    where organisation_id = target_org.id and is_default
  ) into make_default;

  insert into public.broker_sending_identities (
    organisation_id, domain, from_name, from_email, reply_to_email, provider, status, is_default, kind
  ) values (
    target_org.id, clean_domain, clean_name || ' via InsureLead', local_part || '@' || clean_domain, reply_to,
    'resend', 'verified', make_default, 'platform'
  )
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    p_profile_id, 'sending_identity', new_id, 'platform_sending_identity_created', reply_to,
    jsonb_build_object('organisationId', target_org.id, 'fromEmail', local_part || '@' || clean_domain, 'replyTo', reply_to)
  );

  return jsonb_build_object('id', new_id, 'fromName', clean_name || ' via InsureLead',
    'fromEmail', local_part || '@' || clean_domain, 'replyToEmail', reply_to, 'status', 'verified', 'kind', 'platform');
exception
  when unique_violation then
    raise exception 'Your organisation already has an InsureLead sending identity' using errcode = '23505';
end;
$$;

-- Automatic reputation pause (service role only, called by the
-- application when bounce or complaint rates pass the threshold).
create or replace function public.pause_sending_identity(p_identity_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_identity public.broker_sending_identities%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sending identities are paused by the server only' using errcode = '42501';
  end if;
  select * into target_identity from public.broker_sending_identities where id = p_identity_id for update;
  if not found then raise exception 'Sending identity not found' using errcode = 'P0002'; end if;
  if target_identity.status = 'disabled' then
    return jsonb_build_object('id', p_identity_id, 'status', 'disabled', 'changed', false);
  end if;

  update public.broker_sending_identities
  set status = 'disabled', status_reason = left(coalesce(p_reason, 'Paused automatically'), 500),
      paused_at = now(), updated_at = now()
  where id = p_identity_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    null, 'sending_identity', p_identity_id, 'sending_identity_paused', 'reputation_monitor',
    jsonb_build_object('organisationId', target_identity.organisation_id, 'reason', p_reason, 'fromEmail', target_identity.from_email)
  );
  return jsonb_build_object('id', p_identity_id, 'status', 'disabled', 'changed', true);
end;
$$;

revoke all on function public.create_platform_sending_identity(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pause_sending_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.create_platform_sending_identity(uuid, text, text) to service_role;
grant execute on function public.pause_sending_identity(uuid, text) to service_role;

create or replace function public.review_sending_identity(
  p_identity_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  target_identity public.broker_sending_identities%rowtype;
begin
  if p_status not in ('verified', 'disabled') then
    raise exception 'Status must be verified or disabled' using errcode = '22023';
  end if;

  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform administrator may review a sending identity' using errcode = '42501';
  end if;

  select * into target_identity from public.broker_sending_identities where id = p_identity_id;
  if not found then
    raise exception 'Sending identity not found' using errcode = 'P0002';
  end if;

  -- Re-verifying clears an automatic pause (phase 5); disabling by hand
  -- records that an admin did it.
  update public.broker_sending_identities
  set status = p_status,
      status_reason = case when p_status = 'verified' then null else 'Disabled by a platform administrator' end,
      paused_at = case when p_status = 'verified' then null else now() end,
      updated_at = now()
  where id = p_identity_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'sending_identity', p_identity_id, 'sending_identity_reviewed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('fromStatus', target_identity.status, 'toStatus', p_status, 'domain', target_identity.domain)
  );

  return jsonb_build_object('id', p_identity_id, 'status', p_status);
end;
$$;

revoke all on function public.review_sending_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.review_sending_identity(uuid, text) to authenticated;
