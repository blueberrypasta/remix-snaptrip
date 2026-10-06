-- Anonymous browser trials; no personal records or credentials are stored.
create table if not exists public.guest_taste_usage (
  guest_id uuid primary key,
  used integer not null default 0 check (used between 0 and 10),
  created_at timestamptz not null default now()
);
alter table public.guest_taste_usage enable row level security;
revoke all on public.guest_taste_usage from anon, authenticated;
create or replace function public.guest_taste_quota(p_guest_id uuid, p_operation text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_used integer;
begin
  if p_operation not in ('status','consume','refund') then raise exception 'invalid operation'; end if;
  insert into public.guest_taste_usage (guest_id) values (p_guest_id) on conflict do nothing;
  if p_operation = 'consume' then
    update public.guest_taste_usage set used = used + 1 where guest_id = p_guest_id and used < 10 returning used into v_used;
    return coalesce(v_used, -1);
  elsif p_operation = 'refund' then
    update public.guest_taste_usage set used = greatest(0, used - 1) where guest_id = p_guest_id returning used into v_used;
  else
    select used into v_used from public.guest_taste_usage where guest_id = p_guest_id;
  end if;
  return v_used;
end;
$$;
revoke all on function public.guest_taste_quota(uuid,text) from public,anon,authenticated;
grant execute on function public.guest_taste_quota(uuid,text) to service_role;
