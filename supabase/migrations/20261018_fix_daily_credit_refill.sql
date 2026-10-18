-- Fix: signed-in users never got their daily 10 credits back.
-- profiles.email is NOT NULL, and refresh_my_credits inserted a row without email.
-- Postgres checks NOT NULL before ON CONFLICT DO NOTHING, so every call raised an error,
-- the refill UPDATE never ran, and the app fell back to stale local credits.
create or replace function public.refresh_my_credits(p_today date, p_language text default null)
returns table (credits integer, is_premium boolean, promo_used boolean, language text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_today is null or abs(p_today - (now() at time zone 'utc')::date) > 1 then
    p_today := (now() at time zone 'utc')::date;
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    select coalesce(u.email, '') into v_email from auth.users u where u.id = v_uid;
    insert into public.profiles (id, email, credits, last_reset_at, language, updated_at)
    values (v_uid, coalesce(v_email, ''), 10, p_today, coalesce(p_language, 'en'), now())
    on conflict (id) do nothing;
  end if;

  update public.profiles p
     set credits = greatest(p.credits, 10), last_reset_at = p_today, updated_at = now()
   where p.id = v_uid and p.last_reset_at is distinct from p_today and p_today > coalesce(p.last_reset_at, '-infinity'::date);

  return query
    select p.credits, coalesce(p.is_premium, false), coalesce(p.promo_used, false), p.language
      from public.profiles p where p.id = v_uid;
end;
$$;
revoke all on function public.refresh_my_credits(date, text) from public, anon;
grant execute on function public.refresh_my_credits(date, text) to authenticated;
