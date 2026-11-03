-- XP of a completed list (ADR-0011, section 9; F7-5): the minimum of checked items, the limit per local
-- day, once per list, the personal list without a group, the daily cap of ADR-0010 and the ranking.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Alice owns Casa A, Duda is a member of A. Bia has only personal lists.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@test.local', '{"display_name": "Bia"}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@test.local', '{"display_name": "Duda"}');

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', '00000000-0000-0000-0000-00000000000a');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'member');

create function pg_temp.login(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.pg() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000000' || p)::uuid;
$$;

create function pg_temp.grp() returns uuid language sql as $$
  select '10000000-0000-0000-0000-00000000000a'::uuid;
$$;

create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;

create function pg_temp.g(p_name text) returns uuid language sql as $$
  select current_setting('t.' || p_name)::uuid;
$$;

-- As the logged in user: a list with n items, the first `checked` of them checked, then completed.
create function pg_temp.done(p_group uuid, n int, checked int) returns uuid language plpgsql as $$
declare
  lid uuid := (public.create_shopping_list(null, p_group, 'Mercado', null)).id;
  iid uuid;
begin
  for k in 1..n loop
    insert into public.shopping_list_items (list_id, name, category, quantity, unit)
    values (lid, 'Item ' || k, 'other', 1, 'unit') returning id into iid;
    if k <= checked then
      perform public.set_shopping_item_checked(iid, true);
    end if;
  end loop;
  perform public.complete_shopping_list(lid);
  return lid;
end;
$$;

-- As postgres: the shopping events of a list, as (user, group, amount, occurrence) rows.
create function pg_temp.ev(p_list uuid) returns text language sql as $$
  select coalesce(string_agg(row(user_id, group_id, amount, occurrence_id)::text, ';'), 'none')
  from public.xp_events where shopping_list_id = p_list and reason = 'shopping_completed';
$$;

-- ===== Minimum of checked items =====
select pg_temp.login(pg_temp.u('a'));
select pg_temp.sv('l1', pg_temp.done(pg_temp.grp(), 3, 3)::text);
select pg_temp.sv('l2', pg_temp.done(pg_temp.grp(), 3, 2)::text);
select pg_temp.pg();

select is(pg_temp.ev(pg_temp.g('l1')), row(pg_temp.u('a'), pg_temp.grp(), 10, null::uuid)::text,
  'three checked items give shoppingRules.xp.amount to who completed, in the group of the list');
select is(pg_temp.ev(pg_temp.g('l2')), 'none', 'two checked of three items give nothing');

-- ===== Personal list =====
select pg_temp.login(pg_temp.u('a'));
select pg_temp.sv('p1', pg_temp.done(null, 3, 3)::text);
select pg_temp.pg();
select is(pg_temp.ev(pg_temp.g('p1')), row(pg_temp.u('a'), null::uuid, 10, null::uuid)::text,
  'a personal list gives XP with no group');

-- ===== Limit per local day =====
select pg_temp.login(pg_temp.u('a'));
select pg_temp.sv('l3', pg_temp.done(pg_temp.grp(), 3, 3)::text);
select pg_temp.pg();
select is(pg_temp.ev(pg_temp.g('l3')), 'none', 'the third rewarded list of the day gives nothing');

-- Two rewarded lists of Duda a minute before the local midnight do not count today.
insert into public.xp_events (user_id, amount, reason, created_at)
select pg_temp.u('d'), 10, 'shopping_completed',
  (now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo' - interval '1 minute'
from generate_series(1, 2);
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('l4', pg_temp.done(pg_temp.grp(), 4, 3)::text);
select pg_temp.pg();
select is(pg_temp.ev(pg_temp.g('l4')), row(pg_temp.u('d'), pg_temp.grp(), 10, null::uuid)::text,
  'rewarded lists of yesterday, in the zone of the profile, leave today free');

-- ===== Once per list =====
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.complete_shopping_list('$$ || pg_temp.g('l1') || $$')$$, 'P0001', 'list_completed',
  'completing twice is list_completed');
select pg_temp.pg();
select throws_ok($$update public.shopping_lists set status = 'open', completed_at = null where id = '$$ || pg_temp.g('l1') || $$'$$,
  'P0001', 'list_completed', 'not even postgres reopens a list to complete it again');
select throws_ok(format($$insert into public.xp_events (user_id, group_id, shopping_list_id, amount, reason)
  values (%L, %L, %L, 10, 'shopping_completed')$$, pg_temp.u('a'), pg_temp.grp(), pg_temp.g('l1')),
  '23505', null, 'a second shopping event of the same list breaks the partial unique index');
select is((select count(*) from public.xp_events where shopping_list_id = pg_temp.g('l1')), 1::bigint,
  'the list keeps one event');
select throws_ok(format($$insert into public.xp_events (user_id, shopping_list_id, amount, reason)
  values (%L, %L, 10, 'occurrence_done')$$, pg_temp.u('a'), pg_temp.g('l2')),
  '23514', null, 'only shopping_completed points to a list');

-- ===== Daily cap (ADR-0010, section 2) =====
insert into public.xp_events (user_id, amount, reason) values (pg_temp.u('b'), 295, 'occurrence_done');
select pg_temp.login(pg_temp.u('b'));
select pg_temp.sv('b1', pg_temp.done(null, 3, 3)::text);
select pg_temp.sv('b2', pg_temp.done(null, 3, 3)::text);
select pg_temp.pg();
select is(pg_temp.ev(pg_temp.g('b1')), row(pg_temp.u('b'), null::uuid, 5, null::uuid)::text,
  'with 295 in the window, a list gives only the 5 left under the cap');
select is(pg_temp.ev(pg_temp.g('b2')), 'none', 'and with the cap reached, the next gives nothing');

-- A task after a list sees the shopping XP in its balance (the same reasons, the same pairs).
select is((select sum(greatest(0, net))::int from (
    select sum(amount) as net from public.xp_events
    where user_id = pg_temp.u('b') and created_at >= now() - interval '24 hours'
    group by coalesce(occurrence_id, id), group_id) x), 300, 'the window of Bia is exactly at the cap');

-- ===== Ranking and totals =====
select pg_temp.sv('week', ((now() at time zone 'America/Sao_Paulo')::date
  - (extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)::int - 1))::text);
select pg_temp.login(pg_temp.u('a'));
select is((select string_agg(row(display_name, xp)::text, ';' order by display_name)
    from public.group_ranking(pg_temp.grp(), current_setting('t.week')::date)),
  '(Alice,10);(Duda,10)', 'group lists count for the group ranking; the personal list and yesterday do not');
select pg_temp.pg();
select is((select total_xp from public.user_stats where user_id = pg_temp.u('a')), 20,
  'the personal list counts for the total');

-- ===== Deleting the list keeps the event =====
select pg_temp.login(pg_temp.u('a'));
delete from public.shopping_lists where id = pg_temp.g('l1');
select pg_temp.pg();
select is((select count(*) from public.xp_events
    where user_id = pg_temp.u('a') and reason = 'shopping_completed' and shopping_list_id is null), 1::bigint,
  'deleting a rewarded list keeps its event, with the reference null');

select * from finish();
rollback;
