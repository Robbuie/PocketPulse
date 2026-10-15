-- Checks for 0004_shopping_items.sql: the copy from the JSON list, and who
-- can see and change the rows. Each step prints what it expects.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
\echo '--- copied in order, newest first; legacy number price and missing id survive'
select id like 'newest1' or id like 'middle2' or length(id) = 36 as id_ok, name, qty, unit, checked, added,
       jsonb_typeof(prices) as prices_type, prices -> 'walmart' as walmart
from shopping_items where household_id = '11111111-1111-1111-1111-111111111111'
order by created_at desc;
\echo 'expect: 3'
select count(*) as copied from shopping_items;

\echo '--- member d sees the list and can check an item off; updated_at moves'
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) is not null as as_d;
select count(*) as d_sees from shopping_items;
select updated_at as before_update from shopping_items where id = 'newest1' \gset
select pg_sleep(0.01);
update shopping_items set checked = true where id = 'newest1';
select checked, updated_at > :'before_update'::timestamptz as touched from shopping_items where id = 'newest1';
insert into shopping_items (household_id, name, created_by) values ('11111111-1111-1111-1111-111111111111', 'Eggs', auth.uid());
\echo 'expect: 4'
select count(*) as d_sees_after_add from shopping_items;

\echo '--- outsider a (own household, from the other test) sees none and cannot write into this one'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) is not null as as_a;
select count(*) as a_sees from shopping_items;
\echo 'expect: row-level security error'
insert into shopping_items (household_id, name) values ('11111111-1111-1111-1111-111111111111', 'sneaky');
update shopping_items set name = 'hacked';
delete from shopping_items;
reset role;
\echo 'expect: 4 and no sneaky or hacked'
select count(*) as still_four, count(*) filter (where name in ('sneaky','hacked')) as tampered from shopping_items;

\echo '--- anon sees nothing'
set role anon;
select count(*) from shopping_items;
reset role;

\echo '--- in the realtime publication'
select count(*) as published from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shopping_items';
