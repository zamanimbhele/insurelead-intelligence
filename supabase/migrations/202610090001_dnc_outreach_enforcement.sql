-- Do Not Contact enforcement for the ad-hoc interaction-logging and
-- follow-up task-creation RPCs (project brief section 6: "a visible 'Do
-- Not Contact' action that immediately prevents future marketing or
-- broker outreach actions"). Every other outreach surface already
-- excludes do_not_contact leads: campaign audience evaluation
-- (evaluateCampaignAudience() in src/lib/campaign-policy.ts and
-- prepare_campaign_recipients() in 202609110002_campaign_generation_mcp.
-- sql), the MCP server's lead tools (src/mcp/server.ts), lead-marketplace
-- allocation eligibility (getAllocationEligibility() in
-- src/lib/marketplace-store.ts), and the FYE bulk follow-up task
-- generator (leadsForFyeFollowUp() pre-filters before calling
-- create_lead_task). The one gap was this pair of single/ad-hoc RPCs
-- (202610030002_lead_activity_workflow.sql): a broker could still log a
-- brand-new outbound interaction or create a brand-new follow-up task
-- against a lead that is flagged do-not-contact, with no check in either
-- the demo-store or Supabase code path.
--
-- add_lead_note() and complete_lead_task() are deliberately left
-- unchanged: an internal note is not outreach, and resolving (completing
-- or cancelling) a task that already exists must stay possible even
-- after a lead becomes do-not-contact - e.g. to cancel a now-irrelevant
-- follow-up. Only the creation of new outreach-shaped records is
-- blocked. Error wording matches the existing
-- getAllocationEligibility() convention in src/lib/marketplace-store.ts
-- ("Lead is marked do not contact") so API routes can share one
-- safeErrors allow-list entry across both surfaces.
--
-- create or replace function, same signatures - no drop needed, matching
-- the established convention for this migration series.

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
  target_lead public.leads%rowtype;
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

  select * into target_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if target_lead.do_not_contact then
    raise exception 'Lead is marked do not contact' using errcode = '42501';
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
  target_lead public.leads%rowtype;
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

  select * into target_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if target_lead.do_not_contact then
    raise exception 'Lead is marked do not contact' using errcode = '42501';
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
