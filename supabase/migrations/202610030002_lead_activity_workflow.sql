-- Broker workflow: notes, call/email/meeting logging, follow-up tasks, a
-- unified activity timeline, and loss-reason capture on the lead profile.
--
-- Follows the same pattern as 202610020001_lead_status_workflow.sql:
-- public.leads already has no direct insert/update grant for the
-- authenticated role (see 202609030002_production_pilot.sql), and these
-- new tables get the same treatment - plain RLS for SELECT, no
-- insert/update/delete grants, and a narrow SECURITY DEFINER RPC per
-- write path that re-checks (platform admin / compliance admin) or (broker
-- operator with an accepted allocation on the lead) inline, exactly as
-- update_lead_status() does, rather than factoring the check into a shared
-- helper.

alter table public.leads
  add column if not exists loss_reason text;

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_label text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  assignee_label text,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- One table for the whole timeline (status changes, notes, logged calls /
-- emails / meetings, task lifecycle) rather than a table per event type -
-- the lead profile page renders them as a single chronological feed, and
-- campaign_events (202609110002_campaign_generation_mcp.sql) already
-- established this actor_label + jsonb "details" idiom for timelines in
-- this codebase.
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in (
    'status_change', 'note_added', 'interaction_logged',
    'task_created', 'task_completed', 'task_cancelled', 'do_not_contact_set'
  )),
  summary text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text not null,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index if not exists lead_notes_lead_created_idx on public.lead_notes (lead_id, created_at desc);
create index if not exists lead_tasks_lead_status_idx on public.lead_tasks (lead_id, status, due_at);
create index if not exists lead_activities_lead_occurred_idx on public.lead_activities (lead_id, occurred_at desc);

alter table public.lead_notes enable row level security;
alter table public.lead_tasks enable row level security;
alter table public.lead_activities enable row level security;

-- Mirrors "broker organisations view allocated leads" / "compliance
-- auditors view leads" from 202609110001_multi_broker_tenancy.sql exactly,
-- so read access to a lead's workflow data always matches read access to
-- the lead itself.
create policy "broker organisations view allocated lead notes"
  on public.lead_notes for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or exists (
      select 1 from public.lead_allocations allocation
      where allocation.lead_id = lead_notes.lead_id
        and allocation.buyer_organisation_id = public.current_organisation_id()
        and allocation.status in ('reserved', 'accepted', 'disputed')
    )
  );

create policy "broker organisations view allocated lead tasks"
  on public.lead_tasks for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or exists (
      select 1 from public.lead_allocations allocation
      where allocation.lead_id = lead_tasks.lead_id
        and allocation.buyer_organisation_id = public.current_organisation_id()
        and allocation.status in ('reserved', 'accepted', 'disputed')
    )
  );

create policy "broker organisations view allocated lead activities"
  on public.lead_activities for select
  using (
    public.is_platform_admin()
    or public.is_compliance_auditor()
    or exists (
      select 1 from public.lead_allocations allocation
      where allocation.lead_id = lead_activities.lead_id
        and allocation.buyer_organisation_id = public.current_organisation_id()
        and allocation.status in ('reserved', 'accepted', 'disputed')
    )
  );

revoke all on public.lead_notes, public.lead_tasks, public.lead_activities
  from public, anon, authenticated;
grant select on public.lead_notes, public.lead_tasks, public.lead_activities
  to authenticated;

-- update_lead_status() gains loss-reason capture. The argument list changes
-- (a required loss reason when a lead moves to 'lost'), so the existing
-- 2-argument function is dropped and replaced rather than overloaded -
-- leaving both around would let a caller silently skip the new check by
-- calling the old signature.
drop function if exists public.update_lead_status(uuid, text);

create or replace function public.update_lead_status(
  p_lead_id uuid,
  p_status text,
  p_loss_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  selected_lead public.leads%rowtype;
  previous_status text;
  next_do_not_contact boolean;
  next_loss_reason text;
  activity_kind text;
  activity_summary text;
begin
  if p_status not in (
    'new', 'contact_attempted', 'contacted', 'qualified', 'consultation_booked',
    'quote_requested', 'quote_issued', 'negotiation', 'won', 'lost', 'nurture',
    'do_not_contact', 'archived'
  ) then
    raise exception 'Status must be a recognised lead pipeline stage' using errcode = '22023';
  end if;

  if p_status = 'lost' and coalesce(trim(p_loss_reason), '') = '' then
    raise exception 'A loss reason is required when marking a lead as lost' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may update lead status' using errcode = '42501';
  end if;

  select * into selected_lead
  from public.leads
  where id = p_lead_id
  for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    if acting_profile.role not in ('broker_admin', 'broker_agent') then
      raise exception 'Only a platform administrator or broker operator may update lead status' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.lead_allocations allocation
      where allocation.lead_id = p_lead_id
        and allocation.buyer_organisation_id = acting_profile.organisation_id
        and allocation.status = 'accepted'
    ) then
      raise exception 'Lead is not allocated to your organisation' using errcode = '42501';
    end if;
  end if;

  previous_status := selected_lead.status;
  next_do_not_contact := case
    when p_status = 'do_not_contact' then true
    when previous_status = 'do_not_contact' and p_status <> 'do_not_contact' then false
    else selected_lead.do_not_contact
  end;
  next_loss_reason := case when p_status = 'lost' then trim(p_loss_reason) else null end;

  update public.leads
  set status = p_status,
      do_not_contact = next_do_not_contact,
      loss_reason = next_loss_reason,
      updated_at = now()
  where id = p_lead_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'status', p_lead_id, 'lead_status_changed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('from', previous_status, 'to', p_status, 'lossReason', next_loss_reason)
  );

  activity_kind := case when p_status = 'do_not_contact' then 'do_not_contact_set' else 'status_change' end;
  activity_summary := case
    when p_status = 'lost' then 'Status changed to Lost: ' || next_loss_reason
    else 'Status changed from ' || previous_status || ' to ' || p_status
  end;

  insert into public.lead_activities (lead_id, kind, summary, actor_id, actor_label, metadata)
  values (
    p_lead_id, activity_kind, activity_summary, auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('from', previous_status, 'to', p_status, 'lossReason', next_loss_reason)
  );

  return jsonb_build_object(
    'leadId', p_lead_id,
    'status', p_status,
    'doNotContact', next_do_not_contact,
    'lossReason', next_loss_reason
  );
end;
$$;

revoke all on function public.update_lead_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_lead_status(uuid, text, text)
  to authenticated;

create or replace function public.add_lead_note(
  p_lead_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  new_note_id uuid;
  actor_label text;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Note body must not be empty' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may add a note' using errcode = '42501';
  end if;

  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    if acting_profile.role not in ('broker_admin', 'broker_agent') then
      raise exception 'Only a platform administrator or broker operator may add a note' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.lead_allocations allocation
      where allocation.lead_id = p_lead_id
        and allocation.buyer_organisation_id = acting_profile.organisation_id
        and allocation.status = 'accepted'
    ) then
      raise exception 'Lead is not allocated to your organisation' using errcode = '42501';
    end if;
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.lead_notes (lead_id, author_id, author_label, body)
  values (p_lead_id, auth.uid(), actor_label, trim(p_body))
  returning id into new_note_id;

  insert into public.lead_activities (lead_id, kind, summary, actor_id, actor_label, metadata)
  values (
    p_lead_id, 'note_added', 'Note added', auth.uid(), actor_label,
    jsonb_build_object('noteId', new_note_id)
  );

  return jsonb_build_object('id', new_note_id, 'leadId', p_lead_id);
end;
$$;

revoke all on function public.add_lead_note(uuid, text) from public, anon, authenticated;
grant execute on function public.add_lead_note(uuid, text) to authenticated;

create or replace function public.log_lead_interaction(
  p_lead_id uuid,
  p_channel text,
  p_outcome text,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  new_activity_id uuid;
  actor_label text;
begin
  if p_channel not in ('call', 'email', 'meeting', 'whatsapp', 'other') then
    raise exception 'Interaction channel is not recognised' using errcode = '22023';
  end if;
  if p_outcome not in ('connected', 'left_message', 'no_answer', 'follow_up_required', 'not_interested', 'other') then
    raise exception 'Interaction outcome is not recognised' using errcode = '22023';
  end if;
  if coalesce(trim(p_summary), '') = '' then
    raise exception 'Interaction summary must not be empty' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may log an interaction' using errcode = '42501';
  end if;

  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    if acting_profile.role not in ('broker_admin', 'broker_agent') then
      raise exception 'Only a platform administrator or broker operator may log an interaction' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.lead_allocations allocation
      where allocation.lead_id = p_lead_id
        and allocation.buyer_organisation_id = acting_profile.organisation_id
        and allocation.status = 'accepted'
    ) then
      raise exception 'Lead is not allocated to your organisation' using errcode = '42501';
    end if;
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.lead_activities (lead_id, kind, summary, actor_id, actor_label, metadata)
  values (
    p_lead_id, 'interaction_logged', trim(p_summary), auth.uid(), actor_label,
    jsonb_build_object('channel', p_channel, 'outcome', p_outcome)
  )
  returning id into new_activity_id;

  return jsonb_build_object('id', new_activity_id, 'leadId', p_lead_id);
end;
$$;

revoke all on function public.log_lead_interaction(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.log_lead_interaction(uuid, text, text, text) to authenticated;

create or replace function public.create_lead_task(
  p_lead_id uuid,
  p_title text,
  p_due_at timestamptz default null,
  p_assignee_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  new_task_id uuid;
  actor_label text;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Task title must not be empty' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may create a task' using errcode = '42501';
  end if;

  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    if acting_profile.role not in ('broker_admin', 'broker_agent') then
      raise exception 'Only a platform administrator or broker operator may create a task' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.lead_allocations allocation
      where allocation.lead_id = p_lead_id
        and allocation.buyer_organisation_id = acting_profile.organisation_id
        and allocation.status = 'accepted'
    ) then
      raise exception 'Lead is not allocated to your organisation' using errcode = '42501';
    end if;
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  insert into public.lead_tasks (lead_id, title, due_at, assignee_label, created_by)
  values (p_lead_id, trim(p_title), p_due_at, nullif(trim(coalesce(p_assignee_label, '')), ''), auth.uid())
  returning id into new_task_id;

  insert into public.lead_activities (lead_id, kind, summary, actor_id, actor_label, metadata)
  values (
    p_lead_id, 'task_created', 'Follow-up task created: ' || trim(p_title), auth.uid(), actor_label,
    jsonb_build_object('taskId', new_task_id, 'dueAt', p_due_at)
  );

  return jsonb_build_object('id', new_task_id, 'leadId', p_lead_id);
end;
$$;

revoke all on function public.create_lead_task(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_lead_task(uuid, text, timestamptz, text) to authenticated;

create or replace function public.complete_lead_task(
  p_task_id uuid,
  p_status text default 'completed'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_profile public.profiles%rowtype;
  selected_task public.lead_tasks%rowtype;
  actor_label text;
begin
  if p_status not in ('completed', 'cancelled') then
    raise exception 'Task status must be completed or cancelled' using errcode = '22023';
  end if;

  select * into acting_profile
  from public.profiles
  where id = auth.uid() and member_status = 'active';
  if not found then
    raise exception 'Only an active platform member may update a task' using errcode = '42501';
  end if;

  select * into selected_task from public.lead_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if acting_profile.role not in ('platform_admin', 'compliance_admin') then
    if acting_profile.role not in ('broker_admin', 'broker_agent') then
      raise exception 'Only a platform administrator or broker operator may update a task' using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.lead_allocations allocation
      where allocation.lead_id = selected_task.lead_id
        and allocation.buyer_organisation_id = acting_profile.organisation_id
        and allocation.status = 'accepted'
    ) then
      raise exception 'Lead is not allocated to your organisation' using errcode = '42501';
    end if;
  end if;

  actor_label := coalesce(auth.jwt() ->> 'email', 'dashboard_user');

  update public.lead_tasks
  set status = p_status, completed_at = now()
  where id = p_task_id;

  insert into public.lead_activities (lead_id, kind, summary, actor_id, actor_label, metadata)
  values (
    selected_task.lead_id,
    case when p_status = 'completed' then 'task_completed' else 'task_cancelled' end,
    case when p_status = 'completed' then 'Task completed: ' else 'Task cancelled: ' end || selected_task.title,
    auth.uid(), actor_label,
    jsonb_build_object('taskId', p_task_id)
  );

  return jsonb_build_object('id', p_task_id, 'leadId', selected_task.lead_id, 'status', p_status);
end;
$$;

revoke all on function public.complete_lead_task(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_lead_task(uuid, text) to authenticated;
