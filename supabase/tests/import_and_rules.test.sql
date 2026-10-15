-- Checks for 0006_import_and_rules.sql. Each step prints what it expects.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) is not null as as_d;

\echo '--- an import of two lines, then the same file again: expect 2 rows, then 0 new'
insert into transactions (household_id, amount, merchant, date, import_id, source, account)
values ('11111111-1111-1111-1111-111111111111', 84.17, 'Kroger', '2026-10-12', 'csv:c1:a', 'import', 'Capital One ...1234'),
       ('11111111-1111-1111-1111-111111111111', 6.50, 'Blue Bottle', '2026-10-11', 'csv:c1:b', 'import', 'Capital One ...1234')
returning merchant;
insert into transactions (household_id, amount, merchant, date, import_id, source)
values ('11111111-1111-1111-1111-111111111111', 84.17, 'Kroger', '2026-10-12', 'csv:c1:a', 'import')
on conflict (household_id, import_id) do nothing
returning merchant;
\echo 'expect: two typed-in rows without import_id are both allowed'
insert into transactions (household_id, amount, merchant, date) values
  ('11111111-1111-1111-1111-111111111111', 5, 'Coffee', '2026-10-12'),
  ('11111111-1111-1111-1111-111111111111', 5, 'Coffee', '2026-10-12');
select count(*) as d_transactions from transactions;

\echo '--- rules: save, update by pattern (upsert), bad action refused'
insert into merchant_rules (household_id, pattern, budget_line_id, created_by) values ('11111111-1111-1111-1111-111111111111', 'KROGER', 'groc', auth.uid());
insert into merchant_rules (household_id, pattern, budget_line_id) values ('11111111-1111-1111-1111-111111111111', 'KROGER', 'food')
  on conflict (household_id, pattern) do update set budget_line_id = excluded.budget_line_id;
select pattern, action, budget_line_id from merchant_rules;
\echo 'expect: check constraint error'
insert into merchant_rules (household_id, pattern, action) values ('11111111-1111-1111-1111-111111111111', 'X', 'delete');

\echo '--- import profile saved once per layout'
insert into import_profiles (household_id, signature, name, mapping) values ('11111111-1111-1111-1111-111111111111', 'date|description|amount', 'Huntington Checking', '{"date":0}')
  on conflict (household_id, signature) do update set name = excluded.name, mapping = excluded.mapping;
insert into import_profiles (household_id, signature, name, mapping) values ('11111111-1111-1111-1111-111111111111', 'date|description|amount', 'Huntington', '{"date":0}')
  on conflict (household_id, signature) do update set name = excluded.name, mapping = excluded.mapping;
select name from import_profiles;

\echo '--- outsider a sees none of it and cannot add to this household'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) is not null as as_a;
select (select count(*) from merchant_rules) as rules, (select count(*) from import_profiles) as profiles, (select count(*) from transactions where household_id = '11111111-1111-1111-1111-111111111111') as txs;
\echo 'expect: row-level security error'
insert into merchant_rules (household_id, pattern) values ('11111111-1111-1111-1111-111111111111', 'SNEAKY');
reset role;
\echo '--- anon: expect permission denied'
set role anon; select count(*) from merchant_rules; reset role;
