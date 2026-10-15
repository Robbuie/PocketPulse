-- Checks for 0008_recurring.sql. Each step prints what it expects.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) is not null as as_d;

\echo '--- member d adds items; expect 2'
insert into recurring_items (household_id, name, merchant_pattern, amount, day_of_month) values ('11111111-1111-1111-1111-111111111111', 'Netflix', 'NETFLIX', 15.49, 9);
insert into recurring_items (household_id, name, amount, cadence, month_of_year, day_of_month) values ('11111111-1111-1111-1111-111111111111', 'Amazon Prime', 139, 'yearly', 3, 4);
select count(*) from recurring_items;
\echo 'expect: check errors (yearly without a month, day 32, unknown status)'
insert into recurring_items (household_id, name, cadence) values ('11111111-1111-1111-1111-111111111111', 'X', 'yearly');
insert into recurring_items (household_id, name, day_of_month) values ('11111111-1111-1111-1111-111111111111', 'X', 32);
insert into recurring_items (household_id, name, status) values ('11111111-1111-1111-1111-111111111111', 'X', 'gone');

\echo '--- the same auto-log from both phones is saved once; expect 1 then 0 rows'
insert into transactions (household_id, amount, merchant, date, import_id, source) values ('11111111-1111-1111-1111-111111111111', 1400, 'Rent', '2026-10-01', 'rec:r:2026-10', 'recurring') on conflict (household_id, import_id) do nothing returning merchant;
insert into transactions (household_id, amount, merchant, date, import_id, source) values ('11111111-1111-1111-1111-111111111111', 1400, 'Rent', '2026-10-01', 'rec:r:2026-10', 'recurring') on conflict (household_id, import_id) do nothing returning merchant;

\echo '--- outsider a sees none and cannot add; anon denied'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) is not null as as_a;
select count(*) as a_sees from recurring_items;
insert into recurring_items (household_id, name) values ('11111111-1111-1111-1111-111111111111', 'sneaky');
reset role;
set role anon; select count(*) from recurring_items; reset role;
