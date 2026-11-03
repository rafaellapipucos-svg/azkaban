-- WhatsApp: phone verification, opt-in and opt-out, delivery lines, PARAR, the daily summary and the claim
-- (ADR-0009). Assume a hostile client calling the REST API directly. The clock is the transaction's now():
-- times are set relative to it, and the summary job's profiles live in zones where the local hour keeps
-- every window inside one day, so the result does not depend on when the suite runs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(151);

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid;
$$;

-- Alice owns Casa A, Duda is a member, Eva is outside. 1xx are the profiles of the summary job.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@test.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['a', 'd', 'e', 'f', '101', '102', '103', '104', '105', '106', '107', '108', '109', '10a']) k;

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', pg_temp.u('a'));
insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', pg_temp.u('d'), 'member');
insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa A', 'teal', 'x', pg_temp.u('a'));
insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by)
select ('2000000' || lpad(k, 1, '0') || '-0000-0000-0000-' || lpad(k, 12, '0'))::uuid,
  (select id from public.areas where key = 'work'), null, pg_temp.u(k), 'Own ' || k, 'teal', 'x', pg_temp.u(k)
from unnest(array['101', '102', '105', '108']) k;

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

create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;

create function pg_temp.gt(p_name text) returns text language sql as $$
  select current_setting('t.' || p_name);
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

-- Another 6-digit code than p_code, so a "wrong" try is never right by chance.
create function pg_temp.wrong(p_code text) returns text language sql as $$
  select lpad(((p_code::int + 1) % 1000000)::text, 6, '0');
$$;

-- A live code of a known value, as start_phone_verification would leave it: the user's other live codes die.
create function pg_temp.code(p_user uuid, p_phone text, p_code text, p_age interval default '0') returns uuid
language plpgsql as $$
declare vid uuid := gen_random_uuid();
begin
  update public.phone_verifications set expires_at = now() where user_id = p_user and consumed_at is null and expires_at > now();
  insert into public.phone_verifications (id, user_id, phone_e164, code_hash, expires_at, created_at)
  values (vid, p_user, p_phone, encode(extensions.digest(vid::text || ':' || p_code, 'sha256'), 'hex'),
    now() - p_age + interval '10 minutes', now() - p_age);
  return vid;
end;
$$;

-- Verified and opted in a minute ago, without going through the RPCs.
create function pg_temp.ready(p_user uuid, p_phone text) returns void language sql as $$
  update public.profiles
  set phone_e164 = p_phone, phone_verified_at = now() - interval '2 minutes',
    whatsapp_opt_in_at = now() - interval '1 minute', whatsapp_opt_in_version = 1,
    whatsapp_opt_out_at = null, whatsapp_opt_out_source = null
  where id = p_user;
$$;

create function pg_temp.is_ready(p_user uuid) returns boolean language sql as $$
  select public.is_whatsapp_ready(p) from public.profiles p where id = p_user;
$$;

-- A one-off task and its occurrence id. p_ctx null is Casa A.
create function pg_temp.mk(
  p_title text, p_assignee uuid, p_at timestamptz, p_type public.schedule_type default 'timed',
  p_ctx uuid default '20000000-0000-0000-0000-00000000000a', p_creator uuid default null
) returns uuid language plpgsql as $$
declare tid uuid; oid uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, due_at, duration_min, timezone,
    reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty,
    priority, visibility
  ) values (
    p_ctx, coalesce(p_creator, p_assignee), p_assignee, p_title, p_type,
    case when p_type = 'deadline' then null else p_at end,
    case when p_type = 'deadline' then p_at end,
    case when p_type = 'timed' then 60 end, 'America/Sao_Paulo',
    '[]', false, false, false, 'medium', 'normal',
    case when p_ctx = '20000000-0000-0000-0000-00000000000a' then 'group' else 'private' end::public.task_visibility
  ) returning id into tid;
  select id into oid from public.task_occurrences where task_id = tid;
  return oid;
end;
$$;

-- An outbox row of p_user, through enqueue_notification, and its id under p_name.
create function pg_temp.q(p_name text, p_user uuid, p_type text, p_data jsonb, p_key text,
  p_scheduled timestamptz default now(), p_occ uuid default null) returns text language plpgsql as $$
declare nid uuid;
begin
  nid := public.enqueue_notification(p_user, p_type::public.notification_type, p_occ, null, p_data, p_key, p_scheduled);
  return pg_temp.sv(p_name, (select id from public.notification_outbox where notification_id = nid and channel = 'whatsapp')::text);
end;
$$;

create function pg_temp.st(p_name text) returns text language sql as $$
  select status || ':' || attempts || ':' || coalesce(last_error, '-') from public.notification_outbox where id = pg_temp.g(p_name);
$$;

create function pg_temp.claim(p_channels text[] default array['web_push', 'whatsapp']) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.service();
  r := public.claim_notification_batch(100, 120, 24, p_channels);
  perform pg_temp.pg();
  return r;
end;
$$;

create temp table claims (k text, r jsonb);
create function pg_temp.item(p_k text, p_name text) returns jsonb language sql as $$
  select i from claims c, jsonb_array_elements(c.r -> 'items') i where c.k = p_k and i ->> 'outboxId' = pg_temp.gt(p_name);
$$;

-- ===== Mirrors and schedule =====
select is((public.whatsapp_rules() ->> 'consentVersion')::int, 1, 'whatsapp_rules is mirrored');
select is(public.notification_rules() -> 'whatsappTypes', '["daily_summary"]'::jsonb, 'notification_rules lists the WhatsApp types');
select is(public.notification_rules() -> 'defaultChannels' -> 'daily_summary', '{"web_push": false, "whatsapp": true}'::jsonb,
  'and the summary goes by WhatsApp by default');
select is((select schedule from cron.job where jobname = 'enqueue-daily-summaries'), '* * * * *', 'the summary job runs every minute');
select is((select count(*) from pg_enum where enumtypid = 'public.notification_type'::regtype and enumlabel = 'daily_summary'), 1::bigint,
  'daily_summary is a notification type');

-- ===== Privileges =====
select is((select count(*) from pg_class where oid in ('public.phone_verifications'::regclass,
  'public.whatsapp_messages'::regclass, 'public.whatsapp_console_messages'::regclass) and relrowsecurity), 3::bigint,
  'RLS is on in the three tables');
select is((select count(*) from pg_policies where tablename in ('phone_verifications', 'whatsapp_messages', 'whatsapp_console_messages')),
  0::bigint, 'with no policy');
select is(
  (select string_agg(r || ':' || t || ':' || p, ',') from unnest(array['anon', 'authenticated']) r,
    unnest(array['public.phone_verifications', 'public.whatsapp_messages', 'public.whatsapp_console_messages']) t,
    unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
   where has_table_privilege(r, t, p)),
  null, 'and no privilege at all for anon or authenticated');
select is(
  (select string_agg(f, ',' order by f) from unnest(array[
    'public.start_phone_verification(uuid, text)', 'public.record_whatsapp_statuses(jsonb)',
    'public.whatsapp_stop_by_wa_id(text)', 'public.enqueue_daily_summaries()',
    'public.is_whatsapp_ready(public.profiles)', 'public.whatsapp_rules()', 'public.profile_timezone(text)',
    'public.daily_summary_source(uuid, text, date)', 'public.daily_summary_is_empty(jsonb)',
    'public.phone_limit_wait(timestamptz[], int, interval)'
  ]) f where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  null, 'no internal function of WhatsApp is open to authenticated or anon');
select is(
  (select string_agg(f, ',' order by f) from unnest(array[
    'public.start_phone_verification(uuid, text)', 'public.record_whatsapp_statuses(jsonb)', 'public.whatsapp_stop_by_wa_id(text)'
  ]) f where not has_function_privilege('service_role', f, 'execute')),
  null, 'the service role runs the three the functions call');
select is(
  (select string_agg(attname, ',' order by attname) from pg_attribute
    where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', 'public.profiles', attname, 'UPDATE')),
  'daily_summary_deadline_days,daily_summary_enabled,daily_summary_include_overdue,daily_summary_skip_empty,daily_summary_time,display_name,locale,quiet_hours_end,quiet_hours_start,timezone',
  'of the new columns, the user writes only the five summary preferences');

select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select * from public.phone_verifications$$, '42501', 'permission denied for table phone_verifications', 'a user reads no code');
select throws_ok($$select * from public.whatsapp_messages$$, '42501', 'permission denied for table whatsapp_messages', 'nor delivery lines');
select throws_ok($$select * from public.whatsapp_console_messages$$, '42501', 'permission denied for table whatsapp_console_messages', 'nor the console outbox');
select throws_ok($$insert into public.whatsapp_messages (user_id, purpose, provider, provider_message_id) values (auth.uid(), 'notification', 'meta', 'x')$$,
  '42501', 'permission denied for table whatsapp_messages', 'nor writes one');
select throws_ok($$update public.profiles set phone_e164 = '+5511999990000', phone_verified_at = now() where id = auth.uid()$$,
  '42501', 'permission denied for table profiles', 'nor sets a phone without the code');
select throws_ok($$update public.profiles set whatsapp_opt_out_at = null, whatsapp_opt_out_source = null where id = auth.uid()$$,
  '42501', 'permission denied for table profiles', 'nor clears an opt-out');
select throws_ok($$update public.profiles set daily_summary_last_date = null where id = auth.uid()$$,
  '42501', 'permission denied for table profiles', 'nor the date of the last summary');
select throws_ok($$select public.start_phone_verification(auth.uid(), '+5511999990000')$$, '42501',
  'permission denied for function start_phone_verification', 'nor asks for a code without the function');
select throws_ok($$select public.whatsapp_stop_by_wa_id('5511999990000')$$, '42501',
  'permission denied for function whatsapp_stop_by_wa_id', 'nor stops someone else''s number');
select throws_ok($$select public.record_whatsapp_statuses('[]')$$, '42501',
  'permission denied for function record_whatsapp_statuses', 'nor writes statuses');
select throws_ok($$select public.enqueue_daily_summaries()$$, '42501',
  'permission denied for function enqueue_daily_summaries', 'nor runs the summary job');
select lives_ok($$update public.profiles set daily_summary_time = '07:30', daily_summary_deadline_days = 3,
  daily_summary_include_overdue = false, daily_summary_skip_empty = false, daily_summary_enabled = false where id = auth.uid()$$,
  'the user sets the summary preferences');
select throws_ok($$update public.profiles set daily_summary_deadline_days = 31 where id = auth.uid()$$, '23514', null,
  'past 30 days of deadlines is refused');
select is(pg_temp.rows($$update public.profiles set daily_summary_enabled = false where id = '00000000-0000-0000-0000-00000000000a'$$),
  0::bigint, 'not someone else''s');
select pg_temp.pg();
set local role anon;
select throws_ok($$select public.confirm_phone_verification('123456')$$, '42501',
  'permission denied for function confirm_phone_verification', 'anon confirms nothing');
select throws_ok($$select public.whatsapp_opt_in(1)$$, '42501', 'permission denied for function whatsapp_opt_in', 'nor opts in');
select pg_temp.pg();
update public.profiles set daily_summary_time = '08:00', daily_summary_deadline_days = 7, daily_summary_include_overdue = true,
  daily_summary_skip_empty = true, daily_summary_enabled = true where id = pg_temp.u('d');
select is((select daily_summary_enabled::text || daily_summary_time::text || daily_summary_include_overdue::text
  || daily_summary_deadline_days::text || daily_summary_skip_empty::text || coalesce(daily_summary_last_date::text, '-')
  from public.profiles where id = pg_temp.u('e')), 'true08:00:00true7true-', 'a new profile has the defaults of whatsappRules');

-- ===== Co-members never see the phone =====
select pg_temp.ready(pg_temp.u('d'), '+5511999990001');
select pg_temp.login(pg_temp.u('a'));
select is((select count(*) from public.profiles where id = pg_temp.u('d')), 0::bigint, 'the owner of the group does not read a member''s profile');
select is((select string_agg(k, ',' order by k) from public.group_member_profiles('10000000-0000-0000-0000-00000000000a') m,
  jsonb_object_keys(to_jsonb(m)) k where m.user_id = pg_temp.u('d')), 'display_name,joined_at,role,user_id',
  'group_member_profiles still returns only the name, the role and the date');
select pg_temp.pg();
select is(
  (select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
      and pg_get_function_result(p.oid) ~* '(phone|whatsapp|daily_summary|e164|wa_id)'),
  null, 'no function open to authenticated returns a phone or a WhatsApp column');
update public.profiles set phone_e164 = null, phone_verified_at = null, whatsapp_opt_in_at = null, whatsapp_opt_in_version = null
where id = pg_temp.u('d');

-- ===== start_phone_verification =====
select pg_temp.service();
create temp table v1 as select public.start_phone_verification(pg_temp.u('d'), '+5511999990001') as r;
select pg_temp.pg();
select pg_temp.sv('c1', (select r ->> 'code' from v1));
select ok(pg_temp.gt('c1') ~ '^[0-9]{6}$', 'a code of codeLength digits');
select is((select r - 'code' - 'verificationId' from v1),
  jsonb_build_object('expiresAt', now() + interval '10 minutes', 'resendAt', now() + interval '60 seconds'),
  'it lives codeTtlMinutes and another may come after resendSeconds');
select is((select code_hash from public.phone_verifications where id = (select (r ->> 'verificationId')::uuid from v1)),
  encode(extensions.digest((select r ->> 'verificationId' from v1) || ':' || pg_temp.gt('c1'), 'sha256'), 'hex'),
  'only the hash of id:code is stored');
select is((select count(*) from public.phone_verifications v where to_jsonb(v)::text like '%"' || pg_temp.gt('c1') || '"%'), 0::bigint,
  'and never the code');
select pg_temp.service();
select is(public.start_phone_verification(pg_temp.u('d'), '+5511999990001'),
  '{"error": "phone_rate_limited", "retryAfterSeconds": 60}'::jsonb, 'a second code before resendSeconds waits');
select throws_ok($$select public.start_phone_verification('00000000-0000-0000-0000-00000000000d', '5511999990001')$$, '22023',
  'invalid_argument', 'a number out of E.164 is refused');
select pg_temp.pg();
update public.phone_verifications set created_at = created_at - interval '61 seconds' where user_id = pg_temp.u('d');
select pg_temp.service();
select pg_temp.sv('c2', public.start_phone_verification(pg_temp.u('d'), '+5511999990001') ->> 'code');
select pg_temp.pg();
select is((select count(*) from public.phone_verifications where user_id = pg_temp.u('d') and expires_at > now()), 1::bigint,
  'the new code kills the live one');

-- ===== confirm_phone_verification =====
select pg_temp.login(pg_temp.u('d'));
select is(public.confirm_phone_verification(case when pg_temp.gt('c1') = pg_temp.gt('c2') then pg_temp.wrong(pg_temp.gt('c1')) else pg_temp.gt('c1') end),
  '{"error": "phone_code_invalid"}'::jsonb, 'the replaced code is no longer good');
select is(public.confirm_phone_verification(pg_temp.wrong(pg_temp.gt('c2'))), '{"error": "phone_code_invalid"}'::jsonb, 'a wrong code is an answer');
select is(public.confirm_phone_verification('abc'), '{"error": "phone_code_invalid"}'::jsonb, 'so is garbage');
select is(public.confirm_phone_verification(null), '{"error": "phone_code_invalid"}'::jsonb, 'and nothing');
select is(public.confirm_phone_verification(pg_temp.wrong(pg_temp.gt('c2'))), '{"error": "phone_code_invalid"}'::jsonb, 'the fifth try is still counted');
select pg_temp.pg();
select is((select attempts from public.phone_verifications where user_id = pg_temp.u('d') order by created_at desc limit 1), 5,
  'every try was kept: nothing rolled back');
select pg_temp.login(pg_temp.u('d'));
select is(public.confirm_phone_verification(pg_temp.gt('c2')), '{"error": "phone_code_expired"}'::jsonb,
  'the sixth try fails even with the right code');
select pg_temp.pg();
select is((select phone_e164 from public.profiles where id = pg_temp.u('d')), null, 'and the phone was not set');

select pg_temp.sv('v3', pg_temp.code(pg_temp.u('d'), '+5511999990001', '424242')::text);
select pg_temp.login(pg_temp.u('d'));
select is(public.confirm_phone_verification('424242'),
  jsonb_build_object('phoneE164', '+5511999990001', 'verifiedAt', now()), 'the right code verifies the number');
select is((select phone_e164 || ':' || (phone_verified_at = now())::text from public.profiles where id = auth.uid()),
  '+5511999990001:true', 'the profile has it');
select is(public.confirm_phone_verification('424242'), '{"error": "phone_code_expired"}'::jsonb, 'a code works once');
select pg_temp.pg();
select pg_temp.code(pg_temp.u('e'), '+5511999990005', '111111', interval '11 minutes');
select pg_temp.login(pg_temp.u('e'));
select is(public.confirm_phone_verification('111111'), '{"error": "phone_code_expired"}'::jsonb, 'past codeTtlMinutes it is dead');
select pg_temp.pg();

-- ===== Send limits =====
-- Duda already asked for two codes and has one more from the fixture. Two more fill the five of the day.
update public.phone_verifications set created_at = created_at - interval '2 hours' where user_id = pg_temp.u('d');
select pg_temp.code(pg_temp.u('d'), '+5511999990001', '000001', interval '30 minutes');
select pg_temp.code(pg_temp.u('d'), '+5511999990001', '000002', interval '25 hours');
select pg_temp.service();
select ok(public.start_phone_verification(pg_temp.u('d'), '+5511999990002') ? 'code', 'the fifth code of the day, the old one out of the window');
select is(public.start_phone_verification(pg_temp.u('d'), '+5511999990003') -> 'retryAfterSeconds',
  to_jsonb(ceil(extract(epoch from (select min(created_at) from public.phone_verifications
    where user_id = pg_temp.u('d') and created_at > now() - interval '24 hours') + interval '24 hours' - now()))::int),
  'the sixth waits until the oldest of the day leaves it, even for another number');
select pg_temp.pg();
-- Fred asked five times for one number: Eva cannot fill it any more.
select pg_temp.code(pg_temp.u('f'), '+5511999990009', '000000', make_interval(hours => h)) from generate_series(1, 5) h;
select pg_temp.service();
select is(public.start_phone_verification(pg_temp.u('e'), '+5511999990009') ->> 'error', 'phone_rate_limited',
  'a number that got maxSendsPerPhonePerDay codes gets no more, whoever asks');
select ok(public.start_phone_verification(pg_temp.u('e'), '+5511999990008') ? 'code', 'another number does');
select pg_temp.pg();
update public.phone_verifications set created_at = now() - interval '25 hours' where user_id = pg_temp.u('f') and created_at = now() - interval '5 hours';
update public.phone_verifications set created_at = created_at - interval '61 seconds' where user_id = pg_temp.u('e');
select pg_temp.service();
select ok(public.start_phone_verification(pg_temp.u('e'), '+5511999990009') ? 'code', 'once one leaves the rolling day, it may');
select pg_temp.pg();
-- SEG5-4: Gil asks five codes for a number and deletes his account; the number keeps its count.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@test.local', jsonb_build_object('display_name', 'User ' || k) from unnest(array['211', '212']) k;
select pg_temp.code(pg_temp.u('211'), '+5511999990007', '000000', make_interval(mins => m)) from generate_series(1, 5) m;
delete from auth.users where id = pg_temp.u('211');
select is((select count(*) from public.phone_verifications where phone_e164 = '+5511999990007' and user_id is null), 5::bigint,
  'the codes outlive the deleted account, without its id');
select pg_temp.service();
select is(public.start_phone_verification(pg_temp.u('212'), '+5511999990007') ->> 'error', 'phone_rate_limited',
  'so another account gets no sixth code for that number within the day');
select pg_temp.pg();
delete from auth.users where id = pg_temp.u('212');

-- SEG5-5: only allowed countries, and a cap on every code of every user, deleted accounts included.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@test.local', jsonb_build_object('display_name', 'User ' || k) from unnest(array['213', '214', '215']) k;
select pg_temp.service();
select is(public.start_phone_verification(pg_temp.u('213'), '+14155550123'), '{"error": "phone_country_not_allowed"}'::jsonb,
  'a number outside allowedCountryCodes gets no code');
select is(public.start_phone_verification(pg_temp.u('213'), '+541123456789') ->> 'error', 'phone_country_not_allowed',
  'nor one whose country code only starts like an allowed one');
select pg_temp.pg();
select is((select count(*) from public.phone_verifications where phone_e164 in ('+14155550123', '+541123456789')), 0::bigint,
  'nothing is written, so it counts in no limit');
insert into public.phone_verifications (user_id, phone_e164, code_hash, expires_at, created_at)
select null, '+55119' || lpad(g::text, 8, '0'), repeat('0', 64), now(), now() - interval '23 hours'
from generate_series(1, 199 - (select count(*) from public.phone_verifications where created_at > now() - interval '24 hours')) g;
select pg_temp.service();
select ok(public.start_phone_verification(pg_temp.u('214'), '+5511999990010') ? 'code', 'the last code under maxSendsPerDay goes');
select is(public.start_phone_verification(pg_temp.u('215'), '+5511999990011'),
  '{"error": "phone_rate_limited", "retryAfterSeconds": 3600}'::jsonb,
  'the next one waits until the oldest of the day leaves it, whoever asks');
select pg_temp.pg();
delete from public.phone_verifications where user_id is null and created_at = now() - interval '23 hours';
delete from auth.users where id in (select pg_temp.u(k) from unnest(array['213', '214', '215']) k);

-- ===== Opt-in and opt-out =====
select pg_temp.login(pg_temp.u('e'));
select throws_ok($$select public.whatsapp_opt_in(1)$$, '22023', 'phone_not_verified', 'no opt-in without a verified phone');
select pg_temp.pg();
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.whatsapp_opt_in(0)$$, '22023', 'invalid_consent_version', 'nor with an older notice');
select throws_ok($$select public.whatsapp_opt_in(2)$$, '22023', 'invalid_consent_version', 'nor a newer one');
select lives_ok($$select public.whatsapp_opt_in(1)$$, 'the verified user opts in');
select is((select (whatsapp_opt_in_at = now())::text || whatsapp_opt_in_version from public.profiles where id = auth.uid()), 'true1',
  'with the date and the version');
select pg_temp.pg();
select ok(pg_temp.is_ready(pg_temp.u('d')), 'ready');
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.whatsapp_opt_out()$$, 'and opts out from the app');
select pg_temp.pg();
select is((select (whatsapp_opt_out_at = now())::text || whatsapp_opt_out_source from public.profiles where id = pg_temp.u('d')),
  'trueapp', 'with the date and the source');
select ok(not pg_temp.is_ready(pg_temp.u('d')), 'no longer ready');
update public.profiles set whatsapp_opt_out_at = now() - interval '1 hour', whatsapp_opt_in_at = now() - interval '2 hours'
where id = pg_temp.u('d');
select pg_temp.login(pg_temp.u('d'));
select public.whatsapp_opt_out();
select pg_temp.pg();
select is((select whatsapp_opt_out_at from public.profiles where id = pg_temp.u('d')), now() - interval '1 hour', 'repeating keeps the first date');
select pg_temp.login(pg_temp.u('d'));
select public.whatsapp_opt_in(1);
select pg_temp.pg();
select ok(pg_temp.is_ready(pg_temp.u('d')), 'an opt-in newer than the opt-out makes it ready again');

-- Confirming the same number keeps the consent; another number drops it.
select pg_temp.code(pg_temp.u('d'), '+5511999990001', '515151');
select pg_temp.login(pg_temp.u('d'));
select is(public.confirm_phone_verification('515151') ->> 'phoneE164', '+5511999990001', 'the same number is verified again');
select pg_temp.pg();
select ok(pg_temp.is_ready(pg_temp.u('d')), 'the same number again keeps the opt-in');
select pg_temp.code(pg_temp.u('d'), '+5511999990077', '525252');
select pg_temp.login(pg_temp.u('d'));
select is(public.confirm_phone_verification('525252') ->> 'phoneE164', '+5511999990077', 'another number is verified');
select pg_temp.pg();
select is((select phone_e164 || ':' || coalesce(whatsapp_opt_in_at::text, '-') || ':' || coalesce(whatsapp_opt_in_version::text, '-')
  from public.profiles where id = pg_temp.u('d')), '+5511999990077:-:-', 'and the consent, given for the old one, is gone');
select pg_temp.login(pg_temp.u('d'));
select public.whatsapp_opt_in(1);
select pg_temp.pg();
select pg_temp.code(pg_temp.u('d'), '+5511999990077', '535353');
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.remove_phone()$$, 'the user removes the number');
select is(public.confirm_phone_verification('535353'), '{"error": "phone_code_expired"}'::jsonb, 'which also kills a live code');
select pg_temp.pg();
select is((select concat_ws(',', phone_e164, phone_verified_at, whatsapp_opt_in_at, whatsapp_opt_in_version)
  from public.profiles where id = pg_temp.u('d')), '', 'phone, verification and consent are gone');
select throws_ok($$update public.profiles set whatsapp_opt_in_at = now(), whatsapp_opt_in_version = 1 where id = '00000000-0000-0000-0000-00000000000d'$$,
  '23514', null, 'and the table itself refuses a consent without a phone');

-- ===== Delivery lines and statuses =====
select pg_temp.ready(pg_temp.u('d'), '+5511999990001');
select pg_temp.service();
insert into public.whatsapp_messages (user_id, purpose, template, provider, provider_message_id, recipient_wa_id) values
  (pg_temp.u('d'), 'phone_code', 'phone_code_v1', 'meta', 'wamid.1', '551199990001'),
  (pg_temp.u('d'), 'notification', 'daily_summary_v1', 'meta', 'wamid.2', null),
  (pg_temp.u('d'), 'notification', 'daily_summary_v1', 'console', 'console.3', null);
select is(public.record_whatsapp_statuses(jsonb_build_array(
  jsonb_build_object('providerMessageId', 'wamid.1', 'status', 'sent', 'at', '2026-11-03T10:00:00.000Z', 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.1', 'status', 'delivered', 'at', '2026-11-03T10:00:05.000Z', 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.1', 'status', 'sent', 'at', '2026-11-03T10:00:06.000Z', 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.2', 'status', 'read', 'at', null, 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.2', 'status', 'failed', 'at', '2026-11-03T10:01:00.000Z', 'errorCode', 'wa_131026'),
  jsonb_build_object('providerMessageId', 'console.3', 'status', 'failed', 'at', null, 'errorCode', 'Bad Code!'),
  jsonb_build_object('providerMessageId', 'console.3', 'status', 'read', 'at', null, 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.unknown', 'status', 'read', 'at', null, 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.1', 'status', 'deleted', 'at', null, 'errorCode', null),
  jsonb_build_object('providerMessageId', 'wamid.1', 'status', 'accepted', 'at', null, 'errorCode', null)
)), 5, 'five events moved a status; a step back, an unknown id and another name did not');
select pg_temp.pg();
select is((select string_agg(provider_message_id || '=' || status || ':' || coalesce(error_code, '-'), ',' order by provider_message_id)
  from public.whatsapp_messages where user_id = pg_temp.u('d')),
  'console.3=failed:-,wamid.1=delivered:-,wamid.2=failed:wa_131026',
  'the status only moves forward, failed wins over read, and a bad code is dropped');
select is((select status_at from public.whatsapp_messages where provider_message_id = 'wamid.1'), '2026-11-03T10:00:05Z'::timestamptz,
  'with the time Meta gave');
select is((select status_at from public.whatsapp_messages where provider_message_id = 'console.3'), now(), 'or now, without one');
select pg_temp.service();
select is(public.record_whatsapp_statuses('[{"providerMessageId": "wamid.1", "status": "delivered", "at": null, "errorCode": null}]'), 0,
  'a repeated event changes nothing');
select throws_ok($$select public.record_whatsapp_statuses('{}')$$, '22023', 'invalid_argument', 'an object is not a batch');
select pg_temp.pg();

-- ===== PARAR =====
-- Duda and Eva share a number. Fred's profile has the ninth digit, and Meta answers without it. Alice
-- has the same number and already left.
select pg_temp.ready(pg_temp.u('e'), '+5511999990001');
select pg_temp.ready(pg_temp.u('f'), '+5511988887777');
update public.profiles set phone_e164 = '+5511999990001', phone_verified_at = now(), whatsapp_opt_in_at = now() - interval '1 day',
  whatsapp_opt_in_version = 1, whatsapp_opt_out_at = now() - interval '1 hour', whatsapp_opt_out_source = 'app'
where id = pg_temp.u('a');
select pg_temp.service();
select is(public.whatsapp_stop_by_wa_id('5511999990001'), 2, 'PARAR stops every ready account of the number');
select is(public.whatsapp_stop_by_wa_id('5511999990001'), 0, 'repeated, it changes nobody');
select is(public.whatsapp_stop_by_wa_id('551188887777'), 1, 'a wa_id without the ninth digit finds the profile, with no message sent');
select is(public.whatsapp_stop_by_wa_id('5511000000000'), 0, 'an unknown number changes nothing');
select throws_ok($$select public.whatsapp_stop_by_wa_id('+5511999990001')$$, '22023', 'invalid_argument', 'a wa_id is digits only');
select pg_temp.pg();
select is((select string_agg(coalesce(whatsapp_opt_out_source, '-') || ':' || (whatsapp_opt_out_at = now())::text, ',' order by id)
  from public.profiles where id in (pg_temp.u('a'), pg_temp.u('d'), pg_temp.u('e'), pg_temp.u('f'))),
  'app:false,webhook:true,webhook:true,webhook:true', 'from the webhook, now; who had already left keeps the date');

-- SEG5-1: only the current phone stops. Gil asked a code for a mistyped number, then verified and opted in
-- the right one; Hugo changed numbers; Iara shares Gil's number; Jair saved his without the ninth digit;
-- Kaio's 9-digit number does not start with 9; Lia is outside Brazil, with the shape of a Brazilian mobile.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@test.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['201', '202', '203', '204', '205', '206']) k;
insert into public.whatsapp_messages (user_id, purpose, template, provider, provider_message_id, recipient_wa_id) values
  (pg_temp.u('201'), 'phone_code', 'phone_code_v1', 'meta', 'wamid.g1', '5511977776666'),
  (pg_temp.u('202'), 'notification', 'daily_summary_v1', 'meta', 'wamid.h1', '551166665555');
select pg_temp.ready(pg_temp.u('201'), '+5511988880001');
select pg_temp.ready(pg_temp.u('202'), '+5511988880002');
select pg_temp.ready(pg_temp.u('203'), '+5511988880001');
select pg_temp.ready(pg_temp.u('204'), '+551188880004');
select pg_temp.ready(pg_temp.u('205'), '+5511888880005');
select pg_temp.ready(pg_temp.u('206'), '+4411988887777');
select pg_temp.service();
select is(public.whatsapp_stop_by_wa_id('5511977776666'), 0, 'the mistyped number that got a code stops nobody');
select is(public.whatsapp_stop_by_wa_id('551166665555') + public.whatsapp_stop_by_wa_id('5511966665555'), 0,
  'nor the old number, in either form');
select pg_temp.pg();
select is(pg_temp.is_ready(pg_temp.u('201')) and pg_temp.is_ready(pg_temp.u('202')), true, 'and both stay on');
select pg_temp.service();
select is(public.whatsapp_stop_by_wa_id('551188880001'), 2,
  'the current number without the ninth digit stops every ready account of it');
select is(public.whatsapp_stop_by_wa_id('5511988880004'), 1, 'with the ninth digit, it finds a number saved without it');
select is(public.whatsapp_stop_by_wa_id('551188880005'), 0, 'only a leading 9 is the ninth digit');
select is(public.whatsapp_stop_by_wa_id('441188887777'), 0, 'outside Brazil there is no ninth digit');
select is(public.whatsapp_stop_by_wa_id('4411988887777'), 1, 'only the same digits');
select pg_temp.pg();
delete from auth.users where id in (select pg_temp.u(k) from unnest(array['201', '202', '203', '204', '205', '206']) k);

-- SEG5-9: a 9 before a landline digit (2 to 5) is not the ninth digit. Bia has the landline 11 3333-4444;
-- Caio has the mobile 11 9 2222-3333, whose tail looks like a landline.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@test.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['207', '208']) k;
select pg_temp.ready(pg_temp.u('207'), '+551133334444');
select pg_temp.ready(pg_temp.u('208'), '+5511922223333');
select pg_temp.service();
select is(public.whatsapp_stop_by_wa_id('5511933334444'), 0, 'a mobile with the landline digits after the 9 stops nobody');
select is(public.whatsapp_stop_by_wa_id('551122223333'), 0, 'nor a landline with the digits of a mobile after its 9');
select pg_temp.pg();
select is(pg_temp.is_ready(pg_temp.u('207')) and pg_temp.is_ready(pg_temp.u('208')), true, 'the landline and the mobile stay on');
select pg_temp.service();
select is(public.whatsapp_stop_by_wa_id('551133334444') + public.whatsapp_stop_by_wa_id('5511922223333'), 2,
  'each stops with its own digits');
select pg_temp.pg();
delete from auth.users where id in (select pg_temp.u(k) from unnest(array['207', '208']) k);

-- ===== enqueue_notification =====
select pg_temp.ready(pg_temp.u('d'), '+5511999990001');
select pg_temp.login(pg_temp.u('d'));
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/d', repeat('A', 87), repeat('B', 22), 'Test');
insert into public.notification_preferences (type, channel, enabled) values ('daily_summary', 'web_push', true), ('task_reminder', 'whatsapp', true);
select pg_temp.pg();
select pg_temp.sv('n1', public.enqueue_notification(pg_temp.u('d'), 'daily_summary', null, null, '{"localDate": "2026-11-03"}', '2026-11-03')::text);
select is((select read_at = created_at and occurrence_id is null and group_id is null and dedupe_key = 'daily_summary:2026-11-03'
  from public.notifications where id = pg_temp.g('n1')), true, 'the summary''s bell row has no occurrence, no group, and is born read');
select is((select string_agg(channel::text, ',') from public.notification_outbox where notification_id = pg_temp.g('n1')), 'whatsapp',
  'only a WhatsApp row, even with a browser and push turned on for it');
select is(public.enqueue_notification(pg_temp.u('d'), 'daily_summary', null, null, '{"localDate": "2026-11-03"}', '2026-11-03'), null,
  'the same day is not written twice');
select pg_temp.sv('o1', pg_temp.mk('Reminder', pg_temp.u('d'), now() + interval '1 hour')::text);
select pg_temp.sv('n2', public.enqueue_notification(pg_temp.u('d'), 'task_reminder', pg_temp.g('o1'), null,
  jsonb_build_object('leadMinutes', 0, 'anchorAt', now() + interval '1 hour'), 'x')::text);
select is((select string_agg(channel::text, ',') from public.notification_outbox where notification_id = pg_temp.g('n2')), 'web_push',
  'a type outside whatsappTypes writes no WhatsApp row, whatever the preference');
select pg_temp.sv('n3', public.enqueue_notification(pg_temp.u('a'), 'daily_summary', null, null, '{"localDate": "2026-11-03"}', '2026-11-03')::text);
select is((select count(*) from public.notification_outbox where notification_id = pg_temp.g('n3')), 0::bigint,
  'a profile not ready gets no WhatsApp row');
delete from public.notifications where id in (pg_temp.g('n1'), pg_temp.g('n2'), pg_temp.g('n3'));
delete from public.tasks where id = (select task_id from public.task_occurrences where id = pg_temp.g('o1'));

-- ===== The summary's source =====
-- Duda, in Sao Paulo: what the summary of today tells.
select pg_temp.sv('ld', (now() at time zone 'America/Sao_Paulo')::date::text);
create function pg_temp.at(p_days int, p_time text default '12:00') returns timestamptz language sql as $$
  select ((pg_temp.gt('ld')::date + p_days) + p_time::time) at time zone 'America/Sao_Paulo';
$$;
select pg_temp.sv('s_today2', pg_temp.mk('Today later', pg_temp.u('d'), pg_temp.at(0, '12:30'))::text);
select pg_temp.sv('s_today', pg_temp.mk('Today', pg_temp.u('d'), pg_temp.at(0))::text);
select pg_temp.sv('s_late', pg_temp.mk('Late pending', pg_temp.u('d'), now() - interval '3 days')::text);
select pg_temp.sv('s_red', pg_temp.mk('Red in window', pg_temp.u('d'), now() - interval '2 days')::text);
select pg_temp.sv('s_old', pg_temp.mk('Red too old', pg_temp.u('d'), now() - interval '6 days')::text);
select pg_temp.sv('s_dl', pg_temp.mk('Deadline soon', pg_temp.u('d'), pg_temp.at(3), 'deadline')::text);
select pg_temp.sv('s_far', pg_temp.mk('Deadline far', pg_temp.u('d'), pg_temp.at(10), 'deadline')::text);
select pg_temp.sv('s_done', pg_temp.mk('Done today', pg_temp.u('d'), pg_temp.at(0, '13:00'))::text);
select pg_temp.sv('s_arch', pg_temp.mk('Archived today', pg_temp.u('d'), pg_temp.at(0, '14:00'))::text);
select pg_temp.sv('s_other', pg_temp.mk('Alice today', pg_temp.u('a'), pg_temp.at(0, '15:00'))::text);
update public.task_occurrences set status = 'missed' where id in (pg_temp.g('s_red'), pg_temp.g('s_old'));
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u('d'), 'role', 'authenticated')::text, true);
update public.task_occurrences set status = 'done' where id = pg_temp.g('s_done');
select set_config('request.jwt.claims', '', true);
update public.tasks set archived_at = now() where id = (select task_id from public.task_occurrences where id = pg_temp.g('s_arch'));
create function pg_temp.src() returns jsonb language sql as $$
  select public.daily_summary_source(pg_temp.u('d'), 'America/Sao_Paulo', pg_temp.gt('ld')::date);
$$;
create function pg_temp.titles(p_list text) returns text language sql as $$
  select string_agg(i ->> 'title', ',' order by n) from jsonb_array_elements(pg_temp.src() -> p_list) with ordinality x (i, n);
$$;
select is(pg_temp.titles('today'), 'Today,Today later', 'today: pending of the day, by start; not done, archived or someone else''s');
select is(pg_temp.titles('overdue'), 'Late pending,Red in window', 'overdue: pending past due, and red still inside the late window');
select is(pg_temp.titles('deadlines'), 'Deadline soon', 'deadlines: within deadline_days');
select is(pg_temp.src() - 'today' - 'overdue' - 'deadlines' - 'streak',
  jsonb_build_object('localDate', pg_temp.gt('ld'), 'timezone', 'America/Sao_Paulo', 'deadlineDays', 7,
    'totals', jsonb_build_object('today', 2, 'overdue', 2, 'deadlines', 1)),
  'with the date, the zone, the window and the totals (the streak is in rls_gamification)');
select is(pg_temp.src() -> 'deadlines' -> 0,
  (select jsonb_build_object('occurrenceId', o.id, 'title', 'Deadline soon', 'areaI18nKey', 'areas.home', 'contextName', 'Casa A',
    'scheduleType', 'deadline', 'startAt', o.scheduled_start, 'dueAt', o.scheduled_due)
   from public.task_occurrences o where o.id = pg_temp.g('s_dl')),
  'an item carries the title, the area, the context and the times');
update public.app_settings set value = jsonb_set(value, '{dailySummary,maxItems,today}', '1') where key = 'whatsapp_rules';
select is(jsonb_array_length(pg_temp.src() -> 'today') || '/' || (pg_temp.src() -> 'totals' ->> 'today'), '1/2',
  'a list is cut at maxItems, and the total stays whole');
update public.app_settings set value = jsonb_set(value, '{dailySummary,maxItems,today}', '30') where key = 'whatsapp_rules';
update public.profiles set daily_summary_include_overdue = false, daily_summary_deadline_days = 10 where id = pg_temp.u('d');
select is(pg_temp.src() -> 'overdue', 'null'::jsonb, 'overdue off is null');
select is((pg_temp.src() -> 'totals' ->> 'overdue') || '/' || pg_temp.titles('deadlines'), '0/Deadline soon,Deadline far',
  'with no count, and the deadline window follows the preference');
update public.profiles set daily_summary_include_overdue = true, daily_summary_deadline_days = 7 where id = pg_temp.u('d');
delete from public.group_members where user_id = pg_temp.u('d');
select is(pg_temp.src() -> 'totals', '{"today": 0, "overdue": 0, "deadlines": 0}'::jsonb, 'whoever left the group is told nothing of it');
select ok(public.daily_summary_is_empty(pg_temp.src()), 'and that day is empty');
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000a', pg_temp.u('d'), 'member');

-- ===== The claim =====
-- Rows of earlier sections that are due would be claimed too: they are not part of this section.
update public.notification_outbox set status = 'cancelled';
select pg_temp.q('w1', pg_temp.u('d'), 'daily_summary', jsonb_build_object('localDate', pg_temp.gt('ld')), 'w1', now() - interval '119 minutes');
select pg_temp.q('w2', pg_temp.u('d'), 'daily_summary', jsonb_build_object('localDate', pg_temp.gt('ld')), 'w2', now() - interval '121 minutes');
select pg_temp.ready(pg_temp.u('e'), '+5511999990005');
select pg_temp.q('w3', pg_temp.u('e'), 'daily_summary', jsonb_build_object('localDate', pg_temp.gt('ld')), 'w3b');
-- A zone from before profiles_check_timezone (SEG6-1), which the claim still survives.
alter table public.profiles disable trigger profiles_check_timezone;
update public.profiles set daily_summary_skip_empty = false, timezone = 'Not/AZone' where id = pg_temp.u('e');
alter table public.profiles enable trigger profiles_check_timezone;
select pg_temp.ready(pg_temp.u('f'), '+5511988887777');
select pg_temp.q('w4', pg_temp.u('f'), 'daily_summary', jsonb_build_object('localDate', pg_temp.gt('ld')), 'w4');
select pg_temp.q('w5', pg_temp.u('f'), 'daily_summary', jsonb_build_object('localDate', pg_temp.gt('ld')), 'w5');
-- Fred left after the row was written; and has nothing to do that day.
update public.profiles set whatsapp_opt_out_at = now(), whatsapp_opt_out_source = 'webhook' where id = pg_temp.u('f');
-- A row of a type outside whatsappTypes, as if written before the list changed.
insert into public.notifications (id, user_id, type, data, dedupe_key, occurrence_id) values
  (gen_random_uuid(), pg_temp.u('d'), 'task_reminder', jsonb_build_object('leadMinutes', 0, 'anchorAt', now()), 'task_reminder:w6', pg_temp.g('s_today'));
insert into public.notification_outbox (notification_id, user_id, channel, scheduled_for, next_attempt_at)
select id, user_id, 'whatsapp', now(), now() from public.notifications where dedupe_key = 'task_reminder:w6';
select pg_temp.sv('w6', (select ob.id from public.notification_outbox ob join public.notifications n on n.id = ob.notification_id where n.dedupe_key = 'task_reminder:w6')::text);
-- Duda's quiet hours cover now: the summary does not wait for them.
update public.profiles set quiet_hours_start = ((now() at time zone 'America/Sao_Paulo') - interval '1 hour')::time,
  quiet_hours_end = ((now() at time zone 'America/Sao_Paulo') + interval '1 hour')::time where id = pg_temp.u('d');

insert into claims select 'push', pg_temp.claim(array['web_push']);
select is((select r from claims where k = 'push'), '{"items": [], "expired": 0, "cancelled": 0, "deferred": 0}'::jsonb,
  'a run that only sends push leaves the WhatsApp rows alone');
select is(pg_temp.st('w1'), 'pending:0:-', 'they wait');
select throws_ok($$select pg_temp.claim(array[]::text[])$$, '22023', 'invalid_argument', 'no channel is refused');
select throws_ok($$select pg_temp.claim(array['sms'])$$, '22023', 'invalid_argument', 'so is an unknown one');

-- Fred's second row waits for the last case.
update public.notification_outbox set next_attempt_at = now() + interval '1 hour' where id = pg_temp.g('w5');
insert into claims select 'wa', pg_temp.claim(array['whatsapp']);
select is((select r - 'items' from claims where k = 'wa'), '{"expired": 1, "cancelled": 2, "deferred": 0}'::jsonb,
  'the claim counts what it settled');
select is(pg_temp.st('w1'), 'sending:1:-', 'a summary inside catchUpMinutes goes, quiet hours or not');
select is(pg_temp.st('w2'), 'expired:0:expired', 'past catchUpMinutes it expires, long before maxDelayHours');
select is(pg_temp.st('w4'), 'cancelled:0:whatsapp_not_ready', 'an opt-out between writing and sending cancels');
select is(pg_temp.st('w6'), 'cancelled:0:whatsapp_type_not_allowed', 'a type outside whatsappTypes is cancelled');
select is(pg_temp.st('w3'), 'sending:1:-', 'with skip_empty off, an empty day still goes');
select is(pg_temp.item('wa', 'w1') -> 'phone', '"+5511999990001"'::jsonb, 'a WhatsApp item has the phone');
select is(pg_temp.item('wa', 'w1') -> 'summary', pg_temp.src(), 'and the source, read at send time');
select is(pg_temp.item('wa', 'w1') - 'subscriptions' - 'outboxId' - 'notificationId' - 'scheduledFor' - 'summary' - 'data',
  '{"channel": "whatsapp", "type": "daily_summary", "occurrenceId": null, "locale": "pt-BR", "timezone": "America/Sao_Paulo",
    "taskTitle": null, "requiresPhotoProof": false, "overdueAt": null, "occurrenceStatus": null, "attempts": 1, "phone": "+5511999990001"}'::jsonb,
  'with no occurrence, no title and no deadline');
select is(pg_temp.item('wa', 'w3') ->> 'timezone', 'America/Sao_Paulo', 'a zone the app cannot read falls back to the default');
select is(pg_temp.item('wa', 'w3') -> 'summary' -> 'totals', '{"today": 0, "overdue": 0, "deadlines": 0}'::jsonb, 'and the empty source goes as it is');

-- Fred came back, and has nothing to do that day.
select pg_temp.ready(pg_temp.u('f'), '+5511988887777');
update public.notification_outbox set next_attempt_at = now() where id = pg_temp.g('w5');
insert into claims select 'empty', pg_temp.claim(array['whatsapp']);
select is(pg_temp.st('w5'), 'cancelled:0:summary_empty', 'with skip_empty on and nothing to tell at send time, it is cancelled');

-- ===== The report =====
select pg_temp.service();
select is(public.report_notification_results(jsonb_build_array(
  jsonb_build_object('outboxId', pg_temp.g('w1'), 'status', 'sent',
    'whatsapp', jsonb_build_object('providerMessageId', 'console.w1', 'waId', null, 'template', 'daily_summary_v1')),
  jsonb_build_object('outboxId', pg_temp.g('w3'), 'status', 'sent',
    'whatsapp', jsonb_build_object('providerMessageId', 'wamid.w3', 'waId', '+55 bad', 'template', 'Bad Name', 'provider', 'meta'))
)), 2, 'the report takes the two sent rows');
select pg_temp.pg();
select is((select string_agg(concat_ws(':', provider_message_id, user_id = pg_temp.u('d') or user_id = pg_temp.u('e'),
    outbox_id is not null, purpose, coalesce(template, '-'), provider, coalesce(recipient_wa_id, '-'), status), ',' order by provider_message_id)
  from public.whatsapp_messages where provider_message_id in ('console.w1', 'wamid.w3')),
  'console.w1:t:t:notification:daily_summary_v1:console:-:accepted,wamid.w3:t:t:notification:-:meta:-:accepted',
  'each one gets its delivery line; what does not fit is stored as null instead of failing the report');
select is(pg_temp.st('w1'), 'sent:1:-', 'and the outbox row is sent');

-- ===== The summary job =====
-- Each profile lives in a zone where the local hour is between 03:00 and 21:00 now, so every window below
-- stays inside one local day. Of UTC, Shanghai and Honolulu, at least two always are.
create function pg_temp.zone(p_k int) returns text language sql as $$
  select z from unnest(array['UTC', 'Asia/Shanghai', 'Pacific/Honolulu']) with ordinality x (z, n)
  where extract(hour from now() at time zone z) between 3 and 20
  order by n offset p_k - 1 limit 1;
$$;
-- p_minutes before the local now of the profile's zone.
create function pg_temp.job_profile(p text, p_zone int, p_minutes int) returns void language sql as $$
  select pg_temp.ready(pg_temp.u(p), '+55119' || lpad(('x' || lpad(p, 8, '0'))::bit(32)::int::text, 8, '0'));
  update public.profiles set timezone = pg_temp.zone(p_zone),
    daily_summary_time = ((now() at time zone pg_temp.zone(p_zone)) - make_interval(mins => p_minutes))::time
  where id = pg_temp.u(p);
$$;
-- The job looks at every ready profile: the ones above are out of this section.
update public.profiles set daily_summary_enabled = false;
update public.profiles set daily_summary_enabled = true where id::text like '00000000-0000-0000-0000-0000000001%';
select pg_temp.job_profile('101', 1, 10);
select pg_temp.job_profile('102', 2, 10);
select pg_temp.job_profile('103', 1, 120);
select pg_temp.job_profile('104', 1, -10);
select pg_temp.job_profile('105', 1, 119);
select pg_temp.job_profile('106', 1, 10);
select pg_temp.job_profile('107', 1, 10);
select pg_temp.job_profile('108', 1, 10);
select pg_temp.job_profile('109', 1, 10);
select pg_temp.job_profile('10a', 1, 10);
update public.profiles set whatsapp_opt_out_at = now(), whatsapp_opt_out_source = 'app' where id = pg_temp.u('106');
update public.profiles set daily_summary_enabled = false where id = pg_temp.u('107');
update public.profiles set daily_summary_skip_empty = false where id = pg_temp.u('109');
update public.profiles set daily_summary_last_date = (now() at time zone pg_temp.zone(1))::date where id = pg_temp.u('10a');
-- Something to tell for 101, 102, 105 and 108; nothing for 109 and 10a.
select pg_temp.mk('Job task', pg_temp.u(k), now() + interval '1 day', 'deadline', ('2000000' || lpad(k, 1, '0') || '-0000-0000-0000-' || lpad(k, 12, '0'))::uuid)
from unnest(array['101', '102', '105', '108']) k;
-- 108 has a task, but no WhatsApp at all.
update public.profiles set phone_e164 = null, phone_verified_at = null, whatsapp_opt_in_at = null, whatsapp_opt_in_version = null
where id = pg_temp.u('108');

select is(public.enqueue_daily_summaries(), 4, 'the job writes the summaries due');
select is((select string_agg(right(user_id::text, 3) || '=' || (data ->> 'localDate'), ',' order by user_id)
  from public.notifications where type = 'daily_summary' and user_id::text like '%0000000001%'),
  '101=' || (now() at time zone pg_temp.zone(1))::date || ',102=' || (now() at time zone pg_temp.zone(2))::date
  || ',105=' || (now() at time zone pg_temp.zone(1))::date || ',109=' || (now() at time zone pg_temp.zone(1))::date,
  'each at its own local date: inside the window, in two zones, and an empty day with skip_empty off');
select is((select string_agg(right(id::text, 3) || '=' || coalesce(daily_summary_last_date::text, '-'), ',' order by id)
  from public.profiles where id::text like '%0000000001%' and id <> pg_temp.u('10a')),
  '101=' || (now() at time zone pg_temp.zone(1))::date || ',102=' || (now() at time zone pg_temp.zone(2))::date
  || ',103=-,104=-,105=' || (now() at time zone pg_temp.zone(1))::date || ',106=-,107=-,108=-,109=' || (now() at time zone pg_temp.zone(1))::date,
  'past catchUpMinutes, before the time, opted out, off and without WhatsApp are left alone');
select is((select scheduled_for from public.notification_outbox ob join public.notifications n on n.id = ob.notification_id
  where n.type = 'daily_summary' and n.user_id = pg_temp.u('101')),
  ((now() at time zone pg_temp.zone(1))::date + (select daily_summary_time from public.profiles where id = pg_temp.u('101'))) at time zone pg_temp.zone(1),
  'the outbox row is due at the chosen local time');
update public.profiles set daily_summary_skip_empty = true where id = pg_temp.u('109');
update public.profiles set daily_summary_last_date = null where id = pg_temp.u('10a');
select is(public.enqueue_daily_summaries(), 0, 'an empty day with skip_empty writes nothing');
select is((select daily_summary_last_date from public.profiles where id = pg_temp.u('10a')), (now() at time zone pg_temp.zone(1))::date,
  'but the day is marked, so it is not looked at again');
update public.profiles set daily_summary_last_date = null where id = pg_temp.u('101');
select is(public.enqueue_daily_summaries(), 0, 'running again writes nothing: the key holds even when the date is lost');
select is((select count(*) from public.notifications where type = 'daily_summary' and user_id::text like '%0000000001%'), 4::bigint,
  'and nothing is duplicated');

-- ===== Retention =====
insert into public.phone_verifications (user_id, phone_e164, code_hash, expires_at, created_at)
select pg_temp.u('e'), '+5511999990005', repeat('0', 64), now(), now() - h from unnest(array[interval '49 hours', interval '47 hours']) h;
insert into public.whatsapp_messages (user_id, purpose, provider, provider_message_id, created_at) values
  (pg_temp.u('e'), 'phone_code', 'console', 'console.old', now() - interval '31 days'),
  (pg_temp.u('e'), 'phone_code', 'console', 'console.new', now() - interval '29 days');
insert into public.whatsapp_console_messages (to_e164, message, created_at) values
  ('+5511999990005', '{"kind": "code"}', now() - interval '25 hours'),
  ('+5511999990005', '{"kind": "code"}', now() - interval '23 hours');
select public.delete_expired_notifications();
select is((select count(*) from public.phone_verifications where created_at < now() - interval '48 hours'), 0::bigint, 'codes leave after retentionHours');
select is((select count(*) from public.phone_verifications where created_at = now() - interval '47 hours'), 1::bigint, 'not before');
select is((select string_agg(provider_message_id, ',') from public.whatsapp_messages where provider_message_id in ('console.old', 'console.new')), 'console.new',
  'delivery lines leave after messageRetentionDays');
select is((select count(*) from public.whatsapp_console_messages where to_e164 = '+5511999990005'), 1::bigint, 'the console outbox after consoleRetentionDays');

select * from finish();
rollback;
