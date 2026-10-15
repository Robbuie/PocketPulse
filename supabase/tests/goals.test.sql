-- Checks for 0009_goals.sql. Each step prints what it expects.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) is not null as as_d;

\echo '--- d makes a goal and puts money in and takes some out; expect saved 150'
insert into savings_goals (household_id, name, target_amount, target_date) values ('11111111-1111-1111-1111-111111111111', 'Christmas', 800, '2026-12-15') returning name;
insert into goal_entries (household_id, goal_id, amount) select household_id, id, 200 from savings_goals where name = 'Christmas';
insert into goal_entries (household_id, goal_id, amount, note) select household_id, id, -50, 'early present' from savings_goals where name = 'Christmas';
select sum(amount) as saved from goal_entries;
\echo 'expect: check error for a zero entry'
insert into goal_entries (household_id, goal_id, amount) select household_id, id, 0 from savings_goals where name = 'Christmas';

\echo '--- f, in another household, makes its own goal'
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000f');
insert into households (id, name) values ('22222222-2222-2222-2222-222222222222', 'Other');
insert into profiles (id, household_id) values ('00000000-0000-0000-0000-00000000000f', '22222222-2222-2222-2222-222222222222');
select id as d_goal from savings_goals where name = 'Christmas' \gset
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000f',false) is not null as as_f;
insert into savings_goals (household_id, name) values ('22222222-2222-2222-2222-222222222222', 'F fund');
\echo 'expect: f sees only its own goal (1) and no entries'
select count(*) as f_goals, (select count(*) from goal_entries) as f_entries from savings_goals;
\echo 'expect: row-level security error (entry on the other household goal, labeled as its own household)'
insert into goal_entries (household_id, goal_id, amount) values ('22222222-2222-2222-2222-222222222222', :'d_goal', 10);
reset role;
\echo 'expect: still 150'
select sum(amount) as d_saved from goal_entries where goal_id = :'d_goal';
set role anon; select count(*) from savings_goals; reset role;
