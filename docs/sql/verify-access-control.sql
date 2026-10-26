-- Read-only checks of the live database's access control. Safe to run in
-- the Supabase SQL editor at any time: it only reads the system catalogue
-- and counts rows. Each query should return NO rows unless noted.

-- 1. Public tables without row-level security.
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- 2. Write, truncate, trigger or reference privileges held by the public key.
select c.relname as table_name, privilege
from pg_class c join pg_namespace n on n.oid = c.relnamespace,
  unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege
where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, privilege);

-- 3. TRUNCATE held by signed-in users (RLS does not apply to TRUNCATE).
select c.relname as truncatable_by_authenticated
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'TRUNCATE');

-- 4. SECURITY DEFINER functions without a fixed search_path.
select p.oid::regprocedure as unpinned_function
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting where setting like 'search_path=%');

-- 5. SECURITY DEFINER functions anonymous callers can run, other than the
--    read-only helpers RLS policies use and trigger functions.
select p.oid::regprocedure as callable_by_anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute')
  and p.proname not in ('can_approve_campaigns', 'can_manage_campaigns', 'current_organisation_id',
    'current_profile_role', 'is_broker_operator', 'is_compliance_auditor', 'is_platform_admin');

-- 6. Server-only functions signed-in users or anonymous callers can run.
select p.oid::regprocedure as server_only_but_exposed
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('capture_public_lead', 'check_lead_submission_rate_limit', 'claim_campaign_send_lease',
    'release_campaign_send_lease', 'campaign_send_usage', 'create_platform_sending_identity',
    'pause_sending_identity', 'task_digest_rows')
  and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));

-- 7. (Informational, returns rows) FYE plans per workspace after the
--    202610270001 migration. "platform-wide" plans are visible to every
--    workspace; check none of them is really one broker's private plan.
select coalesce(o.name, 'platform-wide') as workspace, count(*) as plans
from public.financial_year_calendars plan
left join public.organisations o on o.id = plan.organisation_id
group by 1 order by 1;
