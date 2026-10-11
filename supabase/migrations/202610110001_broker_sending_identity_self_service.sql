-- Broker-side self-service sending identity creation. The platform-admin
-- half of sending-domain management (review_sending_identity(): verify or
-- disable an existing identity) landed in
-- 202610100001_platform_admin_onboarding.sql, but there was still no way
-- for a broker to ever *add* one - the only path was a platform admin
-- running a manual SQL script by hand, documented as an explicitly open
-- gap in docs/BROKER_TENANCY_SETUP.md, BACKLOG.md, and README.md's "out
-- of scope" section. This migration closes that gap with the same
-- SECURITY DEFINER RPC pattern every other mutation in this codebase
-- already follows.
--
-- Security note: the organisation an identity is created for is always
-- the caller's own, resolved server-side from their active profile -
-- never a client-supplied organisation id - so a broker can never create
-- a sending identity for a different tenant by passing someone else's
-- organisation_id. A newly created identity is always 'pending': only a
-- platform admin's existing review_sending_identity() RPC can move it to
-- 'verified', so self-service creation can never grant a broker their
-- own instant "verified" sending identity.

create or replace function public.create_broker_sending_identity(
  p_domain text,
  p_from_name text,
  p_from_email text,
  p_reply_to_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  clean_domain text := trim(coalesce(p_domain, ''));
  clean_from_name text := trim(coalesce(p_from_name, ''));
  clean_from_email text := lower(trim(coalesce(p_from_email, '')));
  clean_reply_to text := nullif(lower(trim(coalesce(p_reply_to_email, ''))), '');
  make_default boolean;
  new_id uuid;
begin
  select * into acting_profile from public.profiles where id = auth.uid() and member_status = 'active';
  if not found or acting_profile.role not in ('broker_admin', 'campaign_manager') then
    raise exception 'Only a broker manager or campaign manager may add a sending identity' using errcode = '42501';
  end if;

  if acting_profile.organisation_id is null then
    raise exception 'Your account has no organisation to attach a sending identity to' using errcode = '42501';
  end if;

  if clean_domain = '' then
    raise exception 'A sending domain is required' using errcode = '22023';
  end if;
  if clean_from_name = '' then
    raise exception 'A from-name is required' using errcode = '22023';
  end if;
  if clean_from_email = '' or clean_from_email not like '%@%' then
    raise exception 'A valid from-email address is required' using errcode = '22023';
  end if;
  if clean_reply_to is not null and clean_reply_to not like '%@%' then
    raise exception 'The reply-to address is not valid' using errcode = '22023';
  end if;

  -- The first identity an organisation ever creates becomes its default;
  -- later ones do not, so campaign delivery never silently switches
  -- which address a campaign sends from.
  select not exists(
    select 1 from public.broker_sending_identities
    where organisation_id = acting_profile.organisation_id and is_default
  ) into make_default;

  insert into public.broker_sending_identities (
    organisation_id, domain, from_name, from_email, reply_to_email, provider, status, is_default
  )
  values (
    acting_profile.organisation_id, clean_domain, clean_from_name, clean_from_email, clean_reply_to,
    'resend', 'pending', make_default
  )
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'sending_identity', new_id, 'sending_identity_created',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object(
      'organisationId', acting_profile.organisation_id, 'domain', clean_domain,
      'fromEmail', clean_from_email, 'isDefault', make_default
    )
  );

  return jsonb_build_object(
    'id', new_id, 'organisationId', acting_profile.organisation_id, 'domain', clean_domain,
    'fromName', clean_from_name, 'fromEmail', clean_from_email, 'replyToEmail', clean_reply_to,
    'provider', 'resend', 'status', 'pending', 'isDefault', make_default
  );
exception
  when unique_violation then
    raise exception 'A sending identity with this from-email already exists for your organisation' using errcode = '23505';
end;
$$;

revoke all on function public.create_broker_sending_identity(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_broker_sending_identity(text, text, text, text) to authenticated;
