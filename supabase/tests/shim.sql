-- A stand-in for the parts of Supabase the migrations rely on, so they can
-- be tried on a plain local Postgres before anyone runs them on the real
-- project: the anon and authenticated roles, auth.uid() read from a session
-- setting, and the tables and policies as they were before 0003.
--
-- Run order on an empty database: this file, the migrations, then a test
-- file from this folder (as a superuser; the tests switch roles themselves).

create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- The live schema, as far as the app and the reported policies show it.
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique default upper(substr(md5(random()::text), 1, 8)),
  created_by uuid,
  created_at timestamptz default now()
);
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, name text,
  household_id uuid references households(id) on delete set null,
  created_at timestamptz default now()
);
create table debts (id uuid primary key default gen_random_uuid(), household_id uuid not null references households(id), name text);
create table transactions (id uuid primary key default gen_random_uuid(), household_id uuid not null references households(id), user_id uuid, amount numeric(10,2), merchant text, date date);
create policy transactions_household on transactions for all using (household_id in (select household_id from profiles where id = auth.uid()));
create table budget_config (id uuid primary key default gen_random_uuid(), household_id uuid not null unique references households(id), shopping_list jsonb);
create table kids (id uuid primary key default gen_random_uuid(), household_id uuid not null references households(id));
create table kid_expenses (id uuid primary key default gen_random_uuid(), household_id uuid not null references households(id));
-- As reported by the Supabase linter on 2026-10-14: RLS was off on
-- households (policies present but not enforced), on for the rest.
alter table profiles enable row level security;
alter table debts enable row level security;
alter table transactions enable row level security;
alter table budget_config enable row level security;
alter table kids enable row level security;
alter table kid_expenses enable row level security;
create policy households_insert on households for insert with check (true);
create policy households_select on households for select using (id in (select household_id from profiles where id = auth.uid()));
create policy households_update on households for update using (id in (select household_id from profiles where id = auth.uid()));
create policy profiles_own on profiles for all using (auth.uid() = id);
create policy budget_household on budget_config for all using (household_id in (select household_id from profiles where id = auth.uid()));
create policy debts_household on debts for all using (household_id in (select household_id from profiles where id = auth.uid()));
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d'),('00000000-0000-0000-0000-00000000000e');

-- A household that already existed before 0003, with a shopping list in the
-- old JSON shape: newest first, one price still a plain number from 0.1.0,
-- one item without an id or date. Users d and e are its members.
insert into households (id, name, invite_code) values ('11111111-1111-1111-1111-111111111111', 'Existing', 'EXIST001');
insert into profiles (id, email, name, household_id) values
  ('00000000-0000-0000-0000-00000000000d', 'd@x', 'D', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-00000000000e', 'e@x', 'E', '11111111-1111-1111-1111-111111111111');
insert into budget_config (household_id, shopping_list) values ('11111111-1111-1111-1111-111111111111', '[
  {"id":"newest1","name":"Ground beef","qty":"2","unit":"lbs","notes":"","checked":false,"added":"2026-10-12",
   "prices":{"walmart":{"price":9.2,"pkgQty":2,"pkgUnit":"lbs"},"aldi":{"price":0.3,"pkgQty":1,"pkgUnit":"oz","deal":{"type":"pct","value":"10","expires":""}}}},
  {"id":"middle2","name":"Milk","qty":"1","unit":"gal","checked":true,"added":"2026-10-10","prices":{"walmart":3.49}},
  {"name":"Bread","checked":false}
]'::jsonb);
