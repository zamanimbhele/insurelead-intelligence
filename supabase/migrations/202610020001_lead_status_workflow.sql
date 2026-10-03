-- Lead pipeline Kanban board: a dashboard-facing way to move a lead between
-- its 13 lifecycle statuses. Direct UPDATE access to public.leads is
-- intentionally not granted to the authenticated role (see
-- 202609030002_production_pilot.sql), so this change - like
-- respond_to_lead_allocation() before it - adds a narrow, audited
-- SECURITY DEFINER function instead of a table-level RLS UPDATE policy.

create or replace function public.update_lead_status(
  p_lead_id uuid,
  p_status text
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
begin
  if p_status not in (
    'new', 'contact_attempted', 'contacted', 'qualified', 'consultation_booked',
    'quote_requested', 'quote_issued', 'negotiation', 'won', 'lost', 'nurture',
    'do_not_contact', 'archived'
  ) then
    raise exception 'Status must be a recognised lead pipeline stage' using errcode = '22023';
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

  update public.leads
  set status = p_status,
      do_not_contact = next_do_not_contact,
      updated_at = now()
  where id = p_lead_id;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, actor_label, details)
  values (
    auth.uid(), 'status', p_lead_id, 'lead_status_changed',
    coalesce(auth.jwt() ->> 'email', 'dashboard_user'),
    jsonb_build_object('from', previous_status, 'to', p_status)
  );

  return jsonb_build_object(
    'leadId', p_lead_id,
    'status', p_status,
    'doNotContact', next_do_not_contact
  );
end;
$$;

revoke all on function public.update_lead_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_lead_status(uuid, text)
  to authenticated;
