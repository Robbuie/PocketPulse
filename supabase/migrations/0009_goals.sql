-- 0.9.0: savings goals (sinking funds).
--
-- A goal is money set aside for something coming: car repairs, Christmas, a
-- vacation. What has been saved is the sum of its entries: money put in is
-- positive, money taken out to pay for the thing is negative. Keeping
-- entries rather than one balance means both members can add at once
-- without overwriting each other, and there is a history.
--
-- Additive and safe to run more than once. Run it before deploying 0.9.0.

create table if not exists public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  target_amount numeric(10, 2) not null default 0 check (target_amount >= 0),
  target_date   date,
  status        text not null default 'active' check (status in ('active', 'archived')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.goal_entries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  goal_id      uuid not null references public.savings_goals (id) on delete cascade,
  amount       numeric(10, 2) not null check (amount <> 0),
  date         date not null default current_date,
  note         text not null default '',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists goal_entries_goal_idx on public.goal_entries (goal_id, date desc);
create index if not exists savings_goals_household_idx on public.savings_goals (household_id);

alter table public.savings_goals enable row level security;
alter table public.goal_entries  enable row level security;

drop policy if exists "savings_goals_household" on public.savings_goals;
create policy "savings_goals_household" on public.savings_goals
  for all to authenticated
  using (household_id in (select household_id from public.profiles where id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where id = auth.uid()));

-- An entry must belong to a goal of the same household, or a member could
-- attach entries to another household's goal by its id.
drop policy if exists "goal_entries_household" on public.goal_entries;
create policy "goal_entries_household" on public.goal_entries
  for all to authenticated
  using (household_id in (select household_id from public.profiles where id = auth.uid()))
  with check (
    household_id in (select household_id from public.profiles where id = auth.uid())
    and goal_id in (select id from public.savings_goals g where g.household_id = goal_entries.household_id)
  );

revoke all on public.savings_goals, public.goal_entries from anon;
grant select, insert, update, delete on public.savings_goals, public.goal_entries to authenticated;

drop trigger if exists savings_goals_touch on public.savings_goals;
create trigger savings_goals_touch
  before update on public.savings_goals
  for each row execute function public.touch_updated_at();
