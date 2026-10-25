-- Request-attempt rate budget table & atomic counter RPC.
-- Counts attempts reaching upstream (not financial dollars / token billing). Fixed UTC minute/day window boundaries.
create table if not exists public.gemini_proxy_request_budgets (
  bucket text primary key,
  used integer not null default 0 check (used >= 0),
  expires_at timestamptz not null
);

alter table public.gemini_proxy_request_budgets enable row level security;
revoke all on table public.gemini_proxy_request_budgets from public, anon, authenticated;
grant select, insert, update, delete on table public.gemini_proxy_request_budgets to service_role;

create or replace function public.consume_gemini_proxy_budget(p_caller text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_min text := to_char(v_now at time zone 'UTC', 'YYYYMMDDHH24MI');
  v_day text := to_char(v_now at time zone 'UTC', 'YYYYMMDD');
  b_glob_min text := 'global:min:' || v_min;
  b_glob_day text := 'global:day:' || v_day;
  b_call_min text;
  b_call_day text;
  c_glob_min int;
  c_glob_day int;
  c_call_min int;
  c_call_day int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'access denied' using errcode = '42501';
  end if;

  if p_caller is null or p_caller !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  b_call_min := 'caller:min:' || p_caller || ':' || v_min;
  b_call_day := 'caller:day:' || p_caller || ':' || v_day;

  perform pg_advisory_xact_lock(hashtext('gemini_proxy_budget_lock'));

  select coalesce((select used from public.gemini_proxy_request_budgets where bucket = b_glob_min), 0) into c_glob_min;
  select coalesce((select used from public.gemini_proxy_request_budgets where bucket = b_glob_day), 0) into c_glob_day;
  select coalesce((select used from public.gemini_proxy_request_budgets where bucket = b_call_min), 0) into c_call_min;
  select coalesce((select used from public.gemini_proxy_request_budgets where bucket = b_call_day), 0) into c_call_day;

  if c_call_min >= 20 or c_call_day >= 100 or c_glob_min >= 120 or c_glob_day >= 250 then
    return false;
  end if;

  insert into public.gemini_proxy_request_budgets (bucket, used, expires_at)
  values
    (b_glob_min, 1, v_now + interval '5 minutes'),
    (b_glob_day, 1, v_now + interval '2 days'),
    (b_call_min, 1, v_now + interval '5 minutes'),
    (b_call_day, 1, v_now + interval '2 days')
  on conflict (bucket) do update set used = public.gemini_proxy_request_budgets.used + 1;

  delete from public.gemini_proxy_request_budgets where expires_at < v_now;

  return true;
end;
$$;

revoke all on function public.consume_gemini_proxy_budget(text) from public, anon, authenticated;
grant execute on function public.consume_gemini_proxy_budget(text) to service_role;
