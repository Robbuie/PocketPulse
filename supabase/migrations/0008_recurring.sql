-- 0.8.0: recurring bills and subscriptions.
--
-- One row per thing expected every month or year. status 'dismissed' records
-- a suggestion the household said is not recurring, so it is not suggested
-- again. Auto-logged charges are ordinary transactions with import_id
-- 'rec:<item id>:<cycle>', made unique per household by 0006's index.
--
-- Additive and safe to run more than once. Run it before deploying 0.8.0.

create table if not exists public.recurring_items (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  name             text not null check (btrim(name) <> ''),
  -- how to recognize it in transactions, as in merchant_rules
  merchant_pattern text not null default '',
  amount           numeric(10, 2) not null default 0 check (amount >= 0),
  amount_varies    boolean not null default false,
  cadence          text not null default 'monthly' check (cadence in ('monthly', 'yearly')),
  day_of_month     smallint not null default 1 check (day_of_month between 1 and 31),
  month_of_year    smallint check (month_of_year between 1 and 12),
  budget_line_id   text,
  autolog          boolean not null default false,
  status           text not null default 'active' check (status in ('active', 'paused', 'dismissed')),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint recurring_yearly_needs_month check (cadence <> 'yearly' or month_of_year is not null)
);

create index if not exists recurring_items_household_idx on public.recurring_items (household_id);

alter table public.recurring_items enable row level security;

drop policy if exists "recurring_items_household" on public.recurring_items;
create policy "recurring_items_household" on public.recurring_items
  for all to authenticated
  using (household_id in (select household_id from public.profiles where id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where id = auth.uid()));

revoke all on public.recurring_items from anon;
grant select, insert, update, delete on public.recurring_items to authenticated;

drop trigger if exists recurring_items_touch on public.recurring_items;
create trigger recurring_items_touch
  before update on public.recurring_items
  for each row execute function public.touch_updated_at();
