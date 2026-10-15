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
create table transactions (id uuid primary key default gen_random_uuid(), household_id uuid not null references households(id));
create table budget_config (id uuid primary key default gen_random_uuid(), household_id uuid not null unique references households(id));
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
create policy debts_household on debts for all using (household_id in (select household_id from profiles where id = auth.uid()));
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
