-- 0.4.0: the shopping list gets its own table.
--
-- Until now the whole list was one JSON value in budget_config, and every
-- change rewrote all of it, so two people editing at the same time silently
-- undid each other (whoever saved last won). Now each item is its own row:
-- checking one item off writes that row only, and the other phone hears
-- about it through Realtime.
--
-- Existing lists are copied in, newest first as before. A household is
-- copied only if it has no shopping items yet, so running this again later
-- does not bring back items deleted in the meantime. budget_config.shopping_list
-- is left in place, unused, so 0.3.0 still works if a rollback is needed; a
-- later migration drops it.
--
-- Run it, then deploy app 0.4.0 straight away: anything added to the list
-- with 0.3.0 after the copy will not appear in 0.4.0.

create table if not exists public.shopping_items (
  -- text, not uuid: the ids already in the JSON list are short strings
  id           text primary key default gen_random_uuid()::text,
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  qty          text not null default '',
  unit         text not null default 'count',
  notes        text not null default '',
  -- {storeId: {price, pkgQty, pkgUnit, deal?}}, or a plain number from 0.1.0
  prices       jsonb not null default '{}'::jsonb,
  checked      boolean not null default false,
  added        date default current_date,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists shopping_items_household_created_idx
  on public.shopping_items (household_id, created_at desc);

alter table public.shopping_items enable row level security;

drop policy if exists "shopping_items_household" on public.shopping_items;
create policy "shopping_items_household" on public.shopping_items
  for all to authenticated
  using (household_id in (select household_id from public.profiles where id = auth.uid()))
  with check (household_id in (select household_id from public.profiles where id = auth.uid()));

revoke all on public.shopping_items from anon;
grant select, insert, update, delete on public.shopping_items to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shopping_items_touch on public.shopping_items;
create trigger shopping_items_touch
  before update on public.shopping_items
  for each row execute function public.touch_updated_at();

-- Live updates between phones.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'
     ) then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end;
$$;

-- Copy existing lists. created_at steps back a millisecond per position so
-- ordering by created_at desc keeps the list in its current order.
insert into public.shopping_items
  (id, household_id, name, qty, unit, notes, prices, checked, added, created_at)
select
  coalesce(nullif(e.item ->> 'id', ''), gen_random_uuid()::text),
  b.household_id,
  coalesce(nullif(btrim(e.item ->> 'name'), ''), '(unnamed)'),
  coalesce(e.item ->> 'qty', ''),
  coalesce(nullif(e.item ->> 'unit', ''), 'count'),
  coalesce(e.item ->> 'notes', ''),
  case when jsonb_typeof(e.item -> 'prices') = 'object' then e.item -> 'prices' else '{}'::jsonb end,
  coalesce(e.item -> 'checked' = 'true'::jsonb, false),
  case when e.item ->> 'added' ~ '^\d{4}-\d{2}-\d{2}$' then (e.item ->> 'added')::date end,
  now() - e.ord * interval '1 millisecond'
from public.budget_config b
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(b.shopping_list::jsonb) = 'array' then b.shopping_list::jsonb else '[]'::jsonb end
) with ordinality as e (item, ord)
where not exists (select 1 from public.shopping_items s where s.household_id = b.household_id)
on conflict (id) do nothing;
