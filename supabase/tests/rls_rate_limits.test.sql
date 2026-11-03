-- Rate limits (ADR-0012, section 4) and the idempotent stepper (section 5). The clock is the
-- transaction's now(), so reaching a limit backfills the counter as postgres, and the next window is
-- reached by moving the counter's window back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(89);

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid;
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@rl.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['1', '2', '3', '4', '5', '6', '7', '8', '9']) k;
insert into public.contexts (area_id, group_id, owner_user_id, name, color_token, icon, created_by)
select (select id from public.areas where key = 'work'), null, p.id, 'Own', 'teal', 'x', p.id from public.profiles p
where p.id in (pg_temp.u('1'), pg_temp.u('2'));
insert into public.groups (id, name, type, owner_id) values
  ('30000000-0000-0000-0000-000000000004', 'Casa 4', 'family', pg_temp.u('4'));
insert into public.group_invites (group_id, code, expires_at, created_by) values
  ('30000000-0000-0000-0000-000000000004', 'RLCODE0001', now() + interval '1 day', pg_temp.u('4'));

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

create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;

create function pg_temp.g(p_name text) returns uuid language sql as $$
  select current_setting('t.' || p_name)::uuid;
$$;

create function pg_temp.rule(p_action text, p_key text) returns int language sql as $$
  select (value -> 'actions' -> p_action ->> p_key)::int from public.app_settings where key = 'rate_limit_rules';
$$;

-- Hits of the current window, and of every window.
create function pg_temp.hits(p_user uuid, p_action text) returns int language sql as $$
  select hits from public.rate_limit_counters where user_id = p_user and action = p_action
  order by window_start desc limit 1;
$$;
create function pg_temp.rows(p_user uuid, p_action text) returns int language sql as $$
  select count(*)::int from public.rate_limit_counters where user_id = p_user and action = p_action;
$$;

-- As postgres: the counter one short of the limit, or moved to the window before.
create function pg_temp.fill(p_user uuid, p_action text) returns void language sql as $$
  update public.rate_limit_counters set hits = pg_temp.rule(p_action, 'limit') - 1
  where user_id = p_user and action = p_action;
$$;
create function pg_temp.age(p_user uuid, p_action text) returns void language sql as $$
  update public.rate_limit_counters
  set window_start = window_start - make_interval(secs => pg_temp.rule(p_action, 'windowSeconds'))
  where user_id = p_user and action = p_action;
$$;

create function pg_temp.task(p_user uuid) returns uuid language plpgsql as $$
declare tid uuid;
begin
  insert into public.tasks (
    context_id, assignee_id, title, schedule_type, start_at, duration_min, timezone, reminders,
    requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility
  ) values (
    (select id from public.contexts where owner_user_id = p_user), p_user, 'R' || gen_random_uuid(),
    'timed', now() + interval '1 hour', 30, 'America/Sao_Paulo', '[]', false, false, false, 'easy', 'normal', 'private'
  ) returning id into tid;
  return tid;
end;
$$;

-- The hint of the rate_limited the statement raises, or null.
create function pg_temp.hint(p_sql text) returns int language plpgsql as $$
declare h text;
begin
  execute p_sql;
  return null;
exception when sqlstate 'PT429' then
  get stacked diagnostics h = pg_exception_hint;
  return h::int;
end;
$$;

-- ===== The mirror and the barriers =====
select is((select value from public.app_settings where key = 'rate_limit_rules'), '{
  "actions": {
    "task_create": {"limit": 200, "windowSeconds": 3600},
    "occurrence_status": {"limit": 600, "windowSeconds": 3600},
    "shopping_list_create": {"limit": 30, "windowSeconds": 3600},
    "invite_create": {"limit": 30, "windowSeconds": 86400},
    "invite_lookup": {"limit": 30, "windowSeconds": 3600},
    "data_export": {"limit": 3, "windowSeconds": 86400},
    "shopping_item_adjust": {"limit": 600, "windowSeconds": 3600}
  },
  "counterRetentionHours": 48,
  "idempotencyRetentionHours": 48
}'::jsonb, 'rate_limit_rules mirrors rateLimitRules');

select ok(not has_function_privilege('authenticated', 'public.consume_rate_limit(uuid, text)', 'execute'),
  'authenticated cannot execute consume_rate_limit');
select ok(not has_function_privilege('anon', 'public.consume_rate_limit(uuid, text)', 'execute'),
  'nor anon');
select ok(has_function_privilege('service_role', 'public.consume_rate_limit(uuid, text)', 'execute'),
  'service_role can');
select ok(not has_function_privilege('authenticated', 'public.consume_rate_limit_on_insert()', 'execute'),
  'the trigger function is not executable by a client');

select pg_temp.login(pg_temp.u('1'));
select throws_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-000000000002', 'data_export')$$,
  '42501', null, 'a client cannot spend the limit of someone else');
select throws_ok($$select * from public.rate_limit_counters$$, '42501', null, 'nor read the counters');
select throws_ok($$select * from public.processed_requests$$, '42501', null, 'nor the processed requests');
select throws_ok($$insert into public.processed_requests (request_id, user_id) values (gen_random_uuid(), auth.uid())$$,
  '42501', null, 'nor write one');
select pg_temp.pg();
select ok((select relrowsecurity from pg_class where oid = 'public.rate_limit_counters'::regclass), 'RLS on the counters');
select ok((select relrowsecurity from pg_class where oid = 'public.processed_requests'::regclass),
  'RLS on the processed requests');

-- ===== consume_rate_limit itself, as the service role (data_export: only the counter in F8-4) =====
set local role service_role;
select throws_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-000000000008', 'nope')$$,
  '22023', 'rate_limit_action_unknown', 'an unknown action is an error');
select throws_ok($$select public.consume_rate_limit(null, 'nope')$$,
  '22023', 'rate_limit_action_unknown', 'even with no user');
select lives_ok($$select public.consume_rate_limit(null, 'data_export') from generate_series(1, 10)$$,
  'a null user is never limited');
select lives_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-000000000008', 'data_export') from generate_series(1, 3)$$,
  'three exports pass');
select throws_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-000000000008', 'data_export')$$,
  'PT429', 'rate_limited', 'the fourth is rate_limited');
select ok(pg_temp.hint($$select public.consume_rate_limit('00000000-0000-0000-0000-000000000008', 'data_export')$$)
  between 1 and 86400, 'with the seconds left in the window as the hint');
reset role;
select is((select count(*)::int from public.rate_limit_counters where user_id is null), 0, 'a null user writes no row');
select is(pg_temp.hits(pg_temp.u('8'), 'data_export'), 3, 'the refused calls did not count');
select pg_temp.age(pg_temp.u('8'), 'data_export');
set local role service_role;
select lives_ok($$select public.consume_rate_limit('00000000-0000-0000-0000-000000000008', 'data_export')$$,
  'the next window lets the export through');
reset role;
select is(pg_temp.hits(pg_temp.u('8'), 'data_export'), 1, 'in a new row');

-- ===== task_create: trigger before insert on tasks =====
select pg_temp.login(pg_temp.u('1'));
select pg_temp.task(pg_temp.u('1'));
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('1'), 'task_create'), 1, 'a task created by a user counts');
select pg_temp.fill(pg_temp.u('1'), 'task_create');
select pg_temp.login(pg_temp.u('1'));
select lives_ok($$select pg_temp.task('00000000-0000-0000-0000-000000000001')$$, 'task number 200 passes');
select throws_ok($$select pg_temp.task('00000000-0000-0000-0000-000000000001')$$,
  'PT429', 'rate_limited', 'task number 201 is rate_limited');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('1'), 'task_create'), 200, 'the counter stops at the limit');
select is((select count(*)::int from public.tasks where created_by = pg_temp.u('1')), 2, 'and the refused task was not written');
select pg_temp.task(pg_temp.u('1'));
select is(pg_temp.hits(pg_temp.u('1'), 'task_create'), 200, 'an insert with no user (service role, jobs) does not count');
select pg_temp.age(pg_temp.u('1'), 'task_create');
select pg_temp.login(pg_temp.u('1'));
select lives_ok($$select pg_temp.task('00000000-0000-0000-0000-000000000001')$$, 'the next window lets tasks through');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('1'), 'task_create'), 1, 'counted from one');

-- ===== occurrence_status: set_occurrence_status =====
select pg_temp.sv('t2', pg_temp.task(pg_temp.u('2'))::text);
select pg_temp.sv('occ', (select id from public.task_occurrences where task_id = pg_temp.g('t2'))::text);
select pg_temp.login(pg_temp.u('2'));
select public.set_occurrence_status(pg_temp.g('occ'), 'done', 'pending', null);
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('2'), 'occurrence_status'), 1, 'a status change counts');
select pg_temp.login(pg_temp.u('2'));
select throws_ok(format($$select public.set_occurrence_status(%L, 'done', 'pending', null)$$, pg_temp.g('occ')),
  'P0001', 'status_conflict', 'a refused change raises');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('2'), 'occurrence_status'), 1, 'and does not count: the exception undoes its + 1');
select pg_temp.fill(pg_temp.u('2'), 'occurrence_status');
select pg_temp.login(pg_temp.u('2'));
select lives_ok(format($$select public.set_occurrence_status(%L, 'pending', 'done', null)$$, pg_temp.g('occ')),
  'change number 600 passes');
select throws_ok(format($$select public.set_occurrence_status(%L, 'done', 'pending', null)$$, pg_temp.g('occ')),
  'PT429', 'rate_limited', 'change number 601 is rate_limited');
select pg_temp.pg();
select is((select status::text from public.task_occurrences where id = pg_temp.g('occ')), 'pending',
  'and the status did not move');
select is(pg_temp.hits(pg_temp.u('2'), 'occurrence_status'), 600, 'the counter stops at the limit');
select pg_temp.age(pg_temp.u('2'), 'occurrence_status');
select pg_temp.login(pg_temp.u('2'));
select lives_ok(format($$select public.set_occurrence_status(%L, 'done', 'pending', null)$$, pg_temp.g('occ')),
  'the next window lets changes through');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('2'), 'occurrence_status'), 1, 'counted from one');

-- ===== shopping_list_create: create_shopping_list =====
select pg_temp.login(pg_temp.u('3'));
select public.create_shopping_list(null, null, 'L1', null);
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('3'), 'shopping_list_create'), 1, 'a list counts');
select pg_temp.fill(pg_temp.u('3'), 'shopping_list_create');
select pg_temp.login(pg_temp.u('3'));
select lives_ok($$select public.create_shopping_list(null, null, 'L30', null)$$, 'list number 30 passes');
select throws_ok($$select public.create_shopping_list(null, null, 'L31', null)$$,
  'PT429', 'rate_limited', 'list number 31 is rate_limited');
select is((select count(*)::int from public.shopping_lists where owner_user_id = auth.uid()), 2,
  'and was not created');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('3'), 'shopping_list_create'), 30, 'the counter stops at the limit');
select pg_temp.age(pg_temp.u('3'), 'shopping_list_create');
select pg_temp.login(pg_temp.u('3'));
select lives_ok($$select public.create_shopping_list(null, null, 'L1b', null)$$, 'the next window lets lists through');
select throws_ok($$select public.create_shopping_list(null, '30000000-0000-0000-0000-000000000004', 'X', null)$$,
  '42501', 'forbidden', 'a forbidden creation raises before the counter');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('3'), 'shopping_list_create'), 1, 'and does not count');

-- ===== invite_create: trigger before insert on group_invites =====
select pg_temp.login(pg_temp.u('4'));
insert into public.group_invites (group_id, expires_at) values ('30000000-0000-0000-0000-000000000004', now() + interval '1 day');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('4'), 'invite_create'), 1, 'an invite counts');
select pg_temp.fill(pg_temp.u('4'), 'invite_create');
select pg_temp.login(pg_temp.u('4'));
select lives_ok($$insert into public.group_invites (group_id, expires_at) values ('30000000-0000-0000-0000-000000000004', now() + interval '1 day')$$,
  'invite number 30 passes');
select throws_ok($$insert into public.group_invites (group_id, expires_at) values ('30000000-0000-0000-0000-000000000004', now() + interval '1 day')$$,
  'PT429', 'rate_limited', 'invite number 31 is rate_limited');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('4'), 'invite_create'), 30, 'the counter stops at the limit');
select is((select count(*)::int from public.group_invites where created_by = pg_temp.u('4')), 3,
  'and the refused invite was not written (fixture plus two)');
select pg_temp.age(pg_temp.u('4'), 'invite_create');
select pg_temp.login(pg_temp.u('4'));
select lives_ok($$insert into public.group_invites (group_id, expires_at) values ('30000000-0000-0000-0000-000000000004', now() + interval '1 day')$$,
  'the next day lets invites through');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('4'), 'invite_create'), 1, 'counted from one');

-- ===== invite_lookup: get_invite_preview =====
select pg_temp.login(pg_temp.u('5'));
select is((select group_name from public.get_invite_preview('rlcode0001')), 'Casa 4', 'the preview still answers the group');
select is((select count(*)::int from public.get_invite_preview('NOPE000000')), 0, 'and nothing for a wrong code');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('5'), 'invite_lookup'), 2, 'a wrong code counts too');
select pg_temp.fill(pg_temp.u('5'), 'invite_lookup');
select pg_temp.login(pg_temp.u('5'));
select lives_ok($$select * from public.get_invite_preview('GUESS00001')$$, 'lookup number 30 passes');
select throws_ok($$select * from public.get_invite_preview('RLCODE0001')$$,
  'PT429', 'rate_limited', 'lookup number 31 is rate_limited, even with a valid code');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('5'), 'invite_lookup'), 30, 'the counter stops at the limit');
select pg_temp.age(pg_temp.u('5'), 'invite_lookup');
select pg_temp.login(pg_temp.u('5'));
select is((select group_name from public.get_invite_preview('RLCODE0001')), 'Casa 4', 'the next window answers again');
select pg_temp.pg();

-- SEG8-2: accept_invite spends the same limit and answers a wrong code with null, so the counter stays.
select pg_temp.login(pg_temp.u('9'));
select is(public.accept_invite('NOPE000000'), null, 'accept_invite answers null for a wrong code');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('9'), 'invite_lookup'), 1, 'and the wrong code counts');
select pg_temp.fill(pg_temp.u('9'), 'invite_lookup');
select pg_temp.login(pg_temp.u('9'));
select is(public.accept_invite('GUESS00001'), null, 'accept number 30 passes');
select throws_ok($$select public.accept_invite('RLCODE0001')$$,
  'PT429', 'rate_limited', 'accept number 31 is rate_limited, even with a valid code');
select pg_temp.pg();
select pg_temp.age(pg_temp.u('9'), 'invite_lookup');
select pg_temp.login(pg_temp.u('9'));
select is(public.accept_invite('RLCODE0001'), '30000000-0000-0000-0000-000000000004'::uuid, 'the next window joins again');
select pg_temp.pg();
select is(pg_temp.hits(pg_temp.u('9'), 'invite_lookup'), 1, 'a valid code counts too');

-- ===== The idempotent stepper =====
select pg_temp.sv('cat', (select id from public.shopping_catalog_items where owner_user_id = pg_temp.u('6') order by name limit 1)::text);
select pg_temp.login(pg_temp.u('6'));
select pg_temp.sv('list', (public.create_shopping_list(null, null, 'Mercado', null)).id::text);
select pg_temp.sv('item', (public.add_catalog_item_to_list(pg_temp.g('list'), pg_temp.g('cat'), 1,
  'a0000000-0000-0000-0000-000000000001')).id::text);
select is((public.add_catalog_item_to_list(pg_temp.g('list'), pg_temp.g('cat'), 1,
  'a0000000-0000-0000-0000-000000000001')).quantity, 1::numeric, 'a repeated add answers the current row');
select is((select quantity from public.shopping_list_items where id = pg_temp.g('item')), 1::numeric, 'without adding');
select is((public.adjust_shopping_item_quantity(pg_temp.g('item'), 2, 'a0000000-0000-0000-0000-000000000002')).quantity,
  3::numeric, 'a step with a new id applies');
select is((public.adjust_shopping_item_quantity(pg_temp.g('item'), 2, 'a0000000-0000-0000-0000-000000000002')).quantity,
  3::numeric, 'the same id again answers the current row');
select is((public.adjust_shopping_item_quantity(pg_temp.g('item'), 2, 'a0000000-0000-0000-0000-000000000001')).quantity,
  3::numeric, 'an id used by the other path counts as applied too');
select is((select quantity from public.shopping_list_items where id = pg_temp.g('item')), 3::numeric, 'each id applied once');
select public.adjust_shopping_item_quantity(pg_temp.g('item'), 1);
select is((public.adjust_shopping_item_quantity(pg_temp.g('item'), 1)).quantity, 5::numeric,
  'without an id, every call adds, as before');
select is((public.add_catalog_item_to_list(pg_temp.g('list'), pg_temp.g('cat'), 1)).quantity, 6::numeric,
  'and the three-argument add still works');
select pg_temp.pg();
select is((select user_id from public.processed_requests where request_id = 'a0000000-0000-0000-0000-000000000002'),
  pg_temp.u('6'), 'the id is recorded with the user');
select is((select count(*)::int from public.processed_requests), 2, 'only calls with an id are recorded');

select pg_temp.login(pg_temp.u('7'));
select throws_ok(format($$select public.adjust_shopping_item_quantity(%L, 1, 'a0000000-0000-0000-0000-000000000003')$$,
  pg_temp.g('item')), '42501', 'forbidden', 'a refused step raises');
select pg_temp.login(pg_temp.u('6'));
select is((public.adjust_shopping_item_quantity(pg_temp.g('item'), 1, 'a0000000-0000-0000-0000-000000000003')).quantity,
  7::numeric, 'and its id was not recorded: the exception undoes it');
select ok((public.adjust_shopping_item_quantity(pg_temp.g('item'), -100, 'a0000000-0000-0000-0000-000000000004')) is null,
  'a step to zero deletes the item');
select ok((public.adjust_shopping_item_quantity(pg_temp.g('item'), -100, 'a0000000-0000-0000-0000-000000000004')) is null,
  'and its repeat answers null without an error');
select pg_temp.pg();
select ok(not exists (select 1 from pg_proc where proname = 'adjust_shopping_item_quantity' and pronargs = 2),
  'the two-argument stepper is gone, so no call is ambiguous');
select ok(has_function_privilege('authenticated', 'public.add_catalog_item_to_list(uuid, uuid, numeric, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.adjust_shopping_item_quantity(uuid, numeric, uuid)', 'execute'),
  'the grants of the stepper are redone');

-- SEG8-4: shopping_item_adjust. Above, U6 made 7 applied calls (an add that created, four steps, the
-- three-argument add that handed off to the step, and the step to zero); the replays, the refused step
-- of U7 and the repeat on the deleted item wrote nothing.
select is(pg_temp.hits(pg_temp.u('6'), 'shopping_item_adjust'), 7, 'each applied call counts once, a replay does not');
select is(pg_temp.hits(pg_temp.u('7'), 'shopping_item_adjust'), null, 'a refused call does not count');
select pg_temp.fill(pg_temp.u('6'), 'shopping_item_adjust');
select pg_temp.login(pg_temp.u('6'));
select pg_temp.sv('item2', (public.add_catalog_item_to_list(pg_temp.g('list'), pg_temp.g('cat'), 1,
  'a0000000-0000-0000-0000-000000000005')).id::text);
select ok(pg_temp.g('item2') is not null, 'call number 600 passes');
select throws_ok(format($$select public.adjust_shopping_item_quantity(%L, 1, 'a0000000-0000-0000-0000-000000000006')$$,
  pg_temp.g('item2')), 'PT429', 'rate_limited', 'call number 601 is rate_limited');
select pg_temp.pg();
select ok(not exists (select 1 from public.processed_requests where request_id = 'a0000000-0000-0000-0000-000000000006'),
  'and its id was not recorded');

-- ===== Retention, in the daily job =====
insert into public.rate_limit_counters (user_id, action, window_start, hits) values
  (pg_temp.u('8'), 'task_create', now() - interval '49 hours', 5),
  (pg_temp.u('8'), 'invite_create', now() - interval '47 hours', 5);
insert into public.processed_requests (request_id, user_id, created_at) values
  ('b0000000-0000-0000-0000-000000000001', pg_temp.u('8'), now() - interval '49 hours'),
  ('b0000000-0000-0000-0000-000000000002', pg_temp.u('8'), now() - interval '47 hours');
select public.delete_expired_notifications();
select is((select array_agg(distinct action order by action) from public.rate_limit_counters where user_id = pg_temp.u('8')),
  array['data_export', 'invite_create'], 'counters past counterRetentionHours are deleted');
select is((select array_agg(request_id) from public.processed_requests where user_id = pg_temp.u('8')),
  array['b0000000-0000-0000-0000-000000000002'::uuid], 'and ids past idempotencyRetentionHours');

select * from finish();
rollback;
