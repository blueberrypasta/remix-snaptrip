-- Guest taste recommendations: 10 per day (Pacific date) instead of 10 for good.
alter table public.guest_taste_usage add column if not exists usage_date date not null default ((now() at time zone 'America/Los_Angeles')::date);

create or replace function public.guest_taste_quota(p_guest_id uuid, p_operation text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_used integer; v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if p_operation not in ('status','consume','refund') then raise exception 'invalid operation'; end if;
  insert into public.guest_taste_usage (guest_id, usage_date) values (p_guest_id, v_today) on conflict do nothing;
  update public.guest_taste_usage set used = 0, usage_date = v_today where guest_id = p_guest_id and usage_date <> v_today;
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
