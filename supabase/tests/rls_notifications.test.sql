-- Notifications, Web Push and red by default (ADR-0008). Assume a hostile client calling the REST API
-- directly, and writers with no user (jobs, the service role). Each refusal sits next to the same call
-- allowed to whoever it should allow.
begin;
create extension if not exists pgtap with schema extensions;
select plan(223);

-- Alice owns Casa A, Caio is admin of A, Duda and Fred are members of A, Eva is outside.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@test.local', '{"display_name": "Caio"}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@test.local', '{"display_name": "Duda"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@test.local', '{"display_name": "Eva"}'),
  ('00000000-0000-0000-0000-00000000000f', 'fred@test.local', '{"display_name": "Fred"}');

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', '00000000-0000-0000-0000-00000000000a');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'member'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'member');

insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa A', 'teal', 'x', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000d', (select id from public.areas where key = 'home'),
    null, '00000000-0000-0000-0000-00000000000d', 'Duda', 'teal', 'x', '00000000-0000-0000-0000-00000000000d');

update public.profiles set proof_consent_version = 2, proof_consent_at = now()
where id in ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d');

create function pg_temp.login(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
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

create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;

create function pg_temp.g(p_name text) returns uuid language sql as $$
  select current_setting('t.' || p_name)::uuid;
$$;

create function pg_temp.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A one-off task in Casa A (or another context), and its occurrence id.
create function pg_temp.mk(
  p_title text, p_creator uuid, p_assignee uuid, p_start timestamptz,
  p_vis public.task_visibility default 'group', p_reminders jsonb default '[]',
  p_photo boolean default false, p_approval boolean default false,
  p_type public.schedule_type default 'timed',
  p_ctx uuid default '20000000-0000-0000-0000-00000000000a'
) returns uuid language plpgsql as $$
declare tid uuid; oid uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, due_at, duration_min, timezone,
    reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty,
    priority, visibility
  ) values (
    p_ctx, p_creator, p_assignee, p_title, p_type,
    case when p_type = 'deadline' then null else p_start end,
    case when p_type = 'deadline' then p_start end,
    case when p_type = 'timed' then 60 end, 'America/Sao_Paulo',
    p_reminders, p_photo, p_approval, false, 'medium', 'normal', p_vis
  ) returning id into tid;
  select id into oid from public.task_occurrences where task_id = tid;
  return oid;
end;
$$;

-- Any writer: a direct update with p_user in the claims, or none for a job.
create function pg_temp.act(p_user uuid, p_occ uuid, p_status public.occurrence_status) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
  update public.task_occurrences set status = p_status where id = p_occ;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create function pg_temp.n(p_user uuid, p_type text default null, p_occ uuid default null) returns bigint
language sql security definer as $$
  select count(*) from public.notifications
  where user_id = p_user and (p_type is null or type::text = p_type) and (p_occ is null or occurrence_id = p_occ);
$$;

create function pg_temp.ob(p_user uuid, p_type text default null) returns bigint language sql security definer as $$
  select count(*) from public.notification_outbox ob join public.notifications n on n.id = ob.notification_id
  where ob.user_id = p_user and (p_type is null or n.type::text = p_type);
$$;

create function pg_temp.last(p_user uuid, p_type text) returns public.notifications language sql security definer as $$
  select * from public.notifications where user_id = p_user and type::text = p_type order by ctid desc limit 1;
$$;

create function pg_temp.ep(p text) returns text language sql as $$
  select 'https://fcm.googleapis.com/fcm/send/' || p;
$$;

create function pg_temp.reg(p_endpoint text) returns uuid language sql as $$
  select public.register_push_subscription(p_endpoint, repeat('A', 87), repeat('B', 22), 'Test agent');
$$;

create temp sequence sha_seq;
grant usage on sequence sha_seq to authenticated, service_role;

create function pg_temp.proof(p_user uuid, p_occ uuid) returns uuid language plpgsql as $$
declare nonce uuid;
begin
  perform pg_temp.login(p_user);
  nonce := (public.issue_proof_challenge(p_occ) ->> 'nonce')::uuid;
  perform pg_temp.service();
  perform public.claim_proof_challenge(nonce, p_user);
  perform public.commit_proof(
    nonce, p_user, p_occ::text || '/' || nonce::text || '.jpg', lpad(to_hex(nextval('sha_seq')), 64, '0'),
    1000, 640, 480, now(), null, null, '{}', 'web', '1.0.0', 'test-agent'
  );
  perform pg_temp.pg();
  return (select current_proof_id from public.task_occurrences where id = p_occ);
end;
$$;

-- Fixtures, all born before anyone leaves the group.
select pg_temp.sv('t1', pg_temp.mk('T1 Caio for Duda', pg_temp.u('c'), pg_temp.u('d'), now() + interval '2 days')::text);
select pg_temp.sv('t2', pg_temp.mk('T2 Caio for Duda', pg_temp.u('c'), pg_temp.u('d'), now() + interval '2 days')::text);
select pg_temp.sv('t3', pg_temp.mk('T3 Duda own', pg_temp.u('d'), pg_temp.u('d'), now() + interval '2 days')::text);
select pg_temp.sv('t3b', pg_temp.mk('T3b Duda own', pg_temp.u('d'), pg_temp.u('d'), now() + interval '2 days')::text);
select pg_temp.sv('t4', pg_temp.mk('T4 Duda private', pg_temp.u('d'), pg_temp.u('d'), now() + interval '2 days', 'private')::text);
select pg_temp.sv('t4b', pg_temp.mk('T4b Duda private', pg_temp.u('d'), pg_temp.u('d'), now() + interval '2 days', 'private')::text);
select pg_temp.sv('t5', pg_temp.mk('T5 Caio for Fred', pg_temp.u('c'), pg_temp.u('f'), now() + interval '2 days')::text);
select pg_temp.sv('t5b', pg_temp.mk('T5b Fred own', pg_temp.u('f'), pg_temp.u('f'), now() + interval '2 days')::text);
select pg_temp.sv('t6', pg_temp.mk('T6 Caio for Duda', pg_temp.u('c'), pg_temp.u('d'), now() + interval '2 days')::text);
select pg_temp.sv('pr', pg_temp.mk('PR photo review', pg_temp.u('c'), pg_temp.u('d'), now() + interval '2 days', 'group', '[]', true, true)::text);
select pg_temp.sv('prc', pg_temp.mk('PRC admin photo', pg_temp.u('a'), pg_temp.u('c'), now() + interval '2 days', 'group', '[]', true, true)::text);
select pg_temp.sv('r1', pg_temp.mk('R1 soon', pg_temp.u('c'), pg_temp.u('d'), now() + interval '10 minutes', 'group', '[30, 0]')::text);
select pg_temp.sv('r2', pg_temp.mk('R2 gone', pg_temp.u('c'), pg_temp.u('d'), now() - interval '2 hours', 'group', '[30]')::text);
select pg_temp.sv('r3', pg_temp.mk('R3 done', pg_temp.u('c'), pg_temp.u('d'), now() + interval '10 minutes', 'group', '[30]')::text);
select pg_temp.sv('r4', pg_temp.mk('R4 deadline', pg_temp.u('c'), pg_temp.u('d'), now() + interval '1 day' - interval '5 minutes', 'group', '[1440]', false, false, 'deadline')::text);
select pg_temp.sv('r5', pg_temp.mk('R5 archived', pg_temp.u('c'), pg_temp.u('d'), now() + interval '10 minutes', 'group', '[30]')::text);
select pg_temp.sv('r6', pg_temp.mk('R6 ex-member', pg_temp.u('c'), pg_temp.u('f'), now() + interval '10 minutes', 'group', '[30]')::text);
select pg_temp.sv('am1', pg_temp.mk('AM1 past', pg_temp.u('c'), pg_temp.u('d'), now() - interval '3 days')::text);
select pg_temp.sv('am2', pg_temp.mk('AM2 reopened', pg_temp.u('c'), pg_temp.u('d'), now() - interval '3 days')::text);
select pg_temp.sv('am3', pg_temp.mk('AM3 archived', pg_temp.u('c'), pg_temp.u('d'), now() - interval '3 days')::text);
select pg_temp.sv('am4', pg_temp.mk('AM4 ex-member', pg_temp.u('c'), pg_temp.u('f'), now() - interval '3 days')::text);
select pg_temp.sv('am5', pg_temp.mk('AM5 rescheduled', pg_temp.u('c'), pg_temp.u('d'), now() - interval '3 days')::text);
select pg_temp.sv('am6', pg_temp.mk('AM6 in review', pg_temp.u('c'), pg_temp.u('d'), now() - interval '1 day', 'group', '[]', true, true)::text);
select pg_temp.sv('am7', pg_temp.mk('AM7 photo', pg_temp.u('c'), pg_temp.u('d'), now() - interval '3 days', 'group', '[]', true)::text);
select pg_temp.sv('am8', pg_temp.mk('AM8 personal', pg_temp.u('d'), pg_temp.u('d'), now() - interval '3 days', 'private', '[]', false, false, 'timed', '20000000-0000-0000-0000-00000000000d')::text);
select pg_temp.sv('am9', pg_temp.mk('AM9 on time', pg_temp.u('c'), pg_temp.u('d'), now() + interval '3 days')::text);

-- ===== Mirrors and schedules =====
select is(public.notification_rules() -> 'activeChannels', '["web_push", "whatsapp"]'::jsonb, 'notification_rules is mirrored');
select is(public.notification_rules() -> 'renotifyCooldown' || jsonb_build_object('retention', public.notification_rules() -> 'pushSubscriptionRetentionDays'),
  '{"minutes": 10, "types": ["occurrence_missed", "occurrence_resolved", "proof_disputed"], "retention": 90}'::jsonb,
  'with the cooldown and the retention of browsers');
select is(public.task_rules() -> 'autoMissJob', '{"batchSize": 500, "reopenGraceMinutes": 60}'::jsonb, 'task_rules has autoMissJob');
select is(
  (select string_agg(jobname || '=' || schedule, ',' order by jobname) from cron.job
    where jobname in ('enqueue-due-reminders', 'dispatch-notifications', 'delete-expired-notifications', 'auto-miss-occurrences')),
  'auto-miss-occurrences=*/5 * * * *,delete-expired-notifications=30 4 * * *,dispatch-notifications=* * * * *,enqueue-due-reminders=* * * * *',
  'the four jobs are scheduled');
select throws_ok($$select public.call_dispatch_notifications()$$, 'P0001', 'dispatch_notifications_not_configured',
  'without the Vault the dispatch call fails loudly');
select is(
  (select string_agg(tablename, ',') from pg_publication_tables where pubname = 'supabase_realtime'),
  'notifications', 'Realtime publishes the bell, and only the bell');

-- ===== Privileges =====
select is((select count(*) from pg_class where oid in ('public.notifications'::regclass,
  'public.notification_preferences'::regclass, 'public.push_subscriptions'::regclass,
  'public.notification_outbox'::regclass) and relrowsecurity), 4::bigint, 'RLS is on in the four tables');
select is((select count(*) from pg_policies where tablename = 'notification_outbox'), 0::bigint, 'the outbox has no policy');
select is(
  (select string_agg(f, ',' order by f) from unnest(array[
    'public.enqueue_notification(uuid, public.notification_type, uuid, uuid, jsonb, text, timestamptz)',
    'public.enqueue_due_reminders()', 'public.claim_notification_batch(int, int, int, text[])',
    'public.report_notification_results(jsonb)', 'public.auto_miss_occurrences()',
    'public.delete_expired_notifications()', 'public.call_dispatch_notifications()',
    'public.can_view_task_for(uuid, public.tasks)',
    'public.can_receive_notification(uuid, public.notification_type, uuid)',
    'public.notify_status_change()', 'public.quiet_hours_end_at(text, time, time, timestamptz)',
    'public.notification_rules()', 'public.is_allowed_push_endpoint(text)', 'public.push_endpoint_host(text)'
  ]) f where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  null, 'no internal function of notifications is open to authenticated or anon');
select is(has_function_privilege('service_role', 'public.claim_notification_batch(int, int, int, text[])', 'execute'), true, 'service role claims');
select is(has_function_privilege('service_role', 'public.report_notification_results(jsonb)', 'execute'), true, 'service role reports');
select is(has_function_privilege('authenticated', 'public.register_push_subscription(text, text, text, text)', 'execute'), true, 'authenticated registers a browser');
select is(has_function_privilege('anon', 'public.register_push_subscription(text, text, text, text)', 'execute'), false, 'anon does not');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.claim_notification_batch(10, 60, 24)$$, '42501', 'permission denied for function claim_notification_batch', 'a user cannot claim');
select throws_ok($$select public.report_notification_results('[]')$$, '42501', 'permission denied for function report_notification_results', 'nor report');
select throws_ok($$select public.auto_miss_occurrences()$$, '42501', 'permission denied for function auto_miss_occurrences', 'nor turn anything red');
select throws_ok($$select public.enqueue_due_reminders()$$, '42501', 'permission denied for function enqueue_due_reminders', 'nor scan reminders');
select throws_ok($$select public.enqueue_notification(auth.uid(), 'task_reminder', null, null, '{}', 'x')$$, '42501', 'permission denied for function enqueue_notification', 'nor write a notification');
select throws_ok($$select * from public.notification_outbox$$, '42501', 'permission denied for table notification_outbox', 'nor read the outbox');
select throws_ok($$update public.notification_outbox set status = 'sent'$$, '42501', 'permission denied for table notification_outbox', 'nor write it');
select pg_temp.pg();
set local role anon;
select throws_ok($$select * from public.notifications$$, '42501', 'permission denied for table notifications', 'anon reads no bell');
select throws_ok($$select * from public.push_subscriptions$$, '42501', 'permission denied for table push_subscriptions', 'nor devices');
select throws_ok($$select * from public.notification_preferences$$, '42501', 'permission denied for table notification_preferences', 'nor preferences');
select pg_temp.pg();

-- ===== Quiet hours in the profile =====
select is((select quiet_hours_start::text || '-' || quiet_hours_end::text from public.profiles where id = pg_temp.u('d')),
  '22:00:00-07:00:00', 'a new profile is born with the default quiet hours');
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$update public.profiles set quiet_hours_start = '23:00', quiet_hours_end = '06:30' where id = auth.uid()$$, 'the user changes their quiet hours');
select throws_ok($$update public.profiles set quiet_hours_start = '06:30' where id = auth.uid()$$, '23514', null, 'an empty window is refused');
select throws_ok($$update public.profiles set quiet_hours_end = null where id = auth.uid()$$, '23514', null, 'and half a window too');
select lives_ok($$update public.profiles set quiet_hours_start = null, quiet_hours_end = null where id = auth.uid()$$, 'both null turns them off');
select is(pg_temp.rows($$update public.profiles set quiet_hours_start = '01:00', quiet_hours_end = '02:00' where id = '00000000-0000-0000-0000-00000000000c'$$), 0::bigint, 'not someone else''s');
select pg_temp.pg();
select is(pg_get_function_result('public.group_member_profiles(uuid)'::regprocedure) like '%quiet%', false, 'co-members never see them');
-- Quiet hours stay off in what follows, until the claim.
update public.profiles set quiet_hours_start = null, quiet_hours_end = null;

-- ===== register_push_subscription =====
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select pg_temp.reg('http://fcm.googleapis.com/fcm/send/x')$$, '22023', 'push_endpoint_not_allowed', 'http is refused');
select throws_ok($$select pg_temp.reg('https://evil.example/fcm/send/x')$$, '22023', 'push_endpoint_not_allowed', 'a host outside the list is refused');
select throws_ok($$select pg_temp.reg('https://fcm.googleapis.com.evil.example/x')$$, '22023', 'push_endpoint_not_allowed', 'the allowed host as a prefix is refused');
select throws_ok($$select pg_temp.reg('https://evilfcm.googleapis.com/x')$$, '22023', 'push_endpoint_not_allowed', 'the allowed host as a bare suffix is refused');
select throws_ok($$select pg_temp.reg('https://fcm.googleapis.com@evil.example/x')$$, '22023', 'push_endpoint_not_allowed', 'user info that hides another host is refused');
select throws_ok($$select pg_temp.reg('https://evil.example\@fcm.googleapis.com/x')$$, '22023', 'push_endpoint_not_allowed', 'a backslash is refused');
select throws_ok($$select pg_temp.reg('https://fcm.googleapis.com:8443/x')$$, '22023', 'push_endpoint_not_allowed', 'another port is refused');
select throws_ok($$select pg_temp.reg('https://fcm.googleapis.com./x')$$, '22023', 'push_endpoint_not_allowed', 'a trailing dot is refused');
select throws_ok($$select pg_temp.reg(pg_temp.ep(repeat('x', 1000)))$$, '22023', 'push_endpoint_not_allowed', 'past 1024 characters is refused');
select throws_ok($$select public.register_push_subscription(pg_temp.ep('k'), repeat('A', 86), repeat('B', 22), null)$$, '22023', 'invalid_push_subscription', 'a short p256dh is refused');
select throws_ok($$select public.register_push_subscription(pg_temp.ep('k'), repeat('A', 87), 'B+/' || repeat('B', 19), null)$$, '22023', 'invalid_push_subscription', 'an auth outside base64url is refused');
select lives_ok($$select pg_temp.reg('https://wns2-bl2p.notify.windows.com/w/?token=abc')$$, 'a subdomain of notify.windows.com is accepted');
select lives_ok($$select pg_temp.reg('https://FCM.googleapis.com:443/fcm/send/upper')$$, 'host case and the default port are fine');
select lives_ok($$select public.register_push_subscription(pg_temp.ep('pad'), repeat('A', 87) || '=', repeat('B', 22) || '==', '  ')$$, 'padding is tolerated');
select pg_temp.pg();
select is((select user_agent from public.push_subscriptions where endpoint = pg_temp.ep('pad')), null, 'a blank label is stored as null');
delete from public.push_subscriptions;

select pg_temp.login(pg_temp.u('d'));
select pg_temp.reg(pg_temp.ep('d' || i)) from generate_series(1, 10) i;
select pg_temp.pg();
update public.push_subscriptions set created_at = now() - make_interval(mins => 100 - substr(endpoint, 38)::int)
where user_id = pg_temp.u('d');
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('sub11', pg_temp.reg(pg_temp.ep('d11'))::text);
select is((select count(*) from public.push_subscriptions), 10::bigint, 'the 11th browser keeps ten');
select pg_temp.pg();
select is((select count(*) from public.push_subscriptions where endpoint = pg_temp.ep('d1')), 0::bigint, 'and the oldest went');
select pg_temp.login(pg_temp.u('d'));
select is(pg_temp.reg(pg_temp.ep('d11')), pg_temp.g('sub11'), 'registering again is the same row');
select is((select count(*) from public.push_subscriptions), 10::bigint, 'and adds nothing');
select pg_temp.login(pg_temp.u('c'));
select pg_temp.sv('subc', pg_temp.reg(pg_temp.ep('d2'))::text);
select pg_temp.pg();
select is((select user_id from public.push_subscriptions where endpoint = pg_temp.ep('d2')), pg_temp.u('c'), 'the same browser on another account changes owner');
select is((select count(*) from public.push_subscriptions where user_id = pg_temp.u('d')), 9::bigint, 'and leaves the old one');
select pg_temp.sv('sub10', (select id from public.push_subscriptions where endpoint = pg_temp.ep('d10'))::text);

-- What the client reads of its devices.
select pg_temp.login(pg_temp.u('d'));
select is((select count(*) from (select id, user_agent, created_at, last_success_at from public.push_subscriptions) s), 9::bigint, 'the user lists their devices');
select throws_ok($$select endpoint from public.push_subscriptions$$, '42501', 'permission denied for table push_subscriptions', 'but not the endpoint, not even their own');
select throws_ok($$select p256dh from public.push_subscriptions$$, '42501', 'permission denied for table push_subscriptions', 'nor p256dh');
select throws_ok($$select auth from public.push_subscriptions$$, '42501', 'permission denied for table push_subscriptions', 'nor auth');
select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://evil.example/x', repeat('A', 87), repeat('B', 22))$$, '42501', 'permission denied for table push_subscriptions', 'and inserts only through the RPC');
select throws_ok($$update public.push_subscriptions set user_agent = 'x'$$, '42501', 'permission denied for table push_subscriptions', 'nor updates');
select is(pg_temp.rows($$delete from public.push_subscriptions where id = '$$ || pg_temp.g('subc') || $$'$$), 0::bigint, 'Duda cannot delete Caio''s device');
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from (select id from public.push_subscriptions) s), 1::bigint, 'Caio sees only his own');
select pg_temp.login(pg_temp.u('d'));
select is(pg_temp.rows($$delete from public.push_subscriptions where id = (select id from public.push_subscriptions order by created_at limit 1)$$), 1::bigint, 'Duda deletes her own');
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$select pg_temp.reg(pg_temp.ep('x'))$$, '42501', 'forbidden', 'no session, no device');
select pg_temp.pg();

-- ===== Notices of status and proof (section 2) =====
-- Duda, the assignee, completes Caio's task through the RPC: Caio, the creator, is told; Duda is not.
select pg_temp.login(pg_temp.u('d'));
select lives_ok(format($$select public.set_occurrence_status(%L, 'done', 'pending', null)$$, pg_temp.g('t1')), 'Duda completes T1');
select pg_temp.pg();
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved'), 1::bigint, 'the creator gets occurrence_resolved');
select is(pg_temp.n(pg_temp.u('d')), 0::bigint, 'nobody is told of their own action');
select is(pg_temp.n(pg_temp.u('a')), 0::bigint, 'the owner of the group is not the creator');
select is((pg_temp.last(pg_temp.u('c'), 'occurrence_resolved')).data,
  jsonb_build_object('status', 'done', 'byUserId', pg_temp.u('d')), 'data says what and who, no title');
select is((pg_temp.last(pg_temp.u('c'), 'occurrence_resolved')).dedupe_key,
  'occurrence_resolved:' || (select id from public.task_status_history where occurrence_id = pg_temp.g('t1'))::text,
  'the key is the line of the history');
select is((pg_temp.last(pg_temp.u('c'), 'occurrence_resolved')).group_id, '10000000-0000-0000-0000-00000000000a'::uuid, 'with the group');
select is(pg_temp.ob(pg_temp.u('c'), 'occurrence_resolved'), 0::bigint, 'the notice to the creator is bell only by default');

-- Repeating an event writes nothing; done, pending, done is two events but the same notice (SEG4-1).
select is(public.enqueue_notification(pg_temp.u('c'), 'occurrence_resolved', pg_temp.g('t1'), null, '{}',
  (select id from public.task_status_history where occurrence_id = pg_temp.g('t1'))::text), null, 'the same event again writes nothing');
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved'), 1::bigint, 'still one');
select pg_temp.act(pg_temp.u('d'), pg_temp.g('t1'), 'pending');
select pg_temp.act(pg_temp.u('d'), pg_temp.g('t1'), 'done');
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved'), 1::bigint, 'done, pending, done within the cooldown is still one notice');
select is(pg_temp.n(pg_temp.u('d')), 0::bigint, 'and reopening tells nobody');

-- Caio turns Duda's task red: Duda is told, Caio, the creator and the actor, is not.
select pg_temp.login(pg_temp.u('d'));
insert into public.notification_preferences (type, channel, enabled) values ('occurrence_missed', 'web_push', true);
select pg_temp.pg();
select pg_temp.act(pg_temp.u('c'), pg_temp.g('t2'), 'missed');
select is(pg_temp.n(pg_temp.u('d'), 'occurrence_missed'), 1::bigint, 'the assignee gets occurrence_missed');
select is((pg_temp.last(pg_temp.u('d'), 'occurrence_missed')).data, jsonb_build_object('byUserId', pg_temp.u('c')), 'by Caio');
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved'), 1::bigint, 'the creator who acted is not told');
select is(pg_temp.ob(pg_temp.u('d'), 'occurrence_missed'), 1::bigint, 'a preference turned on writes the push row');
select is(public.enqueue_notification(pg_temp.u('d'), 'occurrence_missed', pg_temp.g('t2'), null, '{}',
  (select id from public.task_status_history where occurrence_id = pg_temp.g('t2'))::text), null, 'replaying it writes nothing');
select is(pg_temp.ob(pg_temp.u('d'), 'occurrence_missed'), 1::bigint, 'and no second push row');

-- Duda turns her own assigned task red: Caio, the creator, is told; Duda is not.
select pg_temp.act(pg_temp.u('d'), pg_temp.g('t6'), 'missed');
select is(pg_temp.n(pg_temp.u('d'), null, pg_temp.g('t6')), 0::bigint, 'the assignee is not told of her own red');
select is((select data from public.notifications where occurrence_id = pg_temp.g('t6') and user_id = pg_temp.u('c')),
  jsonb_build_object('status', 'missed', 'byUserId', pg_temp.u('d')), 'the creator is, as a resolution');

-- Caio turns Duda's own task red: one notice to Duda, not two.
select pg_temp.act(pg_temp.u('c'), pg_temp.g('t3'), 'missed');
select is(pg_temp.n(pg_temp.u('d'), null, pg_temp.g('t3')), 1::bigint, 'the creator who is the assignee gets the red only');
select pg_temp.act(pg_temp.u('c'), pg_temp.g('t3b'), 'done');
select is(pg_temp.n(pg_temp.u('d'), 'occurrence_resolved', pg_temp.g('t3b')), 1::bigint, 'and is told when someone else completes it');
select is((pg_temp.last(pg_temp.u('d'), 'occurrence_resolved')).data, jsonb_build_object('status', 'done', 'byUserId', pg_temp.u('c')), 'by Caio');

-- A private task: the admin is never told.
select pg_temp.act(pg_temp.u('d'), pg_temp.g('t4'), 'done');
select is(pg_temp.n(pg_temp.u('c')) + pg_temp.n(pg_temp.u('a')), 2::bigint, 'the admin hears nothing of a private task');
select pg_temp.service();
update public.task_occurrences set status = 'missed' where id = pg_temp.g('t4b');
select pg_temp.pg();
select is((select data from public.notifications where occurrence_id = pg_temp.g('t4b')), '{"byUserId": null}'::jsonb, 'the service role is the job: the owner hears, with no author');
select is((select count(*) from public.notifications where occurrence_id = pg_temp.g('t4b')), 1::bigint, 'and only the owner');

-- Fred leaves Casa A: nothing of it reaches him again.
delete from public.group_members where user_id = pg_temp.u('f');
select pg_temp.act(null, pg_temp.g('t5'), 'missed');
select pg_temp.act(pg_temp.u('c'), pg_temp.g('t5b'), 'done');
select is(pg_temp.n(pg_temp.u('f')), 0::bigint, 'an ex-member gets neither the red nor the resolution');
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved'), 2::bigint, 'and the job tells no creator');

-- A photo that waits for review.
select pg_temp.sv('proof', pg_temp.proof(pg_temp.u('d'), pg_temp.g('pr'))::text);
select is((select proof_review_status::text from public.task_occurrences where id = pg_temp.g('pr')), 'in_review', 'the photo waits');
select is(pg_temp.n(pg_temp.u('c'), 'proof_in_review'), 1::bigint, 'the admin is told');
select is(pg_temp.n(pg_temp.u('a'), 'proof_in_review'), 1::bigint, 'the owner too');
select is(pg_temp.n(pg_temp.u('d'), 'proof_in_review'), 0::bigint, 'the author is not');
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved', pg_temp.g('pr')), 0::bigint, 'and the creator gets no resolution while it waits');
select is((pg_temp.last(pg_temp.u('c'), 'proof_in_review')).data,
  jsonb_build_object('proofId', pg_temp.g('proof'), 'groupId', '10000000-0000-0000-0000-00000000000a'), 'data has the proof and the group');
select is((pg_temp.last(pg_temp.u('c'), 'proof_in_review')).dedupe_key, 'proof_in_review:' || pg_temp.g('proof'), 'keyed by the proof');
select is(pg_temp.ob(pg_temp.u('c'), 'proof_in_review'), 1::bigint, 'a reviewer with a browser gets the push row');
select is(pg_temp.ob(pg_temp.u('a'), 'proof_in_review'), 0::bigint, 'one without a browser does not');
-- An author who is a reviewer is still the author.
select pg_temp.proof(pg_temp.u('c'), pg_temp.g('prc'));
select is(pg_temp.n(pg_temp.u('a'), 'proof_in_review', pg_temp.g('prc')), 1::bigint, 'the owner reviews the admin''s photo');
select is(pg_temp.n(pg_temp.u('c'), 'proof_in_review', pg_temp.g('prc')), 0::bigint, 'the admin who sent it is not asked to review it');

-- Caio disputes it: Duda is told once, as a dispute, not as a red.
select pg_temp.login(pg_temp.u('c'));
select lives_ok(format($$select public.review_proof(%L, 'dispute', 'missed', 'blurry')$$, pg_temp.g('proof')), 'Caio disputes');
select pg_temp.pg();
select is(pg_temp.n(pg_temp.u('d'), 'proof_disputed'), 1::bigint, 'the author gets proof_disputed');
select is(pg_temp.n(pg_temp.u('d'), 'occurrence_missed', pg_temp.g('pr')), 0::bigint, 'and not a red on top of it');
select is((pg_temp.last(pg_temp.u('d'), 'proof_disputed')).data, jsonb_build_object('proofId', pg_temp.g('proof'), 'toStatus', 'missed'), 'with the proof and the status');
select is(pg_temp.ob(pg_temp.u('d'), 'proof_disputed'), 1::bigint, 'pushed by default');
select is(pg_temp.n(pg_temp.u('c'), null, pg_temp.g('pr')), 1::bigint, 'the reviewer is told nothing of their own decision');

-- Undoing it is an approval, and a second dispute is a second notice.
select pg_temp.login(pg_temp.u('c'));
select lives_ok(format($$select public.review_proof(%L, 'approve', null, null)$$, pg_temp.g('proof')), 'Caio undoes the dispute');
select pg_temp.pg();
select is((select count(*) from public.notifications where occurrence_id = pg_temp.g('pr')), 3::bigint, 'approving tells nobody');
select pg_temp.login(pg_temp.u('d'));
insert into public.notification_preferences (type, channel, enabled) values ('proof_disputed', 'web_push', false);
select pg_temp.login(pg_temp.u('c'));
select lives_ok(format($$select public.review_proof(%L, 'dispute', 'partial', 'half')$$, pg_temp.g('proof')), 'and disputes again');
select pg_temp.pg();
select is(pg_temp.n(pg_temp.u('d'), 'proof_disputed'), 2::bigint, 'one notice per dispute');
select is(pg_temp.ob(pg_temp.u('d'), 'proof_disputed'), 1::bigint, 'a preference turned off writes no push row');
select throws_ok(format($$insert into public.notification_outbox (notification_id, user_id, channel, scheduled_for, next_attempt_at) select id, user_id, 'web_push', now(), now() from public.notifications where user_id = %L and type = 'proof_disputed' and id in (select notification_id from public.notification_outbox)$$, pg_temp.u('d')),
  '23505', null, 'one outbox row per notification and channel');

-- ===== The bell from the client =====
select pg_temp.login(pg_temp.u('d'));
select is((select count(*) from public.notifications), pg_temp.n(pg_temp.u('d')), 'Duda reads her whole bell');
select is((select count(*) from public.notifications where user_id <> auth.uid()), 0::bigint, 'and nobody else''s');
select is(pg_temp.rows($$update public.notifications set read_at = null$$), pg_temp.n(pg_temp.u('d')), 'an update with no filter reaches only her rows');
select is(pg_temp.rows($$update public.notifications set read_at = now() where type = 'proof_disputed'$$), 2::bigint, 'she marks hers as read');
select is(pg_temp.rows($$update public.notifications set read_at = now() where user_id = '00000000-0000-0000-0000-00000000000c'$$), 0::bigint, 'not Caio''s');
select throws_ok($$update public.notifications set data = '{}'$$, '42501', 'permission denied for table notifications', 'read_at is the only column she writes');
select throws_ok($$update public.notifications set user_id = '00000000-0000-0000-0000-00000000000c'$$, '42501', 'permission denied for table notifications', 'she cannot hand a row to someone');
select throws_ok($$insert into public.notifications (user_id, type, dedupe_key) values (auth.uid(), 'task_reminder', 'x')$$, '42501', 'permission denied for table notifications', 'nor write one');
select throws_ok($$delete from public.notifications$$, '42501', 'permission denied for table notifications', 'nor delete one');
-- Preferences are her own.
select is((select count(*) from public.notification_preferences), 2::bigint, 'she reads her preferences');
select throws_ok(format($$insert into public.notification_preferences (user_id, type, channel, enabled) values (%L, 'task_reminder', 'web_push', false)$$, pg_temp.u('c')),
  '42501', 'permission denied for table notification_preferences', 'and cannot write one for Caio');
select lives_ok($$insert into public.notification_preferences (type, channel, enabled) values ('task_reminder', 'web_push', true) on conflict (user_id, type, channel) do update set enabled = excluded.enabled$$, 'an upsert works');
select pg_temp.login(pg_temp.u('c'));
insert into public.notification_preferences (type, channel, enabled) values ('task_reminder', 'web_push', false);
select is((select count(*) from public.notification_preferences), 1::bigint, 'Caio sees only his');
select is(pg_temp.rows($$update public.notification_preferences set enabled = false where user_id = '00000000-0000-0000-0000-00000000000d'$$), 0::bigint, 'and changes none of Duda''s');
select is(pg_temp.rows($$delete from public.notification_preferences where user_id = '00000000-0000-0000-0000-00000000000d'$$), 0::bigint, 'nor deletes them');
select is(pg_temp.rows($$update public.notification_preferences set enabled = true$$), 1::bigint, 'an update with no filter reaches only his');
select is(pg_temp.rows($$delete from public.notification_preferences$$), 1::bigint, 'he deletes his own');
select pg_temp.pg();

-- ===== Reminders =====
select pg_temp.act(pg_temp.u('d'), pg_temp.g('r3'), 'done');
update public.tasks set archived_at = now() where id = (select task_id from public.task_occurrences where id = pg_temp.g('r5'));
select is(public.enqueue_due_reminders(), 2, 'the scan writes the two that are due');
select is(pg_temp.n(pg_temp.u('d'), 'task_reminder', pg_temp.g('r1')), 1::bigint, 'the lead of 30 minutes, not the one at the start');
select is((select dedupe_key from public.notifications where occurrence_id = pg_temp.g('r1')),
  'task_reminder:' || pg_temp.g('r1') || ':' || (select extract(epoch from scheduled_start)::bigint from public.task_occurrences where id = pg_temp.g('r1')) || ':30',
  'keyed by occurrence, anchor and lead');
select is((select data from public.notifications where occurrence_id = pg_temp.g('r1')),
  jsonb_build_object('leadMinutes', 30, 'anchorAt', (select scheduled_start from public.task_occurrences where id = pg_temp.g('r1'))), 'data has the lead and the anchor');
select is((select (data ->> 'anchorAt')::timestamptz from public.notifications where occurrence_id = pg_temp.g('r4')),
  (select scheduled_due from public.task_occurrences where id = pg_temp.g('r4')), 'a deadline is anchored on its due moment');
select is((select ob.scheduled_for from public.notification_outbox ob join public.notifications n on n.id = ob.notification_id where n.occurrence_id = pg_temp.g('r1')),
  (select scheduled_start - interval '30 minutes' from public.task_occurrences where id = pg_temp.g('r1')), 'its push is scheduled for when it was due');
select is(pg_temp.n(pg_temp.u('d'), 'task_reminder', pg_temp.g('r2')), 0::bigint, 'a lead past the catch-up window is not written');
select is(pg_temp.n(pg_temp.u('d'), 'task_reminder', pg_temp.g('r3')), 0::bigint, 'nor one of an occurrence that is not pending');
select is(pg_temp.n(pg_temp.u('d'), 'task_reminder', pg_temp.g('r5')), 0::bigint, 'nor one of an archived task');
select is(pg_temp.n(pg_temp.u('f'), 'task_reminder'), 0::bigint, 'nor one for an ex-member');
select is(public.enqueue_due_reminders(), 0, 'running the scan again writes nothing');
select is(pg_temp.n(pg_temp.u('d'), 'task_reminder'), 2::bigint, 'still two');

-- ===== Quiet hours, the arithmetic =====
select is(public.quiet_hours_end_at('America/Sao_Paulo', '22:00', '07:00', '2026-11-02 23:30-03'), '2026-11-03 07:00-03'::timestamptz, 'across midnight, before it');
select is(public.quiet_hours_end_at('America/Sao_Paulo', '22:00', '07:00', '2026-11-03 06:59-03'), '2026-11-03 07:00-03'::timestamptz, 'across midnight, after it');
select is(public.quiet_hours_end_at('America/Sao_Paulo', '22:00', '07:00', '2026-11-02 22:00-03'), '2026-11-03 07:00-03'::timestamptz, 'the start is inside');
select is(public.quiet_hours_end_at('America/Sao_Paulo', '22:00', '07:00', '2026-11-03 07:00-03'), null, 'the end is outside');
select is(public.quiet_hours_end_at('America/Sao_Paulo', '22:00', '07:00', '2026-11-03 12:00-03'), null, 'midday is outside');
select is(public.quiet_hours_end_at('America/Sao_Paulo', '13:00', '15:00', '2026-11-03 14:00-03'), '2026-11-03 15:00-03'::timestamptz, 'a window within the day');
select is(public.quiet_hours_end_at('America/Sao_Paulo', '13:00', '15:00', '2026-11-03 12:59-03'), null, 'and before it');
select is(public.quiet_hours_end_at('America/Sao_Paulo', null, null, '2026-11-03 02:00-03'), null, 'no quiet hours');
select is(public.quiet_hours_end_at('Asia/Tokyo', '22:00', '07:00', '2026-11-02 14:00Z'), '2026-11-03 07:00+09'::timestamptz, 'in the zone of the profile: 23:00 in Tokyo');
select is(public.quiet_hours_end_at('Asia/Tokyo', '22:00', '07:00', '2026-11-02 23:30-03'), null, 'which is 11:30 there, outside');
select is(public.quiet_hours_end_at('America/New_York', '22:00', '07:00', '2026-10-31 23:00-04'), '2026-11-01 07:00-05'::timestamptz, 'the night daylight saving ends, the end is 07:00 local');

-- ===== Claim and report =====
delete from public.notification_outbox;
update public.profiles set
  quiet_hours_start = ((now() at time zone 'America/Sao_Paulo') - interval '1 hour')::time,
  quiet_hours_end = ((now() at time zone 'America/Sao_Paulo') + interval '1 hour')::time
where id = pg_temp.u('d');
update public.profiles set timezone = 'Asia/Tokyo',
  quiet_hours_start = ((now() at time zone 'Asia/Tokyo') - interval '1 hour')::time,
  quiet_hours_end = ((now() at time zone 'Asia/Tokyo') + interval '1 hour')::time
where id = pg_temp.u('c');

create function pg_temp.q(
  p_name text, p_user uuid, p_type public.notification_type, p_occ uuid, p_data jsonb,
  p_sched timestamptz default now(), p_status public.notification_outbox_status default 'pending',
  p_next timestamptz default now(), p_attempts int default 0
) returns void language plpgsql as $$
declare nid uuid; oid uuid;
begin
  insert into public.notifications (user_id, type, occurrence_id, data, dedupe_key)
  values (p_user, p_type, p_occ, p_data, 'test:' || p_name) returning id into nid;
  insert into public.notification_outbox (notification_id, user_id, channel, status, scheduled_for, next_attempt_at, attempts, locked_until)
  values (nid, p_user, 'web_push', p_status, p_sched, p_next, p_attempts, case when p_status = 'sending' then p_next end)
  returning id into oid;
  perform pg_temp.sv(p_name, oid::text);
end;
$$;

create function pg_temp.rem(p_minutes int) returns jsonb language sql as $$
  select jsonb_build_object('leadMinutes', 30, 'anchorAt', now() + make_interval(mins => p_minutes));
$$;

create function pg_temp.st(p_name text) returns text language sql as $$
  select status || ':' || attempts || ':' || coalesce(last_error, '-') from public.notification_outbox where id = pg_temp.g(p_name);
$$;

select pg_temp.q('x1', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(30), now() - interval '25 hours');
select pg_temp.q('x2', pg_temp.u('d'), 'task_reminder', pg_temp.g('r3'), pg_temp.rem(30));
select pg_temp.q('x3', pg_temp.u('e'), 'occurrence_missed', pg_temp.g('t1'), '{"byUserId": null}');
select pg_temp.q('x4', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(180));
select pg_temp.q('x5', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(30));
select pg_temp.q('x6', pg_temp.u('d'), 'proof_disputed', pg_temp.g('pr'), '{}');
select pg_temp.q('x7', pg_temp.u('a'), 'occurrence_resolved', pg_temp.g('t1'), '{}');
select pg_temp.q('x8', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(20), now(), 'sending', now() - interval '1 minute', 1);
select pg_temp.q('x9', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(20), now(), 'sending', now() + interval '1 minute', 1);
select pg_temp.q('x10', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(10));
select pg_temp.q('x11', pg_temp.u('a'), 'proof_in_review', pg_temp.g('pr'), '{}');
select pg_temp.q('x12', pg_temp.u('c'), 'occurrence_resolved', pg_temp.g('t1'), '{}');
select pg_temp.q('x13', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), pg_temp.rem(30), now(), 'pending', now() + interval '1 minute');

select pg_temp.service();
create temp table claim1 as select public.claim_notification_batch(100, 120, 24) as r;
select pg_temp.pg();
select is((select r - 'items' from claim1), '{"expired": 1, "cancelled": 4, "deferred": 3}'::jsonb, 'the claim counts what it settled');
select is(pg_temp.st('x1'), 'expired:0:expired', 'past the maximum delay: expired');
select is(pg_temp.st('x2'), 'cancelled:0:resolved', 'a reminder of an occurrence no longer pending: cancelled');
select is(pg_temp.st('x3'), 'cancelled:0:no_access', 'a recipient with no access: cancelled');
select is(pg_temp.st('x11'), 'cancelled:0:resolved', 'a review notice whose photo is no longer waiting: cancelled');
select is(pg_temp.st('x7'), 'cancelled:0:no_subscription', 'no browser left: cancelled');
select is(pg_temp.st('x4'), 'pending:0:-', 'a reminder anchored after the quiet hours waits');
select is((select next_attempt_at from public.notification_outbox where id = pg_temp.g('x4')), now() + interval '1 hour', 'until the end of the window, in Sao Paulo');
select is(pg_temp.st('x6'), 'pending:0:-', 'any other type waits too');
select is(pg_temp.st('x12'), 'pending:0:-', 'and so in Tokyo');
select is((select next_attempt_at from public.notification_outbox where id = pg_temp.g('x12')), now() + interval '1 hour', 'until the end of the window there');
select is(pg_temp.st('x5'), 'sending:1:-', 'a reminder anchored inside the quiet hours rings');
select is(pg_temp.st('x8'), 'sending:2:-', 'a lease that ran out goes back to the queue');
select is(pg_temp.st('x9'), 'sending:1:-', 'a lease still running does not');
select is(pg_temp.st('x13'), 'pending:0:-', 'nor a row not yet due');
select is((select next_attempt_at from public.notification_outbox where id = pg_temp.g('x5')), now() + interval '120 seconds', 'the lease is the one asked for');
select is((select jsonb_array_length(r -> 'items') from claim1), 3, 'three rows to send');
select is(
  (select i - 'subscriptions' - 'outboxId' - 'notificationId' - 'scheduledFor' from claim1, jsonb_array_elements(r -> 'items') i where i ->> 'outboxId' = pg_temp.g('x5')::text),
  jsonb_build_object('channel', 'web_push', 'type', 'task_reminder', 'data', pg_temp.rem(30), 'occurrenceId', pg_temp.g('r1'),
    'locale', 'pt-BR', 'taskTitle', 'R1 soon', 'requiresPhotoProof', false, 'attempts', 1,
    'timezone', 'America/Sao_Paulo', 'occurrenceStatus', 'pending', 'phone', null, 'summary', null,
    'overdueAt', (select overdue_at from public.task_occurrences where id = pg_temp.g('r1'))),
  'an item has what the function needs to build the message, with the deadline of the red (ADR-0009, section 9)');
select is(
  (select jsonb_array_length(i -> 'subscriptions') from claim1, jsonb_array_elements(r -> 'items') i where i ->> 'outboxId' = pg_temp.g('x5')::text),
  (select count(*)::int from public.push_subscriptions where user_id = pg_temp.u('d')), 'and every browser of the user');
select is(
  (select array(select jsonb_object_keys(i -> 'subscriptions' -> 0) order by 1) from claim1, jsonb_array_elements(r -> 'items') i where i ->> 'outboxId' = pg_temp.g('x5')::text),
  array['auth', 'endpoint', 'id', 'p256dh'], 'with endpoint and keys');

select pg_temp.service();
select is(public.report_notification_results(jsonb_build_array(
  jsonb_build_object('outboxId', pg_temp.g('x5'), 'status', 'sent', 'deliveredSubscriptionIds', jsonb_build_array(pg_temp.g('sub11'))),
  jsonb_build_object('outboxId', pg_temp.g('x8'), 'status', 'retry', 'code', 'push_server_error', 'retryAfterSeconds', 300),
  jsonb_build_object('outboxId', pg_temp.g('x10'), 'status', 'failed', 'code', repeat('x', 70),
    'goneSubscriptionIds', jsonb_build_array(pg_temp.g('sub10'), pg_temp.g('subc'))),
  jsonb_build_object('outboxId', pg_temp.g('x4'), 'status', 'sent')
)), 3, 'the report updates the three rows in sending, and skips the other');
select throws_ok($$select public.report_notification_results('[{"outboxId": "00000000-0000-0000-0000-000000000000", "status": "gone"}]')$$, '22023', 'invalid_argument', 'an unknown result is refused');
select pg_temp.pg();
select is(pg_temp.st('x5') || ':' || ((select sent_at from public.notification_outbox where id = pg_temp.g('x5')) = now())::text, 'sent:1:-:true', 'sent');
select is((select last_success_at from public.push_subscriptions where id = pg_temp.g('sub11')), now(), 'the browser that took it is marked');
select is(pg_temp.st('x8'), 'pending:2:push_server_error', 'a retry goes back to pending with its code');
select is((select next_attempt_at from public.notification_outbox where id = pg_temp.g('x8')), now() + interval '300 seconds', 'after the wait the function chose');
select is(pg_temp.st('x10'), 'failed:1:' || repeat('x', 64), 'failed, with the code cut to 64');
select is((select count(*) from public.push_subscriptions where id = pg_temp.g('sub10')), 0::bigint, 'a gone browser is deleted');
select is((select count(*) from public.push_subscriptions where id = pg_temp.g('subc')), 1::bigint, 'but only among the recipient''s own');
select is(pg_temp.st('x4'), 'pending:0:-', 'a row not in sending is not touched');
select pg_temp.service();
select is((select jsonb_array_length(public.claim_notification_batch(100, 120, 24) -> 'items')), 0, 'claiming again finds nothing due');
select pg_temp.pg();

-- ===== Red by default (F4-6) =====
-- AM2 reopened a moment ago; AM3 archived; AM5 moved to tomorrow; AM6 waits for review.
select pg_temp.act(pg_temp.u('d'), pg_temp.g('am2'), 'done');
select pg_temp.act(pg_temp.u('d'), pg_temp.g('am2'), 'pending');
update public.tasks set archived_at = now() where id = (select task_id from public.task_occurrences where id = pg_temp.g('am3'));
update public.task_occurrences set scheduled_start = now() + interval '1 day', scheduled_due = now() + interval '1 day 1 hour'
where id = pg_temp.g('am5');
select pg_temp.sv('am6proof', pg_temp.proof(pg_temp.u('d'), pg_temp.g('am6'))::text);
select is((select overdue_at < now() and auto_miss_at > now() from public.task_occurrences where id = pg_temp.g('am5')), true, 'AM5 keeps its delay, and its red moved');

update public.app_settings set value = jsonb_set(value, '{autoMissJob,batchSize}', '1') where key = 'task_rules';
select is(public.auto_miss_occurrences(), 1, 'one batch at a time');
update public.app_settings set value = jsonb_set(value, '{autoMissJob,batchSize}', '500') where key = 'task_rules';
select ok(public.auto_miss_occurrences() >= 2, 'the next run takes the rest');
select is(public.auto_miss_occurrences(), 0, 'running again changes nothing');

select is((select string_agg(status::text, ',' order by title) from public.task_occurrences o join public.tasks t on t.id = o.task_id where t.title like 'AM%'),
  'missed,pending,pending,pending,pending,done,missed,missed,pending',
  'AM1, AM7 and AM8 turn red; reopened, archived, ex-member, rescheduled, in review and on time do not');
select is((select proof_review_status::text from public.task_occurrences where id = pg_temp.g('am6')), 'in_review', 'the photo still waits');
select is((select changed_by is null and from_status = 'pending' and to_status = 'missed' from public.task_status_history where occurrence_id = pg_temp.g('am1')), true, 'the history has no author');
select is((select count(*) from public.xp_events where occurrence_id in (pg_temp.g('am1'), pg_temp.g('am7'), pg_temp.g('am8'))), 0::bigint, 'and the XP is zero');
select is((select data from public.notifications where occurrence_id = pg_temp.g('am1') and type = 'occurrence_missed'), '{"byUserId": null}'::jsonb, 'the assignee is told the job did it');
select is((select count(*) from public.notifications where occurrence_id = pg_temp.g('am1')), 1::bigint, 'and nobody else');
select is((select count(*) from public.notifications where occurrence_id = pg_temp.g('am8')), 1::bigint, 'a personal task too');

update public.task_occurrences set status_changed_at = now() - interval '59 minutes' where id = pg_temp.g('am2');
select is(public.auto_miss_occurrences(), 0, 'within the grace a reopened occurrence waits');
update public.task_occurrences set status_changed_at = now() - interval '61 minutes' where id = pg_temp.g('am2');
select is(public.auto_miss_occurrences(), 1, 'after it, it turns red');
select is((select status::text from public.task_occurrences where id = pg_temp.g('am2')), 'missed', 'AM2');

-- ===== Retention =====
select pg_temp.q('old', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), '{}');
select pg_temp.q('young', pg_temp.u('d'), 'task_reminder', pg_temp.g('r1'), '{}');
update public.notifications set created_at = now() - interval '31 days' where dedupe_key = 'test:old';
update public.notifications set created_at = now() - interval '29 days' where dedupe_key = 'test:young';
-- SEG4-5: a browser with no delivery in 90 days goes, counted from its creation if it never had one.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at, last_success_at) values
  (pg_temp.u('d'), pg_temp.ep('stale91'), repeat('A', 87), repeat('B', 22), now() - interval '91 days', null),
  (pg_temp.u('d'), pg_temp.ep('young89'), repeat('A', 87), repeat('B', 22), now() - interval '89 days', null),
  (pg_temp.u('d'), pg_temp.ep('used10'), repeat('A', 87), repeat('B', 22), now() - interval '200 days', now() - interval '10 days'),
  (pg_temp.u('d'), pg_temp.ep('used91'), repeat('A', 87), repeat('B', 22), now() - interval '200 days', now() - interval '91 days');
create temp table subs_before as select id from public.push_subscriptions
where endpoint not in (pg_temp.ep('stale91'), pg_temp.ep('young89'), pg_temp.ep('used10'), pg_temp.ep('used91'));
select is(public.delete_expired_notifications(), 1, 'the bell forgets after 30 days');
select is((select count(*) from public.notification_outbox where id = pg_temp.g('old')), 0::bigint, 'with the outbox row');
select is((select count(*) from public.notification_outbox where id = pg_temp.g('young')), 1::bigint, 'and keeps the younger ones');
select is(
  (select string_agg(substr(endpoint, 37), ',' order by endpoint) from public.push_subscriptions
    where endpoint in (pg_temp.ep('stale91'), pg_temp.ep('young89'), pg_temp.ep('used10'), pg_temp.ep('used91'))),
  'used10,young89', 'the same job deletes the browsers with no delivery in 90 days, and only them');
select is((select count(*) from public.push_subscriptions where id in (select id from subs_before)), (select count(*) from subs_before),
  'every other browser stays');

-- ===== The same notice within the cooldown (SEG4-1) =====
-- Caio turned on push for resolutions, so every notice would also be a push row.
select pg_temp.sv('cd', pg_temp.mk('CD toggled', pg_temp.u('c'), pg_temp.u('d'), now() + interval '2 days')::text);
select pg_temp.login(pg_temp.u('c'));
insert into public.notification_preferences (type, channel, enabled) values ('occurrence_resolved', 'web_push', true);
select pg_temp.login(pg_temp.u('d'));
select lives_ok($t$do $$ begin
  for i in 1..50 loop
    perform public.set_occurrence_status(pg_temp.g('cd'), 'done', 'pending', null);
    perform public.set_occurrence_status(pg_temp.g('cd'), 'pending', 'done', null);
  end loop;
end $$ $t$, 'Duda toggles CD done and pending 50 times');
select pg_temp.pg();
select is((select count(*) from public.task_status_history where occurrence_id = pg_temp.g('cd')), 100::bigint, 'the 50 rounds are 100 history lines');
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved', pg_temp.g('cd')), 1::bigint, 'and one notice in the creator''s bell');
select is((select count(*) from public.notification_outbox ob join public.notifications n on n.id = ob.notification_id
  where n.occurrence_id = pg_temp.g('cd')), 1::bigint, 'with one push row');
-- Past the cooldown the same fact is told again.
update public.notifications set created_at = now() - interval '11 minutes' where occurrence_id = pg_temp.g('cd');
select pg_temp.login(pg_temp.u('d'));
select public.set_occurrence_status(pg_temp.g('cd'), 'done', 'pending', null);
select pg_temp.pg();
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved', pg_temp.g('cd')), 2::bigint, 'after 10 minutes the same notice comes again');
-- A different fact inside the cooldown is told at once.
select pg_temp.login(pg_temp.u('d'));
select public.set_occurrence_status(pg_temp.g('cd'), 'pending', 'done', null);
select public.set_occurrence_status(pg_temp.g('cd'), 'partial', 'pending', null);
select pg_temp.pg();
select is(pg_temp.n(pg_temp.u('c'), 'occurrence_resolved', pg_temp.g('cd')), 3::bigint, 'another status inside the window is a new notice');
select is((pg_temp.last(pg_temp.u('c'), 'occurrence_resolved')).data, jsonb_build_object('status', 'partial', 'byUserId', pg_temp.u('d')), 'the partial one');

-- Reminders are out of the cooldown: two leads of the same occurrence are two notices.
select pg_temp.sv('cdr', pg_temp.mk('CDR two leads', pg_temp.u('c'), pg_temp.u('d'), now() - interval '1 minute', 'group', '[5, 0]')::text);
select ok(public.enqueue_due_reminders() >= 2, 'the scan writes the two leads');
select is(pg_temp.n(pg_temp.u('d'), 'task_reminder', pg_temp.g('cdr')), 2::bigint, 'two reminders of one occurrence');
select isnt(public.enqueue_notification(pg_temp.u('d'), 'task_reminder', pg_temp.g('cdr'), null,
  (pg_temp.last(pg_temp.u('d'), 'task_reminder')).data, 'another-key'), null, 'even the same data under another key is written');

-- Disputing and undoing in a loop tells the author once.
select pg_temp.sv('cdp', pg_temp.mk('CDP disputed', pg_temp.u('c'), pg_temp.u('d'), now() + interval '2 days', 'group', '[]', true, true)::text);
select pg_temp.sv('cdproof', pg_temp.proof(pg_temp.u('d'), pg_temp.g('cdp'))::text);
select pg_temp.login(pg_temp.u('c'));
select lives_ok($t$do $$ begin
  for i in 1..5 loop
    perform public.review_proof(pg_temp.g('cdproof'), 'dispute', 'missed', 'blurry');
    perform public.review_proof(pg_temp.g('cdproof'), 'approve', null, null);
  end loop;
end $$ $t$, 'Caio disputes and undoes it five times');
select pg_temp.pg();
select is(pg_temp.n(pg_temp.u('d'), 'proof_disputed', pg_temp.g('cdp')), 1::bigint, 'the author hears of the dispute once');

-- ===== The owner of a browser changes only with its keys (SEG4-2) =====
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('subseg2', pg_temp.reg(pg_temp.ep('seg2'))::text);
select pg_temp.login(pg_temp.u('e'));
select throws_ok($$select public.register_push_subscription(pg_temp.ep('seg2'), repeat('C', 87), repeat('D', 22), 'Eva')$$,
  '42501', 'forbidden', 'another account with the endpoint and other keys is refused');
select pg_temp.pg();
select is((select user_id::text || ':' || left(p256dh, 1) || left(auth, 1) || ':' || user_agent from public.push_subscriptions where endpoint = pg_temp.ep('seg2')),
  pg_temp.u('d')::text || ':AB:Test agent', 'and the row is still Duda''s, keys and all');
select pg_temp.login(pg_temp.u('e'));
select is(pg_temp.reg(pg_temp.ep('seg2')), pg_temp.g('subseg2'), 'with the same keys the same browser changes account');
select pg_temp.pg();
select is((select user_id from public.push_subscriptions where endpoint = pg_temp.ep('seg2')), pg_temp.u('e'), 'and is Eva''s');
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('subseg2b', pg_temp.reg(pg_temp.ep('seg2b'))::text);
select is(public.register_push_subscription(pg_temp.ep('seg2b'), repeat('C', 87), repeat('D', 22), 'New agent'), pg_temp.g('subseg2b'),
  'the owner renews the keys of her own browser');
select pg_temp.pg();
select is((select left(p256dh, 1) || left(auth, 1) || ':' || user_agent from public.push_subscriptions where endpoint = pg_temp.ep('seg2b')),
  'CD:New agent', 'and they are stored');

-- ===== proof_in_review needs the task (SEG4-3) =====
-- T3 is Duda's: Caio, admin, neither created it nor does it.
select is(public.can_receive_notification(pg_temp.u('c'), 'proof_in_review', pg_temp.g('t3')), true, 'an admin who reviews and sees the group''s tasks is asked');
delete from public.role_permissions where role = 'admin' and permission_key = 'task.view_group';
select is(public.can_receive_notification(pg_temp.u('c'), 'proof_in_review', pg_temp.g('t3')), false, 'proof.review without seeing the task is not');
insert into public.role_permissions (role, permission_key) values ('admin', 'task.view_group');
update public.tasks set archived_at = now() where id = (select task_id from public.task_occurrences where id = pg_temp.g('t3'));
select is(public.can_receive_notification(pg_temp.u('c'), 'proof_in_review', pg_temp.g('t3')), false, 'nor of an archived task');

select * from finish();
rollback;
