-- 0.3.0: household membership is decided by the database, not the browser.
--
-- Before this, row level security was switched off on households, so anyone
-- holding the app's public key could list every household with its invite
-- code, and rename or delete it. And the app joined a household by writing
-- household_id onto the user's own profile, which the profiles policy
-- accepted for any value, so anyone who learned a household's id could make
-- themselves a member and read its data.
--
-- After this, RLS is on for every app table, households are created and
-- joined only through two functions that run with the table owner's rights
-- and check the caller, and a user can no longer set household_id on their
-- profile directly.
--
-- Safe to run more than once. Run it before deploying app 0.3.0; the 0.2.0
-- app's create and join screens stop working once it is applied, while
-- signed-in members are unaffected.

-- Every table the app uses has policies; make sure they are enforced.
alter table public.households    enable row level security;
alter table public.profiles      enable row level security;
alter table public.debts         enable row level security;
alter table public.transactions  enable row level security;
alter table public.budget_config enable row level security;
alter table public.kids          enable row level security;
alter table public.kid_expenses  enable row level security;

-- Create a household and make the caller its first member.
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Enter a household name';
  end if;
  if exists (select 1 from profiles where id = v_uid and household_id is not null) then
    raise exception 'You are already in a household';
  end if;

  insert into households (name, created_by)
  values (btrim(p_name), v_uid)
  returning * into v_household;

  insert into profiles (id, household_id)
  values (v_uid, v_household.id)
  on conflict (id) do update set household_id = excluded.household_id;

  return v_household;
end;
$$;

-- Join the household that owns this invite code.
create or replace function public.join_household(p_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from profiles where id = v_uid and household_id is not null) then
    raise exception 'You are already in a household';
  end if;

  select * into v_household
  from households
  where invite_code = upper(btrim(p_code));

  if not found then
    raise exception 'Invite code not found. Check it and try again.';
  end if;

  insert into profiles (id, household_id)
  values (v_uid, v_household.id)
  on conflict (id) do update set household_id = excluded.household_id;

  return v_household;
end;
$$;

-- Only signed-in users may call them.
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- Households are created only through create_household now.
drop policy if exists "households_insert" on public.households;

-- A user may still create and edit their own profile, but only these
-- columns. household_id is set only by the functions above. The app upserts
-- {id, email, name}, which needs insert and update on exactly those three.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, email, name) on public.profiles to authenticated;
grant update (id, email, name) on public.profiles to authenticated;
