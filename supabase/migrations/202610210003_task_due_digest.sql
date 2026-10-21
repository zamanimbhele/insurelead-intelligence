-- Daily task digest: an email each morning listing a broker user's
-- overdue and due-today follow-up tasks (backlog: "a separate
-- notification/digest mechanism that proactively alerts a broker when a
-- task is due or overdue").
--
-- Who sees which tasks (open tasks with a due date, on leads accepted by
-- the user's own organisation, not deleted):
--   broker_admin - every such task in the organisation
--   broker_agent - tasks they created, or whose free-text assignee
--                  matches their display name or email
-- Only active members of active organisations who have not switched the
-- digest off are included.

-- 1. Per-user opt-out (default on).
alter table public.profiles
  add column if not exists task_digest_enabled boolean not null default true;

-- 2. Delivery log: at most one digest per user per SAST day. The scheduler
--    inserts the row before sending (on conflict do nothing), so two
--    overlapping runs can never email the same person twice.
create table if not exists public.task_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  digest_date date not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  task_count integer not null default 0 check (task_count >= 0),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, digest_date)
);

alter table public.task_digest_deliveries enable row level security;
revoke all on public.task_digest_deliveries from public, anon, authenticated;
create policy "users view own digest deliveries"
  on public.task_digest_deliveries for select
  using (profile_id = auth.uid() or public.is_platform_admin());
grant select on public.task_digest_deliveries to authenticated;

create index if not exists lead_tasks_open_due_idx
  on public.lead_tasks (due_at)
  where status = 'open' and due_at is not null;

-- 3. Everything the digest needs in one query (service role only - it
--    reads auth.users for the recipient's email address).
create or replace function public.task_digest_rows(p_due_before timestamptz, p_profile_id uuid default null)
returns table (
  profile_id uuid,
  email text,
  display_name text,
  role text,
  organisation_id uuid,
  task_id uuid,
  task_title text,
  due_at timestamptz,
  assignee_label text,
  lead_id uuid,
  lead_label text,
  lead_do_not_contact boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    profile.id,
    account.email,
    profile.display_name,
    profile.role,
    profile.organisation_id,
    task.id,
    task.title,
    task.due_at,
    task.assignee_label,
    lead.id,
    -- Keep personal data in the email to the minimum needed to recognise
    -- the lead: the business name, or just the contact's first name.
    coalesce(nullif(trim(lead.business_name), ''), split_part(trim(lead.contact_full_name), ' ', 1)),
    lead.do_not_contact
  from public.profiles profile
  join auth.users account on account.id = profile.id
  join public.organisations organisation on organisation.id = profile.organisation_id
  join public.lead_allocations allocation
    on allocation.buyer_organisation_id = profile.organisation_id and allocation.status = 'accepted'
  join public.lead_tasks task on task.lead_id = allocation.lead_id
  join public.leads lead on lead.id = task.lead_id
  where profile.member_status = 'active'
    and profile.task_digest_enabled
    and profile.role in ('broker_admin', 'broker_agent')
    and organisation.status = 'active'
    and task.status = 'open'
    and task.due_at is not null
    and task.due_at < p_due_before
    and lead.deleted_at is null
    and (p_profile_id is null or profile.id = p_profile_id)
    and (
      profile.role = 'broker_admin'
      or task.created_by = profile.id
      or lower(trim(task.assignee_label)) in (lower(trim(profile.display_name)), lower(account.email))
    )
  order by profile.id, task.due_at;
$$;

revoke all on function public.task_digest_rows(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.task_digest_rows(timestamptz, uuid) to service_role;

-- 4. A signed-in user switches their own digest on or off.
create or replace function public.set_own_task_digest_preference(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_enabled is null then
    raise exception 'A digest preference is required' using errcode = '22023';
  end if;
  update public.profiles
  set task_digest_enabled = p_enabled, updated_at = now()
  where id = auth.uid();
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('taskDigestEnabled', p_enabled);
end;
$$;

revoke all on function public.set_own_task_digest_preference(boolean) from public, anon, authenticated;
grant execute on function public.set_own_task_digest_preference(boolean) to authenticated;
