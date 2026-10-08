-- Move credit accounting to the server.
-- Before: the browser updated profiles.credits / promo_used directly and the promo code
-- shipped in the JS bundle, so any signed-in user could grant themselves unlimited scans.
-- After: clients may read their own profile and change only `language`; credits change
-- only through the security-definer functions below.

create extension if not exists pgcrypto with schema extensions;

-- 1. Lock down profiles ------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_update_own_language" on public.profiles;
create policy "profiles_update_own_language" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Column-level privileges: the only thing a client may write is its language.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (language, updated_at) on public.profiles to authenticated;

-- 2. Promo codes live in a private table, stored as hashes --------------------
create table if not exists public.promo_codes (
  code_hash text primary key,          -- encode(digest(lower(trim(code)), 'sha256'), 'hex')
  bonus_credits integer not null default 100 check (bonus_credits > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

-- 3. Functions ----------------------------------------------------------------
-- Returns the caller's profile, creating it (10 credits) or refilling it to 10
-- when the caller's local day has changed. p_today is the client's local date.
create or replace function public.refresh_my_credits(p_today date, p_language text default null)
returns table (credits integer, is_premium boolean, promo_used boolean, language text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  -- Reject wildly wrong client dates (allow ±1 day for time zones).
  if p_today is null or abs(p_today - (now() at time zone 'utc')::date) > 1 then
    p_today := (now() at time zone 'utc')::date;
  end if;

  insert into public.profiles (id, credits, last_reset_at, language, updated_at)
  values (v_uid, 10, p_today, coalesce(p_language, 'en'), now())
  on conflict (id) do nothing;

  update public.profiles p
     set credits = greatest(p.credits, 10), last_reset_at = p_today, updated_at = now()
   where p.id = v_uid and p.last_reset_at is distinct from p_today and p_today > coalesce(p.last_reset_at, '-infinity'::date);

  return query
    select p.credits, coalesce(p.is_premium, false), coalesce(p.promo_used, false), p.language
      from public.profiles p where p.id = v_uid;
end;
$$;

-- Spends one credit. Returns the remaining credits, or -1 when none were left.
create or replace function public.consume_my_credit()
returns integer language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_left integer; v_premium boolean;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select coalesce(is_premium, false) into v_premium from public.profiles where id = v_uid;
  if v_premium then
    select credits into v_left from public.profiles where id = v_uid;
    return v_left;
  end if;
  update public.profiles set credits = credits - 1, updated_at = now()
   where id = v_uid and credits > 0
  returning credits into v_left;
  return coalesce(v_left, -1);
end;
$$;

-- Redeems a promo code once per account. Returns 'success', 'invalidCode' or 'alreadyUsed'.
create or replace function public.redeem_promo_code(p_code text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_bonus integer; v_done integer;
begin
  if v_uid is null then return 'loginFirst'; end if;
  select bonus_credits into v_bonus from public.promo_codes
   where active and code_hash = encode(digest(lower(trim(coalesce(p_code, ''))), 'sha256'), 'hex');
  if v_bonus is null then return 'invalidCode'; end if;
  update public.profiles set credits = credits + v_bonus, promo_used = true, updated_at = now()
   where id = v_uid and not coalesce(promo_used, false);
  get diagnostics v_done = row_count;
  return case when v_done = 1 then 'success' else 'alreadyUsed' end;
end;
$$;

revoke all on function public.refresh_my_credits(date, text) from public, anon;
revoke all on function public.consume_my_credit() from public, anon;
revoke all on function public.redeem_promo_code(text) from public, anon;
grant execute on function public.refresh_my_credits(date, text) to authenticated;
grant execute on function public.consume_my_credit() to authenticated;
grant execute on function public.redeem_promo_code(text) to authenticated;

-- 4. After running this, add a NEW promo code (the old one was public in the bundle):
--   insert into public.promo_codes (code_hash, bonus_credits)
--   values (encode(extensions.digest(lower('YOUR-NEW-CODE'), 'sha256'), 'hex'), 100);
