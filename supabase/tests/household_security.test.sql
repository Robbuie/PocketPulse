-- Access checks for 0003_household_security.sql. Each step prints what it
-- expects; an ERROR line is the right outcome where the expectation says so.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\echo '--- A signs up (app upsert of id,email,name) and creates a household'
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into profiles (id,email,name) values (auth.uid(),'a@x','A') on conflict (id) do update set id=excluded.id,email=excluded.email,name=excluded.name;
select name, created_by = auth.uid() as created_by_ok from create_household('  The House ');
select household_id is not null as a_member from profiles where id = auth.uid();
insert into debts (household_id,name) select household_id,'Card' from profiles where id = auth.uid();
select count(*) as a_sees_debts from debts;
\echo '--- A cannot create a second household'
select create_household('Other');
reset role;
\echo '--- B joins with the code (lowercase, padded)'
select set_config('test.code', (select lower(invite_code) from households), false);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select name from join_household('  ' || current_setting('test.code') || ' ');
select count(*) as b_sees_debts from debts;
\echo '--- C: bad code, then direct household_id writes, then a normal profile upsert'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select join_household('ZZZZZZZZ');
reset role; select set_config('test.hid', (select household_id::text from profiles where id='00000000-0000-0000-0000-00000000000a'), false);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
\echo 'expect: permission denied (insert with household_id)'
insert into profiles (id,email,name,household_id) values (auth.uid(),'c@x','C',current_setting('test.hid')::uuid);
\echo 'expect: succeeds (the app profile upsert)'
insert into profiles (id,email,name) values (auth.uid(),'c@x','C') on conflict (id) do update set id=excluded.id,email=excluded.email,name=excluded.name;
\echo 'expect: permission denied (direct household_id update)'
update profiles set household_id = current_setting('test.hid')::uuid where id = auth.uid();
update profiles set name = 'C2' where id = auth.uid();
select name, household_id is null as c_not_member from profiles where id = auth.uid();
select count(*) as c_sees_debts from debts;
select count(*) as c_sees_households from households;
\echo '--- C cannot insert a household directly any more'
insert into households (name) values ('sneaky');
reset role;
\echo '--- anon sees no households and cannot change them (was possible with RLS off)'
set role anon; select count(*) as anon_sees_households from households;
update households set name = 'x'; delete from households;
reset role; select count(*) as households_left from households;
\echo '--- anon cannot call the functions'
set role anon; select create_household('x'); reset role;
