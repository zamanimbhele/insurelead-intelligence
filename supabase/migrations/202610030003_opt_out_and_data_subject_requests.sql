-- Opt-out requests and data subject access/correction/deletion requests
-- (POPIA). Both are internal compliance-workflow records, created and
-- updated only by platform/compliance admins (see BACKLOG.md "Opt-out and
-- data subject request workflows") - never by broker operators, and never
-- self-service for the public.
--
-- This is deliberately additive, not a replacement for the existing
-- campaign-unsubscribe mechanism (src/lib/campaign-unsubscribe.ts,
-- public.marketing_suppressions): that mechanism only suppresses future
-- campaign *sends* for one broker's campaigns, keyed by a hashed email
-- address. It does not set leads.do_not_contact, does not cover phone or
-- WhatsApp outreach, and has no concept of a formal access/correction/
-- deletion request. Processing an opt-out request here still goes through
-- update_lead_status(..., 'do_not_contact'), so it lands on the same
-- Do Not Contact flag the Kanban board and lead profile already enforce.
--
-- Same lockdown pattern as lead_notes/lead_tasks/lead_activities: the
-- authenticated role gets select only on both new tables, and every write
-- goes through a SECURITY DEFINER RPC that re-checks the caller is an
-- active platform_admin or compliance_admin - stricter than
-- update_lead_status()/add_lead_note(), which also allow an allocated
-- broker operator, because opt-out and data-subject-request handling is a
-- compliance function per the role matrix in the project brief, not a
-- broker one.

alter table public.leads
  add column if not exists deleted_at timestamptz;

alter table public.lead_activities
  drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities
  add constraint lead_activities_kind_check
  check (kind in (
    'status_change', 'note_added', 'interaction_logged',
    'task_created', 'task_completed', 'task_cancelled', 'do_not_contact_set',
    'pii_redacted'
  ));

create table public.opt_out_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  channel text not null check (channel in ('email', 'phone', 'whatsapp', 'all')),
  reason text,
  source text not null check (source in ('phone_call', 'email', 'whatsapp', 'written_letter', 'dashboard_manual', 'other')),
  status text not null default 'new' check (status in ('new', 'processed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by text,
  resolution_notes text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint opt_out_requests_contact_identifiable check (
    coalesce(trim(contact_email), '') <> '' or coalesce(trim(contact_phone), '') <> '' or lead_id is not null
  )
);

create index opt_out_requests_lead_idx on public.opt_out_requests (lead_id);
create index opt_out_requests_status_idx on public.opt_out_requests (status, requested_at desc);

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  request_type text not null check (request_type in ('access', 'correction', 'deletion')),
  requester_name text not null,
  requester_email text not null,
  requester_phone text,
  details text,
  status text not null default 'received' check (status in ('received', 'verifying', 'in_progress', 'completed', 'rejected')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  handled_by text,
  resolution_notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create index data_subject_requests_lead_idx on public.data_subject_requests (lead_id);
create index data_subject_requests_status_idx on public.data_subject_requests (status, due_at);

alter table public.opt_out_requests enable row level security;
alter table public.data_subject_requests enable row level security;

create policy "platform admins manage opt out requests"
  on public.opt_out_requests for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "compliance auditors view opt out requests"
  on public.opt_out_requests for select
  using (public.is_compliance_auditor());

create policy "platform admins manage data subject requests"
  on public.data_subject_requests for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "compliance auditors view data subject requests"
  on public.data_subject_requests for select
  using (public.is_compliance_auditor());

revoke all on public.opt_out_requests from public, anon, authenticated;
grant select on public.opt_out_requests to authenticated;

revoke all on public.data_subject_requests from public, anon, authenticated;
grant select on public.data_subject_requests to authenticated;

-- ---------------------------------------------------------------------
-- RPCs.

create or replace function public.create_opt_out_request(
  p_channel text,
  p_source text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_reason text default null,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  new_id uuid;
  actor_label text;
begin
  if p_channel not in ('email', 'phone', 'whatsapp', 'all') then
    raise exception 'Opt-out channel is not recognised' using errcode = '22023';
  end if;
  if p_source not in ('phone_call', 'email', 'whatsapp', 'written_letter', 'dashboard_manual', 'other') then
    raise exception 'Opt-out source is not recognised' using errcode = '22023';
  end if;
  if coalesce(trim(p_contact_email), '') = '' and coalesce(trim(p_contact_phone), '') = '' and p_lead_id is null then
    raise exception 'Provide a contact email, contact phone, or lead to identify who is opting out' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may log an opt-out request' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may log an opt-out request' using errcode = '42501';
  end if;

  if p_lead_id is not null and not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.opt_out_requests (
    lead_id, contact_name, contact_email, contact_phone, channel, reason, source, created_by
  )
  values (
    p_lead_id, nullif(trim(p_contact_name), ''), nullif(trim(p_contact_email), ''), nullif(trim(p_contact_phone), ''),
    p_channel, nullif(trim(p_reason), ''), p_source, actor_label
  )
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'opt_out', new_id, 'opt_out_request_created', actor_label,
    jsonb_build_object('leadId', p_lead_id, 'channel', p_channel, 'source', p_source)
  );

  return jsonb_build_object('id', new_id);
end;
$$;

revoke all on function public.create_opt_out_request(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_opt_out_request(text, text, text, text, text, text, uuid) to authenticated;

create or replace function public.process_opt_out_request(
  p_request_id uuid,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  request public.opt_out_requests%rowtype;
  actor_label text;
begin
  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may process an opt-out request' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may process an opt-out request' using errcode = '42501';
  end if;

  select * into request from public.opt_out_requests where id = p_request_id;
  if not found then
    raise exception 'Opt-out request not found' using errcode = 'P0002';
  end if;
  if request.status = 'processed' then
    raise exception 'This opt-out request has already been processed' using errcode = '22023';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  if request.lead_id is not null then
    perform public.update_lead_status(request.lead_id, 'do_not_contact');
  end if;

  update public.opt_out_requests
  set status = 'processed', processed_at = now(), processed_by = actor_label,
      resolution_notes = nullif(trim(p_resolution_notes), '')
  where id = p_request_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'opt_out', p_request_id, 'opt_out_request_processed', actor_label,
    jsonb_build_object('leadId', request.lead_id)
  );

  return jsonb_build_object('id', p_request_id, 'status', 'processed');
end;
$$;

revoke all on function public.process_opt_out_request(uuid, text) from public, anon, authenticated;
grant execute on function public.process_opt_out_request(uuid, text) to authenticated;

create or replace function public.create_data_subject_request(
  p_request_type text,
  p_requester_name text,
  p_requester_email text,
  p_requester_phone text default null,
  p_details text default null,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  new_id uuid;
  actor_label text;
  computed_due_at timestamptz;
begin
  if p_request_type not in ('access', 'correction', 'deletion') then
    raise exception 'Request type is not recognised' using errcode = '22023';
  end if;
  if coalesce(trim(p_requester_name), '') = '' then
    raise exception 'Requester name must not be empty' using errcode = '22023';
  end if;
  if coalesce(trim(p_requester_email), '') = '' then
    raise exception 'Requester email must not be empty' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may log a data subject request' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may log a data subject request' using errcode = '42501';
  end if;

  if p_lead_id is not null and not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');
  computed_due_at := now() + interval '30 days';

  insert into public.data_subject_requests (
    lead_id, request_type, requester_name, requester_email, requester_phone, details, due_at, created_by
  )
  values (
    p_lead_id, p_request_type, trim(p_requester_name), trim(p_requester_email),
    nullif(trim(p_requester_phone), ''), nullif(trim(p_details), ''), computed_due_at, actor_label
  )
  returning id into new_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'data_subject_request', new_id, 'data_subject_request_created', actor_label,
    jsonb_build_object('leadId', p_lead_id, 'requestType', p_request_type, 'dueAt', computed_due_at)
  );

  return jsonb_build_object('id', new_id, 'dueAt', computed_due_at);
end;
$$;

revoke all on function public.create_data_subject_request(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_data_subject_request(text, text, text, text, text, uuid) to authenticated;

create or replace function public.update_data_subject_request_status(
  p_request_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  request public.data_subject_requests%rowtype;
  actor_label text;
  redacted boolean := false;
begin
  if p_status not in ('verifying', 'in_progress', 'completed', 'rejected') then
    raise exception 'Request status is not recognised' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may update a data subject request' using errcode = '42501';
  end if;
  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    raise exception 'Only a platform or compliance administrator may update a data subject request' using errcode = '42501';
  end if;

  select * into request from public.data_subject_requests where id = p_request_id;
  if not found then
    raise exception 'Data subject request not found' using errcode = 'P0002';
  end if;
  if request.status in ('completed', 'rejected') then
    raise exception 'This request has already been finalised' using errcode = '22023';
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  if p_status = 'completed' and request.request_type = 'deletion' and request.lead_id is not null then
    update public.leads
    set contact_full_name = '[redacted - data subject deletion request]',
        contact_email = 'redacted-' || id::text || '@deleted.invalid',
        contact_mobile = null,
        business_name = case when business_name is not null then '[redacted]' else business_name end,
        trading_name = null,
        website = null,
        deleted_at = now(),
        do_not_contact = true,
        updated_at = now()
    where id = request.lead_id;
    redacted := true;

    insert into public.lead_activities (lead_id, kind, summary, actor_id, actor_label, metadata)
    values (
      request.lead_id, 'pii_redacted', 'Personal data redacted following a data subject deletion request',
      auth.uid(), actor_label, jsonb_build_object('dataSubjectRequestId', request.id)
    );

    insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
    values (
      auth.uid(), 'lead', request.lead_id, 'lead_pii_redacted', actor_label,
      jsonb_build_object('dataSubjectRequestId', request.id)
    );
  end if;

  update public.data_subject_requests
  set status = p_status,
      resolution_notes = coalesce(nullif(trim(p_resolution_notes), ''), resolution_notes),
      handled_by = actor_label,
      completed_at = case when p_status in ('completed', 'rejected') then now() else completed_at end
  where id = p_request_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'data_subject_request', p_request_id, 'data_subject_request_status_changed', actor_label,
    jsonb_build_object('from', request.status, 'to', p_status, 'redacted', redacted)
  );

  return jsonb_build_object('id', p_request_id, 'status', p_status, 'redacted', redacted);
end;
$$;

revoke all on function public.update_data_subject_request_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_data_subject_request_status(uuid, text, text) to authenticated;
