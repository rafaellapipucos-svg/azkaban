-- Native push subscriptions (ADR-0012, section 11, BL-5). Same table and limit as the browsers; the token
-- is a capability, as the endpoint. Assume a hostile client calling the REST API directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'np-ana@test.local', '{"display_name": "Ana"}'),
  ('00000000-0000-0000-0000-0000000005b1', 'np-bia@test.local', '{"display_name": "Bia"}');

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
  select ('00000000-0000-0000-0000-0000000005' || p || '1')::uuid;
$$;

create function pg_temp.tok(p text) returns text language sql as $$
  select 'ExponentPushToken[' || p || ']';
$$;

create function pg_temp.reg(p text) returns uuid language sql as $$
  select public.register_native_push_subscription(pg_temp.tok(p), 'Pixel 8');
$$;

create function pg_temp.sub(p_token text) returns public.push_subscriptions language sql security definer as $$
  select * from public.push_subscriptions where expo_token = p_token;
$$;

create function pg_temp.max() returns int language sql as $$
  select (public.notification_rules() ->> 'maxPushSubscriptionsPerUser')::int;
$$;

-- ===== Grants =====
select is(has_function_privilege('authenticated', 'public.register_native_push_subscription(text, text)', 'execute'), true,
  'authenticated registers a device');
select is(has_function_privilege('anon', 'public.register_native_push_subscription(text, text)', 'execute'), false, 'anon does not');
select is(has_column_privilege('authenticated', 'public.push_subscriptions', 'expo_token', 'select'), false,
  'authenticated does not read the token');
select is(has_column_privilege('authenticated', 'public.push_subscriptions', 'kind', 'select'), false, 'nor the kind, for now');
select is(has_table_privilege('authenticated', 'public.push_subscriptions', 'insert'), false, 'nor inserts');
select is(has_table_privilege('authenticated', 'public.push_subscriptions', 'update'), false, 'nor updates');

-- ===== Without a session =====
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[x]', null)$$, '42501', 'forbidden',
  'no session, no device');

-- ===== A valid token =====
select pg_temp.login(pg_temp.u('a'));
select isnt(pg_temp.reg('ana1'), null, 'Ana registers her phone');
select lives_ok($$select public.register_native_push_subscription('ExpoPushToken[Ab-_9]', '  ')$$, 'the newer prefix too');
select throws_ok($$select expo_token from public.push_subscriptions$$, '42501', 'permission denied for table push_subscriptions',
  'she does not read the token back');
select throws_ok($$select kind from public.push_subscriptions$$, '42501', 'permission denied for table push_subscriptions',
  'nor the kind');
select is((select count(*) from (select id, user_agent, created_at, last_success_at from public.push_subscriptions) s), 2::bigint,
  'she lists both devices');
select throws_ok(format($$insert into public.push_subscriptions (user_id, kind, expo_token) values (%L, 'expo', 'ExpoPushToken[z]')$$,
  pg_temp.u('a')), '42501', 'permission denied for table push_subscriptions', 'and inserts only through the RPC');
select pg_temp.pg();
select is((select user_id::text || ':' || kind || ':' || coalesce(endpoint, '-') || coalesce(p256dh, '-') || coalesce(auth, '-')
  || ':' || user_agent from pg_temp.sub(pg_temp.tok('ana1'))), pg_temp.u('a')::text || ':expo:---:Pixel 8',
  'the row is hers, of kind expo, with no endpoint nor keys');
select is((select user_agent from pg_temp.sub('ExpoPushToken[Ab-_9]')), null, 'a blank label is stored as null');

-- ===== Invalid input =====
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.register_native_push_subscription(null, null)$$, '22023', 'invalid_push_subscription', 'no token');
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[]', null)$$, '22023', 'invalid_push_subscription',
  'an empty token');
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[a.b]', null)$$, '22023', 'invalid_push_subscription',
  'a character outside the set');
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[ab]x', null)$$, '22023', 'invalid_push_subscription',
  'something after the bracket');
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[ab]' || chr(10), null)$$, '22023',
  'invalid_push_subscription', 'a trailing newline');
select throws_ok($$select public.register_native_push_subscription('PushToken[ab]', null)$$, '22023', 'invalid_push_subscription',
  'another prefix');
select throws_ok($$select public.register_native_push_subscription('0f8b5c1e-2d3a-4b5c-8d9e-0a1b2c3d4e5f', null)$$, '22023',
  'invalid_push_subscription', 'the old bare UUID');
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[' || repeat('a', 201) || ']', null)$$, '22023',
  'invalid_push_subscription', 'more than 200 inside');
select lives_ok($$select public.register_native_push_subscription('ExponentPushToken[' || repeat('a', 200) || ']', null)$$,
  '200 inside is fine');
select throws_ok($$select public.register_native_push_subscription('ExponentPushToken[ab]', repeat('x', 257))$$, '22023',
  'invalid_push_subscription', 'a label over 256');
select pg_temp.pg();

-- ===== The check ties each kind to its columns =====
select throws_ok(format($$insert into public.push_subscriptions (user_id, kind, expo_token, endpoint) values (%L, 'expo', 'ExpoPushToken[c1]', 'https://fcm.googleapis.com/x')$$,
  pg_temp.u('a')), '23514', null, 'an expo row with an endpoint is refused');
select throws_ok(format($$insert into public.push_subscriptions (user_id, endpoint) values (%L, 'https://fcm.googleapis.com/c2')$$,
  pg_temp.u('a')), '23514', null, 'a web row without keys is refused');
select throws_ok(format($$insert into public.push_subscriptions (user_id, kind) values (%L, 'apns')$$,
  pg_temp.u('a')), '23514', null, 'and a kind outside web and expo');

-- ===== Same token, same owner; then another account =====
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.reg('ana1'), (pg_temp.sub(pg_temp.tok('ana1'))).id, 'registering again keeps the same row');
select pg_temp.pg();
update public.push_subscriptions set created_at = now() - interval '5 days', last_success_at = now() - interval '1 day'
where expo_token = pg_temp.tok('ana1');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.reg('ana1'), (pg_temp.sub(pg_temp.tok('ana1'))).id, 'the same phone on Bia''s account is the same row');
select pg_temp.pg();
select is((select user_id::text || ':' || (created_at = now()) || ':' || coalesce(last_success_at::text, '-') from pg_temp.sub(pg_temp.tok('ana1'))),
  pg_temp.u('b')::text || ':true:-', 'it changes owner and starts as a new device');

-- ===== The limit counts both kinds =====
delete from public.push_subscriptions where user_id = pg_temp.u('a');
-- max - 1 browsers, the oldest first.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
select pg_temp.u('a'), 'https://fcm.googleapis.com/fcm/send/np' || i, repeat('A', 87), repeat('B', 22), now() - make_interval(days => 50 - i)
from generate_series(1, pg_temp.max() - 1) i;
select pg_temp.login(pg_temp.u('a'));
select pg_temp.reg('lim1');
select pg_temp.pg();
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u('a')), pg_temp.max(), 'a phone fills the limit');
select pg_temp.login(pg_temp.u('a'));
select pg_temp.reg('lim2');
select pg_temp.pg();
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u('a')), pg_temp.max(), 'one more keeps the limit');
select is((select count(*) from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/np1'), 0::bigint,
  'and the oldest browser went for the phone');
-- Now the oldest is a phone, and a browser registers.
update public.push_subscriptions set created_at = now() - interval '100 days' where expo_token = pg_temp.tok('lim1');
select pg_temp.login(pg_temp.u('a'));
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/np-new', repeat('A', 87), repeat('B', 22), null);
select pg_temp.pg();
select is((pg_temp.sub(pg_temp.tok('lim1'))).id, null, 'a browser pushes out the oldest phone');
select is((select count(*)::int from public.push_subscriptions where user_id = pg_temp.u('a')), pg_temp.max(), 'still the limit');

-- ===== The claim gives the token to the dispatcher =====
update public.profiles set daily_summary_skip_empty = false where id = pg_temp.u('b');
insert into public.notifications (id, user_id, type, data, dedupe_key) values
  ('30000000-0000-0000-0000-0000000005b1', pg_temp.u('b'), 'daily_summary',
    jsonb_build_object('localDate', (now() at time zone 'America/Sao_Paulo')::date), 'np:test');
insert into public.notification_outbox (id, notification_id, user_id, channel, scheduled_for, next_attempt_at) values
  ('31000000-0000-0000-0000-0000000005b1', '30000000-0000-0000-0000-0000000005b1', pg_temp.u('b'), 'web_push', now(), now());
create temp table claim_np as select public.claim_notification_batch(1000, 60, 24) as r;
select is(
  (select i -> 'subscriptions' from claim_np, jsonb_array_elements(r -> 'items') i
    where i ->> 'outboxId' = '31000000-0000-0000-0000-0000000005b1'),
  jsonb_build_array(jsonb_build_object('id', (pg_temp.sub(pg_temp.tok('ana1'))).id, 'kind', 'expo', 'expoToken', pg_temp.tok('ana1'))),
  'an expo subscription comes with its kind and token, and nothing of a browser');

-- ===== Retention and export =====
update public.push_subscriptions set created_at = now() - interval '91 days', last_success_at = null where expo_token = pg_temp.tok('ana1');
select public.delete_expired_notifications();
select is((pg_temp.sub(pg_temp.tok('ana1'))).id, null, 'a phone with no delivery in 90 days goes, as a browser');
select ok((select bool_and(not (s ? 'expo_token') and s ->> 'kind' is not null)
  from jsonb_array_elements(public.export_user_data(pg_temp.u('a')) #> '{sections,push_subscriptions}') s),
  'the export keeps the kind and leaves the token out');

select * from finish();
rollback;
