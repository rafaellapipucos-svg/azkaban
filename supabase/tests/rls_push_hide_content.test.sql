-- BL-32 (ADR-0008, section 16 item 8). Hide the push content on the lock screen: off by default, the
-- owner's alone, and handed to the dispatcher by the claim. Assume a hostile client calling the REST API.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000008a1', 'hc-ana@test.local', '{"display_name": "Ana"}'),
  ('00000000-0000-0000-0000-0000000008b1', 'hc-bia@test.local', '{"display_name": "Bia"}');

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
  select ('00000000-0000-0000-0000-0000000008' || p || '1')::uuid;
$$;

create function pg_temp.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function pg_temp.hidden(p_user uuid) returns boolean language sql security definer as $$
  select push_hide_content from public.profiles where id = p_user;
$$;

-- ===== Grants =====
select is(has_column_privilege('authenticated', 'public.profiles', 'push_hide_content', 'update'), true,
  'authenticated may update the flag');
select is(has_column_privilege('anon', 'public.profiles', 'push_hide_content', 'select'), false, 'anon does not read it');
select is(has_column_privilege('anon', 'public.profiles', 'push_hide_content', 'update'), false, 'nor writes it');

-- ===== Off by default =====
select is(pg_temp.hidden(pg_temp.u('a')), false, 'a new profile shows the content');

-- ===== The owner's alone =====
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.rows($$update public.profiles set push_hide_content = true where id = auth.uid()$$), 1::bigint,
  'Ana turns it on');
select is((select push_hide_content from public.profiles where id = auth.uid()), true, 'and reads it back');
select pg_temp.login(pg_temp.u('b'));
select is((select count(*) from public.profiles where id = pg_temp.u('a')), 0::bigint, 'Bia does not read Ana''s');
select is(pg_temp.rows(format($$update public.profiles set push_hide_content = false where id = %L$$, pg_temp.u('a'))),
  0::bigint, 'nor changes it');
select pg_temp.pg();
select is(pg_temp.hidden(pg_temp.u('a')), true, 'Ana''s stays on');
select is(pg_temp.hidden(pg_temp.u('b')), false, 'and Bia''s off');
set local role anon;
select throws_ok($$update public.profiles set push_hide_content = false$$, '42501', 'permission denied for table profiles',
  'anon changes nobody''s');
reset role;

-- ===== The claim hands it to the dispatcher =====
-- One private reminder each, with a browser each, outside quiet hours.
update public.profiles set quiet_hours_start = null, quiet_hours_end = null where id in (pg_temp.u('a'), pg_temp.u('b'));
insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by)
select ('20000000-0000-0000-0000-0000000008' || p || '1')::uuid, (select id from public.areas where key = 'home'), null,
  pg_temp.u(p), 'Casa', 'teal', 'x', pg_temp.u(p)
from unnest(array['a', 'b']) p;
insert into public.tasks (
  context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone, reminders,
  requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility
)
select ('20000000-0000-0000-0000-0000000008' || p || '1')::uuid, pg_temp.u(p), pg_temp.u(p), 'Consulta secreta',
  'timed', now() + interval '2 hours', 60, 'America/Sao_Paulo', '[]', false, false, false, 'medium', 'normal', 'private'
from unnest(array['a', 'b']) p;
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
select pg_temp.u(p), 'https://fcm.googleapis.com/fcm/send/hc' || p, repeat('A', 87), repeat('B', 22)
from unnest(array['a', 'b']) p;
insert into public.notifications (id, user_id, type, occurrence_id, data, dedupe_key)
select ('30000000-0000-0000-0000-0000000008' || p || '1')::uuid, pg_temp.u(p), 'task_reminder', o.id,
  jsonb_build_object('leadMinutes', 30, 'anchorAt', o.scheduled_start), 'hc:test'
from unnest(array['a', 'b']) p
join public.task_occurrences o on o.assignee_id = pg_temp.u(p);
insert into public.notification_outbox (id, notification_id, user_id, channel, scheduled_for, next_attempt_at)
select ('31000000-0000-0000-0000-0000000008' || p || '1')::uuid, ('30000000-0000-0000-0000-0000000008' || p || '1')::uuid,
  pg_temp.u(p), 'web_push', now(), now()
from unnest(array['a', 'b']) p;

create temp table claim_hc as
select i from jsonb_array_elements(public.claim_notification_batch(1000, 60, 24) -> 'items') i
where i ->> 'outboxId' like '31000000-0000-0000-0000-0000000008%';
create function pg_temp.item(p text) returns jsonb language sql as $$
  select i from claim_hc where i ->> 'outboxId' = '31000000-0000-0000-0000-0000000008' || p || '1';
$$;

select is((select count(*) from claim_hc), 2::bigint, 'both reminders are claimed');
select is(pg_temp.item('a') -> 'hideContent', 'true'::jsonb, 'Ana''s item says to hide the content');
select is(pg_temp.item('a') -> 'taskTitle', 'null'::jsonb, 'and carries no task title');
select is(pg_temp.item('a') -> 'data' ->> 'leadMinutes', '30', 'but keeps the data for the link');
select isnt(pg_temp.item('a') ->> 'occurrenceId', null, 'and the occurrence');
select is(jsonb_array_length(pg_temp.item('a') -> 'subscriptions'), 1, 'and her browser');
select is(pg_temp.item('b') -> 'hideContent', 'false'::jsonb, 'Bia''s item shows the content');
select is(pg_temp.item('b') ->> 'taskTitle', 'Consulta secreta', 'with the task title');

select * from finish();
rollback;
