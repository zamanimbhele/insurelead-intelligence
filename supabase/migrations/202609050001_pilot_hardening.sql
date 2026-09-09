create table if not exists public.lead_submission_windows (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count >= 1),
  updated_at timestamptz not null default now(),
  constraint lead_submission_windows_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$')
);

alter table public.lead_submission_windows enable row level security;

revoke all on public.lead_submission_windows from public, anon, authenticated;

create index if not exists lead_submission_windows_updated_at_idx
  on public.lead_submission_windows (updated_at);

create or replace function public.check_lead_submission_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  checked_at timestamptz := clock_timestamp();
  observed_count integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit key' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid rate-limit maximum' using errcode = '22023';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit window' using errcode = '22023';
  end if;

  delete from public.lead_submission_windows
  where updated_at < checked_at - interval '7 days';

  insert into public.lead_submission_windows (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_key_hash,
    checked_at,
    1,
    checked_at
  )
  on conflict (key_hash) do update
  set
    request_count = case
      when lead_submission_windows.window_started_at
        <= checked_at - make_interval(secs => p_window_seconds)
        then 1
      else lead_submission_windows.request_count + 1
    end,
    window_started_at = case
      when lead_submission_windows.window_started_at
        <= checked_at - make_interval(secs => p_window_seconds)
        then checked_at
      else lead_submission_windows.window_started_at
    end,
    updated_at = checked_at
  returning request_count into observed_count;

  return observed_count <= p_limit;
end;
$$;

revoke all on function public.check_lead_submission_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_lead_submission_rate_limit(text, integer, integer)
  to service_role;

comment on table public.lead_submission_windows is
  'HMAC-keyed public lead submission counters. Raw client IP addresses are never stored.';

comment on function public.check_lead_submission_rate_limit(text, integer, integer) is
  'Atomically increments a lead submission window and returns whether the request is allowed.';
