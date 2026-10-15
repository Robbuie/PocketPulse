-- 0.6.0: bank statement import and merchant rules.
--
-- transactions gains where a row came from: import_id identifies a
-- statement line (the bank's own id from a QFX/OFX file, or one worked out
-- from date, amount and description for CSV), so importing the same file
-- twice adds nothing; source and account say how and from where it arrived.
-- merchant_rules remembers "this merchant goes to that budget line".
-- import_profiles remembers which CSV column is which, per bank layout.
--
-- Additive only and safe to run more than once. The app keeps working
-- before and after it runs, but 0.6.0's import screen needs it, so run it
-- before deploying.

alter table public.transactions add column if not exists import_id text;
alter table public.transactions add column if not exists source text;
alter table public.transactions add column if not exists account text;

-- Unique per household; rows without an import_id (typed in, quick add,
-- receipts) never collide because nulls are distinct.
create unique index if not exists transactions_household_import_idx
  on public.transactions (household_id, import_id);

create table if not exists public.merchant_rules (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  -- a merchant name as the app shortens it ("KROGER"), or any text the
  -- bank description contains
  pattern        text not null check (btrim(pattern) <> ''),
  -- 'line': send to budget_line_id. 'skip': leave out of imports.
  action         text not null default 'line' check (action in ('line', 'skip')),
  budget_line_id text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, pattern)
);

create table if not exists public.import_profiles (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- the file's header row, lower-cased and joined with |
  signature    text not null,
  name         text not null default '',
  mapping      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  unique (household_id, signature)
);

alter table public.merchant_rules  enable row level security;
alter table public.import_profiles enable row level security;

drop policy if exists "merchant_rules_household" on public.merchant_rules;
create policy "merchant_rules_household" on public.merchant_rules
  for all to authenticated
  using (household_id in (select household_id from public.profiles where id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where id = auth.uid()));

drop policy if exists "import_profiles_household" on public.import_profiles;
create policy "import_profiles_household" on public.import_profiles
  for all to authenticated
  using (household_id in (select household_id from public.profiles where id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where id = auth.uid()));

revoke all on public.merchant_rules, public.import_profiles from anon;
grant select, insert, update, delete on public.merchant_rules, public.import_profiles to authenticated;

-- touch_updated_at() comes from 0004.
drop trigger if exists merchant_rules_touch on public.merchant_rules;
create trigger merchant_rules_touch
  before update on public.merchant_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists import_profiles_touch on public.import_profiles;
create trigger import_profiles_touch
  before update on public.import_profiles
  for each row execute function public.touch_updated_at();
