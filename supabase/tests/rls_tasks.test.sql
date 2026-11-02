begin;
create extension if not exists pgtap with schema extensions;
select plan(369);

-- Alice owns Casa A, Bea owns Casa B, Caio is admin of A, Duda is a member of A and B,
-- Fred is a member of A, Eva is outside.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bea@test.local', '{"display_name": "Bea"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@test.local', '{"display_name": "Caio"}'),
  ('00000000-0000-0000-0000-00000000000d', 'duda@test.local', '{"display_name": "Duda"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@test.local', '{"display_name": "Eva"}'),
  ('00000000-0000-0000-0000-00000000000f', 'fred@test.local', '{"display_name": "Fred"}');

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa A', 'family', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 'Casa B', 'family', '00000000-0000-0000-0000-00000000000b');

insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'admin'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'member'),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', 'member'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', 'member');

insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa A', 'teal', 'x', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000b', null, 'Casa B', 'teal', 'x', '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000d', (select id from public.areas where key = 'work'),
    null, '00000000-0000-0000-0000-00000000000d', 'Freela', 'violet', 'x', '00000000-0000-0000-0000-00000000000d');

create function pg_temp.login(id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- A job or an Edge Function: service role, no user.
create function pg_temp.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- Back to postgres, with no user: RESET ROLE alone would leave the last login's claims behind.
create function pg_temp.pg() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

-- Inserts a one-off task as whoever is logged in; the occurrence comes from the trigger.
create function pg_temp.ins(
  p_ctx uuid,
  p_assignee uuid,
  p_vis public.task_visibility default 'group',
  p_type public.schedule_type default 'timed',
  p_start timestamptz default now() + interval '5 days',
  p_due timestamptz default null,
  p_tz text default 'America/Sao_Paulo',
  p_reminders jsonb default '[]',
  p_title text default 'Inserted',
  p_rrule text default null
) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into public.tasks (
    context_id, assignee_id, title, schedule_type, start_at, due_at, duration_min, timezone, reminders, rrule,
    requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility
  ) values (
    p_ctx, p_assignee, p_title, p_type, p_start, p_due, null, p_tz, p_reminders, p_rrule,
    false, false, true, 'easy', 'normal', p_vis
  ) returning id into new_id;
  return new_id;
end;
$$;

-- Setup helpers, run as postgres.
create function pg_temp.mk(
  p_title text, p_ctx uuid, p_creator uuid, p_assignee uuid, p_vis public.task_visibility,
  p_start timestamptz, p_diff public.task_difficulty default 'easy', p_partial boolean default true,
  p_rrule text default null, p_parent uuid default null
) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone, rrule,
    reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty,
    priority, visibility, parent_task_id
  ) values (
    p_ctx, p_creator, p_assignee, p_title, 'timed', p_start, 60, 'America/Sao_Paulo', p_rrule,
    '[]', false, false, p_partial, p_diff, 'normal', p_vis, p_parent
  ) returning id into new_id;
  return new_id;
end;
$$;

-- Occurrence of a recurring task, which the Edge Function would insert.
create function pg_temp.mk_occ(p_title text, p_start timestamptz) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due)
  select t.id, t.assignee_id, p_start, p_start + interval '1 hour' from public.tasks t where t.title = p_title
  returning id into new_id;
  return new_id;
end;
$$;

-- The n-th occurrence (by start) of the task with this title, whatever the caller can see.
create function pg_temp.occ(p_title text, p_nth int default 1) returns uuid language sql security definer as $$
  select o.id from public.task_occurrences o join public.tasks t on t.id = o.task_id
  where t.title = p_title order by o.scheduled_start offset p_nth - 1 limit 1;
$$;

create function pg_temp.tid(p_title text) returns uuid language sql security definer as $$
  select id from public.tasks where title = p_title;
$$;

create function pg_temp.xp(p_occ uuid) returns bigint language sql security definer as $$
  select coalesce(sum(amount), 0) from public.xp_events where occurrence_id = p_occ;
$$;

create function pg_temp.xp_user(p_occ uuid) returns uuid language sql security definer as $$
  select distinct user_id from public.xp_events where occurrence_id = p_occ;
$$;

create function pg_temp.xp_count(p_occ uuid) returns bigint language sql security definer as $$
  select count(*) from public.xp_events where occurrence_id = p_occ;
$$;

create function pg_temp.hist(p_occ uuid) returns bigint language sql security definer as $$
  select count(*) from public.task_status_history where occurrence_id = p_occ;
$$;

create function pg_temp.status_of(p_occ uuid) returns text language sql security definer as $$
  select status::text from public.task_occurrences where id = p_occ;
$$;

-- The whole edit form (TaskInput without recurrence), with overrides.
create function pg_temp.form(p_start timestamptz, p_over jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Edited', 'notes', null,
    'contextId', '20000000-0000-0000-0000-00000000000a',
    'assigneeId', '00000000-0000-0000-0000-00000000000d',
    'scheduleType', 'timed', 'startAt', p_start, 'dueAt', null, 'durationMin', 60,
    'timezone', 'America/Sao_Paulo', 'reminders', '[]'::jsonb,
    'requiresPhotoProof', false, 'requiresAdminApproval', false, 'requiresPartialReason', true,
    'difficulty', 'easy', 'priority', 'normal', 'visibility', 'group'
  ) || p_over;
$$;

-- Fixture: A1 is the admin's task for Duda, A2 Duda's private one in Casa A, A3 Fred's, A4 Caio's private.
select pg_temp.mk('A1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('A2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'private', now() + interval '2 days');
select pg_temp.mk('A3', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f', 'group', now() + interval '2 days');
select pg_temp.mk('A4', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'private', now() + interval '2 days');
select pg_temp.mk('B1', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('B2', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'group', now() + interval '2 days');
select pg_temp.mk('P1', '20000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'private', now() + interval '2 days');

-- Seeded rules and the one-off trigger
select is((select count(*) from public.occurrence_transitions), 23::bigint, 'all 23 transitions are seeded');
select is((select (value -> 'xp' -> 'status' ->> 'done')::int from public.app_settings where key = 'task_rules'), 10, 'task_rules are seeded');
select is((select group_id from public.tasks where title = 'B1'), '10000000-0000-0000-0000-00000000000b'::uuid, 'the trigger copies group_id from the context');
select is((select group_id from public.tasks where title = 'P1'), null, 'a personal task has no group');
select is((select count(*) from public.task_occurrences where task_id = pg_temp.tid('A1')), 1::bigint, 'a one-off task gets exactly one occurrence');
select is(
  (select status::text || ':' || late::text from public.task_occurrences where task_id = pg_temp.tid('A1')),
  'pending:false', 'the occurrence starts pending and on time');

-- Visibility
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select string_agg(title, ',' order by title) from public.tasks), 'A1,A2,B1,P1', 'member sees what is theirs, in both groups');
select is((select count(*) from public.tasks where title = 'A3'), 0::bigint, 'member cannot see a colleague''s group task without task.view_group');
select is((select count(*) from public.task_occurrences where task_id = pg_temp.tid('A3')), 0::bigint, 'nor its occurrences');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select is((select string_agg(title, ',' order by title) from public.tasks), 'A3', 'another member sees only their own task');
select is((select count(*) from public.tasks where title = 'A2'), 0::bigint, 'member cannot see another member''s private task');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select string_agg(title, ',' order by title) from public.tasks), 'A1,A3,A4', 'admin sees group tasks and their own private one, nothing else');
select is((select count(*) from public.tasks where title in ('B1', 'B2')), 0::bigint, 'admin of A sees nothing of group B, even for a shared member');
select is((select count(*) from public.tasks where title = 'P1'), 0::bigint, 'admin never sees a member''s personal task');
select is((select count(*) from public.task_occurrences), 3::bigint, 'occurrences follow the same rule');
select is((select count(*) from public.task_occurrences where task_id = pg_temp.tid('A2')), 0::bigint, 'admin sees no occurrence of a private task');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select string_agg(title, ',' order by title) from public.tasks), 'A1,A3', 'owner sees group tasks, not private ones');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select string_agg(title, ',' order by title) from public.tasks), 'B1,B2', 'owner of B sees B and nothing of A');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select count(*) from public.tasks), 0::bigint, 'an outsider sees no task');

-- Anonymous and direct writes
select pg_temp.pg();
set local role anon;
select throws_ok($$select * from public.tasks$$, '42501', 'permission denied for table tasks', 'anon cannot read tasks');
select pg_temp.pg();

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due) values (pg_temp.tid('A1'), auth.uid(), now(), now())$$, '42501', 'permission denied for table task_occurrences', 'client cannot insert occurrences');
select throws_ok($$update public.task_occurrences set status = 'done' where id = pg_temp.occ('A1')$$, '42501', 'permission denied for table task_occurrences', 'client cannot update a status directly');
select throws_ok($$delete from public.task_occurrences where id = pg_temp.occ('A1')$$, '42501', 'permission denied for table task_occurrences', 'client cannot delete occurrences');
select throws_ok($$insert into public.task_status_history (occurrence_id, from_status, to_status) values (pg_temp.occ('A1'), 'pending', 'done')$$, '42501', 'permission denied for table task_status_history', 'client cannot write history');
select throws_ok($$update public.task_status_history set reason = 'x'$$, '42501', 'permission denied for table task_status_history', 'client cannot edit history');
select throws_ok($$insert into public.xp_events (user_id, amount, reason) values (auth.uid(), 999, 'occurrence_done')$$, '42501', 'permission denied for table xp_events', 'client cannot write XP');
select throws_ok($$delete from public.xp_events$$, '42501', 'permission denied for table xp_events', 'client cannot delete XP');
select throws_ok($$update public.tasks set title = 'x' where title = 'A2'$$, '42501', 'permission denied for table tasks', 'client cannot update a task');
select throws_ok($$delete from public.tasks where title = 'A2'$$, '42501', 'permission denied for table tasks', 'client cannot delete a task');
select throws_ok($$insert into public.tasks (context_id, assignee_id, group_id, title, schedule_type, start_at, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility) values ('20000000-0000-0000-0000-00000000000d', auth.uid(), '10000000-0000-0000-0000-00000000000b', 'x', 'timed', now(), 'UTC', '[]', false, false, false, 'easy', 'normal', 'private')$$, '42501', 'permission denied for table tasks', 'client cannot set group_id');
select throws_ok($$update public.app_settings set value = '{}'$$, '42501', 'permission denied for table app_settings', 'client cannot change the rules');
select throws_ok($$insert into public.occurrence_transitions values ('done', 'partial', 'assignee')$$, '42501', 'permission denied for table occurrence_transitions', 'client cannot change the transitions');
select is((select count(*) from public.occurrence_transitions), 23::bigint, 'but every user can read the transitions');

-- Creating tasks as a client (each rejection is paired with the allowed path)
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000d', auth.uid(), 'private')$$, 'member creates a personal task, RETURNING included');
select is((select count(*) from public.task_occurrences o join public.tasks t on t.id = o.task_id where t.title = 'Inserted' and t.group_id is null), 1::bigint, 'and gets its single occurrence');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid())$$, 'member creates a group task for themselves');
select is((select group_id from public.tasks where title = 'Inserted' and context_id = '20000000-0000-0000-0000-00000000000a'), '10000000-0000-0000-0000-00000000000a'::uuid, 'group_id comes from the context');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f')$$, '42501', 'forbidden', 'member cannot create a task for someone else');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000d', auth.uid(), 'group')$$, '23514', 'personal_context_requires_private_self', 'a personal context takes only private tasks');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000b', auth.uid(), 'private', 'timed', now(), null, 'Mars/Base')$$, '22023', 'invalid_timezone', 'an unknown time zone is rejected');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'deadline', null, null)$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_schedule_check"', 'a deadline needs a due date');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'UTC', '[1, -5]')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_reminders_check"', 'reminders must be non-negative');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'UTC', '[30, 0]')$$, 'valid reminders are accepted');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid())$$, '42501', 'forbidden', 'an outsider cannot create a task in a group');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000d', auth.uid(), 'private')$$, '23514', 'personal_context_requires_private_self', 'nor in someone else''s personal context');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d')$$, 'admin creates a task for a member');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e')$$, '22023', 'assignee_not_member', 'but not for someone outside the group');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', 'private')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_private_assignee_check"', 'a private task cannot be assigned to someone else');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000d', auth.uid(), 'private')$$, '23514', 'personal_context_requires_private_self', 'admin cannot write into a member''s personal context');

-- Occurrence window and overdue_at, from the rules (postgres inserts so the zone is explicit)
select pg_temp.pg();
select pg_temp.mk('OV timed', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2026-12-10 15:00-03');
insert into public.tasks (context_id, created_by, assignee_id, title, schedule_type, start_at, due_at, duration_min, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'OV allday', 'all_day', '2026-12-10 00:00-03', null, null, 'America/Sao_Paulo', '[]', false, false, true, 'easy', 'normal', 'group'),
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'OV deadline', 'deadline', null, '2026-12-10 18:00-03', null, 'America/Sao_Paulo', '[]', false, false, true, 'easy', 'normal', 'group'),
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'OV midnight', 'timed', '2026-12-10 00:00-03', null, null, 'America/Sao_Paulo', '[]', false, false, true, 'easy', 'normal', 'group'),
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'OV newyork', 'timed', '2026-12-10 22:00-05', null, 60, 'America/New_York', '[]', false, false, true, 'easy', 'normal', 'group');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV timed')), '2026-12-11 00:00-03'::timestamptz, 'timed: overdue at the end of its local day');
select is((select scheduled_due from public.task_occurrences where task_id = pg_temp.tid('OV timed')), '2026-12-10 16:00-03'::timestamptz, 'timed: the end is start plus duration');
select is((select scheduled_due from public.task_occurrences where task_id = pg_temp.tid('OV allday')), '2026-12-11 00:00-03'::timestamptz, 'all_day: ends at the next local midnight');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV allday')), '2026-12-11 00:00-03'::timestamptz, 'all_day: overdue at the end of its own day, not one day later');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV deadline')), '2026-12-10 18:00-03'::timestamptz, 'deadline: overdue at the due moment');
select is((select scheduled_start from public.task_occurrences where task_id = pg_temp.tid('OV deadline')), '2026-12-10 18:00-03'::timestamptz, 'deadline without a start: scheduled_start is the due moment');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV midnight')), '2026-12-11 00:00-03'::timestamptz, 'a task at midnight with no duration stays in its own day');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV newyork')), '2026-12-11 00:00-05'::timestamptz, 'the day is local to the task''s own time zone');

update public.app_settings set value = jsonb_set(value, '{autoMiss,timed,toleranceMinutes}', '30') where key = 'task_rules';
select pg_temp.mk('OV tolerance', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2026-12-10 15:00-03');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV tolerance')), '2026-12-11 00:30-03'::timestamptz, 'the tolerance comes from app_settings');
update public.app_settings set value = jsonb_set(value, '{autoMiss,timed,toleranceMinutes}', '0') where key = 'task_rules';

-- One-off schedule follows the task; recurring tasks and split tasks get no occurrence from the trigger
select pg_temp.mk('REC', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '3 days', 'easy', true, 'FREQ=DAILY');
select is((select count(*) from public.task_occurrences where task_id = pg_temp.tid('REC')), 0::bigint, 'a recurring task waits for the materialization');
select pg_temp.mk('SPLIT', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '3 days', 'easy', true, null, pg_temp.tid('REC'));
select is((select count(*) from public.task_occurrences where task_id = pg_temp.tid('SPLIT')), 0::bigint, 'a task born with parent_task_id reuses an occurrence instead');
update public.tasks set start_at = '2026-12-20 09:00-03' where title = 'OV timed';
select is((select scheduled_start from public.task_occurrences where task_id = pg_temp.tid('OV timed')), '2026-12-20 09:00-03'::timestamptz, 'rescheduling a one-off task moves its pending occurrence');
select is((select overdue_at from public.task_occurrences where task_id = pg_temp.tid('OV timed')), '2026-12-21 00:00-03'::timestamptz, 'and recomputes overdue_at');

-- Context and assignee integrity
select throws_ok($$update public.tasks set context_id = '20000000-0000-0000-0000-00000000000b' where title = 'A1'$$, '23514', 'context_change_not_allowed', 'a task cannot move to a context of another group');
select throws_ok($$update public.tasks set context_id = '20000000-0000-0000-0000-00000000000d' where title = 'A1'$$, '23514', 'context_change_not_allowed', 'nor to a personal one');
insert into public.contexts (id, area_id, group_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-0000000000a2', (select id from public.areas where key = 'work'),
    '10000000-0000-0000-0000-00000000000a', 'Cozinha', 'teal', 'x', '00000000-0000-0000-0000-00000000000a');
select lives_ok($$update public.tasks set context_id = '20000000-0000-0000-0000-0000000000a2' where title = 'A1'$$, 'but it can move within the same group');
update public.tasks set context_id = '20000000-0000-0000-0000-00000000000a' where title = 'A1';

-- Transitions through the RPC; Duda is the assignee of the admin's tasks
select pg_temp.mk('X1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('XH', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days', 'hard');
select pg_temp.mk('XM', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days', 'medium');
select pg_temp.mk('XN', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days', 'easy', false);

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('X1'), 'done', 'pending', null)), 'done', 'assignee completes their task');
select is((select late from public.task_occurrences where id = pg_temp.occ('X1')), false, 'on time is not late');
select is((select status_changed_by from public.task_occurrences where id = pg_temp.occ('X1')), '00000000-0000-0000-0000-00000000000d'::uuid, 'who changed it is recorded');
select is((select count(*) from public.task_status_history where occurrence_id = pg_temp.occ('X1') and from_status = 'pending' and to_status = 'done' and changed_by = auth.uid()), 1::bigint, 'the trigger wrote the history');
select is((select amount from public.xp_events where occurrence_id = pg_temp.occ('X1')), 10, 'done gives 10 XP at easy');
select is((select group_id from public.xp_events where occurrence_id = pg_temp.occ('X1')), '10000000-0000-0000-0000-00000000000a'::uuid, 'a group task writes its group in xp_events');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('X1'), 'pending', 'pending', null)$$, 'P0001', 'status_conflict', 'a stale expectedStatus is rejected');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('X1'), 'partial', 'done', 'x')$$, '42501', 'forbidden', 'done cannot go straight to partial: that pair is the reviewer''s, and the reviewer is not an actor here');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('X1'), 'pending', 'done', null)), 'pending', 'the assignee can reopen');
select is((select pg_temp.xp(pg_temp.occ('X1'))), 0::bigint, 'reopening compensates the XP');
select is((select reason from public.xp_events where occurrence_id = pg_temp.occ('X1') and amount < 0), 'occurrence_reverted', 'with a reverted event');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('X1'), 'done', 'pending', null)$$, 'completing again works');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('X1'), 'pending', 'done', null)$$, 'and so does reopening');
select is((select pg_temp.xp(pg_temp.occ('X1'))), 0::bigint, 'a complete-reopen cycle twice still sums to zero');
select is((select pg_temp.xp_count(pg_temp.occ('X1'))), 4::bigint, 'with four immutable events');
select is((select pg_temp.hist(pg_temp.occ('X1'))), 4::bigint, 'and four history rows');

select throws_ok($$select public.set_occurrence_status(pg_temp.occ('X1'), 'cancelled', 'pending', null)$$, '42501', 'forbidden', 'a member cannot cancel a task the admin gave them');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('A3'), 'done', 'pending', null)$$, '42501', 'forbidden', 'a task one cannot see answers forbidden, like a missing one');
select throws_ok($$select public.set_occurrence_status('99999999-9999-9999-9999-999999999999', 'done', 'pending', null)$$, '42501', 'forbidden', 'a missing occurrence answers the same');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('A2'), 'done', 'missed', null)$$, 'P0001', 'status_conflict', 'the conflict is reported before anything else');

select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XH'), 'done', 'pending', null)$$, 'a hard task is completed');
select is((select amount from public.xp_events where occurrence_id = pg_temp.occ('XH')), 30, 'hard weighs three times');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XM'), 'partial', 'pending', 'ran out of time')$$, 'partial with a reason');
select is((select amount from public.xp_events where occurrence_id = pg_temp.occ('XM')), 6, 'partial at medium gives 3 x 2');
select is((select status_reason from public.task_occurrences where id = pg_temp.occ('XM')), 'ran out of time', 'the reason is stored');
select is((select reason from public.task_status_history where occurrence_id = pg_temp.occ('XM')), 'ran out of time', 'and in the history');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XM'), 'pending', 'partial', null)$$, 'partial can be reopened');
select is((select status_reason from public.task_occurrences where id = pg_temp.occ('XM')), null, 'reopening clears the reason');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('XM'), 'partial', 'pending', null)$$, '22023', 'reason_required', 'partial needs a reason when the task asks for it');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('XM'), 'partial', 'pending', '   ')$$, '22023', 'reason_required', 'a blank reason does not count');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XN'), 'partial', 'pending', null)$$, 'partial without a reason works when the task does not ask for one');
select is((select amount from public.xp_events where occurrence_id = pg_temp.occ('XN')), 3, 'and gives the partial XP');

select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('A3'), 'done', 'pending', null)$$, 'another member earns XP too');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.xp_events where user_id <> auth.uid()), 0::bigint, 'a member does not read colleagues'' XP');
select cmp_ok((select count(*) from public.xp_events where user_id = auth.uid()), '>', 0::bigint, 'but reads their own');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.xp_events), 0::bigint, 'the admin does not read the members'' XP');

-- The admin: editor rights on group tasks, deleter rights, and the other side of the member limits
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('A2'), 'done', 'pending', null)$$, '42501', 'forbidden', 'admin cannot act on a member''s private task');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('XN'), 'pending', 'pending', null)$$, 'P0001', 'status_conflict', 'conflict also holds for admins');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XN'), 'pending', 'partial', null)$$, 'admin reopens a task they do not own, as editor');
select is((select pg_temp.xp(pg_temp.occ('XN'))), 0::bigint, 'compensating the assignee''s XP');
select is((select pg_temp.xp_user(pg_temp.occ('XN'))), '00000000-0000-0000-0000-00000000000d'::uuid, 'XP always belongs to the assignee');

-- Missed, cancelled and who can reopen them
select pg_temp.pg();
select pg_temp.mk('M1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('C1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('O1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('M1'), 'missed', 'pending', 'forgot')$$, 'the assignee can mark missed');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('M1'), 'pending', 'missed', null)$$, '42501', 'forbidden', 'but cannot reopen missed');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('M1'), 'done', 'missed', null)), 'done', 'missed can still be completed by the assignee');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('M1'), 'pending', 'done', null)$$, 'and reopened');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('M1'), 'missed', 'pending', null)$$, 'admin marks it missed');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('M1'), 'pending', 'missed', null)), 'pending', 'and reopens missed, which the assignee cannot');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('C1'), 'cancelled', 'pending', null)), 'cancelled', 'admin cancels a group task');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('C1'), 'pending', 'cancelled', null)$$, '42501', 'forbidden', 'a member cannot bring a cancelled task back');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('C1'), 'done', 'cancelled', null)$$, '23514', 'invalid_transition', 'cancelled cannot be completed');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('O1'), 'cancelled', 'pending', null)), 'cancelled', 'a member cancels their own task');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('C1'), 'pending', 'cancelled', null)), 'pending', 'admin brings it back');

-- Invalid transitions hold for every path, service role included
select pg_temp.pg();
select pg_temp.service();
select lives_ok($$update public.task_occurrences set status = 'done' where id = pg_temp.occ('X1')$$, 'service role: a valid transition runs');
select throws_ok($$update public.task_occurrences set status = 'partial' where id = pg_temp.occ('X1')$$, '23514', 'invalid_transition', 'service role: done cannot go straight to partial');
select throws_ok($$update public.task_occurrences set status = 'missed' where id = pg_temp.occ('X1')$$, '23514', 'invalid_transition', 'service role: nor to missed');
select throws_ok($$update public.task_occurrences set status = 'done' where id = pg_temp.occ('O1')$$, '23514', 'invalid_transition', 'service role: cancelled cannot be forced to done');
select pg_temp.pg();
select is((select pg_temp.hist(pg_temp.occ('X1'))), 5::bigint, 'the job''s change got a history row');
select is((select count(*) from public.task_status_history where occurrence_id = pg_temp.occ('X1') and changed_by is null), 1::bigint, 'with no user, as a job');
select is((select pg_temp.xp(pg_temp.occ('X1'))), 10::bigint, 'and XP');
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('X1');

-- Private tasks never leak through the XP ledger
select pg_temp.pg();
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('A2'), 'done', 'pending', null)$$, 'member completes their private task in a group');
select is((select group_id from public.xp_events where occurrence_id = pg_temp.occ('A2')), null, 'its XP carries no group');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('P1'), 'done', 'pending', null)$$, 'and a personal one');
select is((select group_id from public.xp_events where occurrence_id = pg_temp.occ('P1')), null, 'same for a personal task');

-- Late completion
select pg_temp.pg();
select pg_temp.mk('L1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '2 days');
select pg_temp.mk('L2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '2 days');
select pg_temp.mk('W1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '10 days');
select pg_temp.mk('W2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '10 days');
select pg_temp.mk('W3', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '10 days');
select pg_temp.mk('W4', '20000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'private', now() - interval '10 days');
select is((select overdue_at < now() from public.task_occurrences where id = pg_temp.occ('L1')), true, 'a past task is overdue as soon as it is created, even if no job ran');
update public.task_occurrences set overdue_at = now() - interval '1 hour' where id in (pg_temp.occ('L1'), pg_temp.occ('L2'));
update public.task_occurrences set overdue_at = now() - interval '80 hours' where id in (pg_temp.occ('W1'), pg_temp.occ('W3'), pg_temp.occ('W4'));
update public.task_occurrences set overdue_at = now() - interval '71 hours' where id = pg_temp.occ('W2');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select late from public.set_occurrence_status(pg_temp.occ('L1'), 'done', 'pending', null)), true, 'done after overdue_at is late, though the status was still pending');
select is((select amount from public.xp_events where occurrence_id = pg_temp.occ('L1')), 5, 'late done gives the reduced XP');
select is((select reason from public.xp_events where occurrence_id = pg_temp.occ('L1')), 'occurrence_done_late', 'with its own reason');
select is((select late from public.set_occurrence_status(pg_temp.occ('L1'), 'pending', 'done', null)), false, 'reopening clears late');
select is((select pg_temp.xp(pg_temp.occ('L1'))), 0::bigint, 'and the late XP is compensated');
select is((select late from public.set_occurrence_status(pg_temp.occ('L2'), 'partial', 'pending', 'late but did some')), true, 'a late partial is flagged late');
select is((select amount from public.xp_events where occurrence_id = pg_temp.occ('L2')), 3, 'and keeps the partial XP');
select is((select late from public.set_occurrence_status(pg_temp.occ('W2'), 'done', 'pending', null)), true, 'inside the 72 hour window the assignee can still complete');

select throws_ok($$select public.set_occurrence_status(pg_temp.occ('W1'), 'done', 'pending', null)$$, 'P0001', 'late_window_expired', 'after the window done is refused');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('W1'), 'partial', 'pending', 'x')$$, 'P0001', 'late_window_expired', 'and so is partial');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('W1'), 'missed', 'pending', null)), 'missed', 'but the assignee can still mark it missed');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('W1'), 'done', 'missed', null)$$, 'P0001', 'late_window_expired', 'and the window also holds from missed');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('W4'), 'done', 'pending', null)$$, 'P0001', 'late_window_expired', 'a personal task has no manager to correct it, so the window applies to its owner');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select late from public.set_occurrence_status(pg_temp.occ('W1'), 'done', 'missed', null)), true, 'task.manage_group has no window, and late stays true');
select is((select pg_temp.xp(pg_temp.occ('W1')))::int, 5, 'XP is the late value');
select is((select pg_temp.xp_user(pg_temp.occ('W1'))), '00000000-0000-0000-0000-00000000000d'::uuid, 'and goes to the assignee, not the admin');
select is((select late from public.set_occurrence_status(pg_temp.occ('W3'), 'partial', 'pending', 'admin fixes the past')), true, 'the admin can also resolve a pending one past the window');

-- Edit scopes: Caio edits Duda's tasks
select pg_temp.pg();
select pg_temp.mk('R1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('R1', now() + interval '3 days');
select pg_temp.mk_occ('R1', now() + interval '4 days');
select pg_temp.mk_occ('R1', now() + interval '5 days');
select pg_temp.mk_occ('R1', now() + interval '6 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('R1', 2), 'done', 'pending', null)$$, 'a recurring occurrence is completed and reopened, so it has history and XP');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('R1', 2), 'pending', 'done', null)$$, '... reopened');
select throws_ok($$select public.edit_task(pg_temp.occ('R1', 2), 'this', pg_temp.form(now() + interval '4 days'), null, null)$$, '42501', 'forbidden', 'a member cannot edit the admin''s task');

select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok($$select public.edit_task(pg_temp.occ('R1', 2), 'all', pg_temp.form(now() + interval '4 days'), null, null)$$, '42501', 'forbidden', 'a colleague who cannot see the task gets the same answer');

select pg_temp.pg();
select set_config('t.old_start', (select scheduled_start::text from public.task_occurrences where id = pg_temp.occ('R1', 2)), true);
select set_config('t.r1_occ', pg_temp.occ('R1', 2)::text, true);
select set_config('t.r1', pg_temp.tid('R1')::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(current_setting('t.r1_occ')::uuid, 'this', pg_temp.form(now() + interval '4 days 1 hour', '{"title": "R1 exception"}'), 'FREQ=DAILY;COUNT=1', 'FREQ=DAILY;UNTIL=20300101T000000Z'),
  '{}'::uuid[], 'this: edits one occurrence and has nothing to materialize');
select pg_temp.pg();
select is((select array_length(exdates, 1) from public.tasks where id = current_setting('t.r1')::uuid), 1, 'this: the original excludes one day');
select is((select exdates[1] from public.tasks where id = current_setting('t.r1')::uuid), (current_setting('t.old_start')::timestamptz at time zone 'America/Sao_Paulo')::date, 'this: and it is the local day of the old scheduled start');
select is((select count(*) from public.task_occurrences where task_id = current_setting('t.r1')::uuid), 3::bigint, 'this: the other occurrences stay');
select is((select task_id from public.task_occurrences where id = current_setting('t.r1_occ')::uuid), pg_temp.tid('R1 exception'), 'this: the same row, with the same id, moved to the new task');
select is((select rrule from public.tasks where title = 'R1 exception'), null, 'this: the new task is one-off, p_rrule ignored');
select is((select parent_task_id from public.tasks where title = 'R1 exception'), current_setting('t.r1')::uuid, 'this: it points to the original');
select is((select group_id from public.tasks where title = 'R1 exception'), '10000000-0000-0000-0000-00000000000a'::uuid, 'this: and stays in the group');
select is((select created_by from public.tasks where title = 'R1 exception'), '00000000-0000-0000-0000-00000000000c'::uuid, 'this: authorship is kept');
select is((select scheduled_start from public.task_occurrences where id = current_setting('t.r1_occ')::uuid), now() + interval '4 days 1 hour', 'this: the occurrence takes the form''s schedule');
select is((select pg_temp.hist(current_setting('t.r1_occ')::uuid)), 2::bigint, 'this: history is preserved');
select is((select pg_temp.xp_count(current_setting('t.r1_occ')::uuid)), 2::bigint, 'this: and so is XP');
select is((select count(*) from public.task_occurrences where task_id = (select id from public.tasks where title = 'R1 exception')), 1::bigint, 'this: the new task has no second occurrence from the trigger');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('R1', 1), 'done', 'pending', null)$$, 'an occurrence gets resolved');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.edit_task(pg_temp.occ('R1', 1), 'this', pg_temp.form(now() + interval '3 days'), null, null)$$, 'P0001', 'occurrence_not_pending', 'this: a resolved occurrence cannot be moved');
select lives_ok($$select public.edit_task(pg_temp.occ('R1', 1), 'all', pg_temp.form(now() + interval '3 days', '{"title": "R1"}'), 'FREQ=DAILY', null)$$, 'all: renaming leaves the resolved occurrence alone');
select pg_temp.pg();
select is((select status::text from public.task_occurrences where id = (select id from public.task_occurrences where task_id = current_setting('t.r1')::uuid order by scheduled_start limit 1)), 'done', 'all: resolved is history');

-- all, schedule changed
select pg_temp.mk('R2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('R2', now() - interval '2 days');
select pg_temp.mk_occ('R2', now() - interval '1 day');
select pg_temp.mk_occ('R2', now() + interval '1 day');
select pg_temp.mk_occ('R2', now() + interval '2 days');
select pg_temp.mk_occ('R2', now() + interval '3 days');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('R2', 1);
update public.task_occurrences set status = 'done' where id = pg_temp.occ('R2', 4);
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('R2', 4);
select set_config('t.r2', pg_temp.tid('R2')::text, true);
select set_config('t.r2_hist', pg_temp.occ('R2', 4)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(pg_temp.occ('R2', 3), 'all', pg_temp.form(now() + interval '1 day', '{"title": "R2 new"}'), 'FREQ=DAILY;INTERVAL=2', null),
  array[current_setting('t.r2')::uuid], 'all: a new schedule asks for materialization of that task');
select pg_temp.pg();
select is((select string_agg(status::text, ',' order by scheduled_start) from public.task_occurrences where task_id = current_setting('t.r2')::uuid), 'done,pending,cancelled', 'all: past ones stay, future ones without history go, future ones with history are cancelled');
select is((select pg_temp.hist(current_setting('t.r2_hist')::uuid)), 3::bigint, 'all: the cancelled one keeps its history and records the cancel');
select is((select materialized_until from public.tasks where id = current_setting('t.r2')::uuid), now(), 'all: materialization restarts from now');
select is((select rrule from public.tasks where id = current_setting('t.r2')::uuid), 'FREQ=DAILY;INTERVAL=2', 'all: the rule is replaced');
select is((select title from public.tasks where id = current_setting('t.r2')::uuid), 'R2 new', 'all: and the other fields');

-- all, only the assignee changed
select pg_temp.mk('R3', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('R3', now() - interval '2 days');
select pg_temp.mk_occ('R3', now() + interval '1 day');
select pg_temp.mk_occ('R3', now() + interval '2 days');
select set_config('t.r3', pg_temp.tid('R3')::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(pg_temp.occ('R3', 2), 'all', pg_temp.form(now() + interval '1 day', '{"title": "R3 new", "assigneeId": "00000000-0000-0000-0000-00000000000f"}'), 'FREQ=DAILY', null),
  '{}'::uuid[], 'all: same schedule, nothing to materialize');
select pg_temp.pg();
select is((select string_agg(assignee_id::text, ',' order by scheduled_start) from public.task_occurrences where task_id = current_setting('t.r3')::uuid),
  '00000000-0000-0000-0000-00000000000d,00000000-0000-0000-0000-00000000000f,00000000-0000-0000-0000-00000000000f', 'all: future pending occurrences get the new assignee, past ones keep theirs');
select is((select assignee_id from public.tasks where id = current_setting('t.r3')::uuid), '00000000-0000-0000-0000-00000000000f'::uuid, 'all: and so does the task');
select is((select count(*) from public.task_occurrences where task_id = current_setting('t.r3')::uuid), 3::bigint, 'all: no occurrence was recreated');

-- After a reassignment the old assignee still acts on what was theirs, but no longer edits the task
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('R3 new', 1), 'done', 'pending', null)), 'done', 'reassigned: the old assignee resolves their own past occurrence (assignee actor follows the occurrence)');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('R3 new', 1), 'pending', 'done', null)), 'pending', 'reassigned: and reopens it');
select throws_ok($$select public.edit_task(pg_temp.occ('R3 new', 1), 'all', pg_temp.form(now() + interval '1 day', '{"title": "R3 stolen"}'), 'FREQ=DAILY', null)$$, '42501', 'forbidden', 'reassigned: but cannot edit the task (editor follows tasks.assignee_id)');
select throws_ok($$select public.delete_task(pg_temp.occ('R3 new', 1), 'this', null)$$, '42501', 'forbidden', 'reassigned: nor delete it');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('R3 new', 2), 'done', 'pending', null)), 'done', 'reassigned: the new assignee resolves the future occurrence');

-- The list read path: one select with the joins returns what OccurrenceListItem needs
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select is(
  (select row(t.title, t.context_id, t.group_id, t.created_by, t.assignee_id, t.schedule_type, t.timezone, t.priority, t.difficulty, t.visibility, t.rrule, t.requires_partial_reason, c.area_id)::text
   from public.task_occurrences o join public.tasks t on t.id = o.task_id join public.contexts c on c.id = t.context_id
   where o.id = pg_temp.occ('R3 new', 2)),
  (select row('R3 new', '20000000-0000-0000-0000-00000000000a'::uuid, '10000000-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-00000000000c'::uuid, '00000000-0000-0000-0000-00000000000f'::uuid, 'timed'::public.schedule_type, 'America/Sao_Paulo', 'normal'::public.task_priority, 'easy'::public.task_difficulty, 'group'::public.task_visibility, 'FREQ=DAILY', true, (select area_id from public.contexts where id = '20000000-0000-0000-0000-00000000000a'))::text),
  'list: occurrence, task and context columns are readable through the foreign keys');
select pg_temp.pg();

-- this_and_following
select pg_temp.mk('R4', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('R4', now() - interval '2 days');
select pg_temp.mk_occ('R4', now() + interval '1 day');
select pg_temp.mk_occ('R4', now() + interval '2 days');
select pg_temp.mk_occ('R4', now() + interval '3 days');
select pg_temp.mk_occ('R4', now() + interval '4 days');
select pg_temp.mk_occ('R4', now() + interval '5 days');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('R4', 1);
update public.task_occurrences set status = 'done' where id = pg_temp.occ('R4', 4);
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('R4', 4);
update public.task_occurrences set status = 'missed' where id = pg_temp.occ('R4', 5);
select set_config('t.r4', pg_temp.tid('R4')::text, true);
select set_config('t.r4_missed', pg_temp.occ('R4', 5)::text, true);
select set_config('t.r4_hist', pg_temp.occ('R4', 4)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(pg_temp.occ('R4', 3), 'this_and_following', pg_temp.form(now() + interval '2 days', '{"title": "R4 tail"}'), 'FREQ=DAILY;INTERVAL=2', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'this_and_following: splits the series at the pivot');
select pg_temp.pg();
select is((select rrule from public.tasks where id = current_setting('t.r4')::uuid), 'FREQ=DAILY;UNTIL=20261231T000000Z', 'this_and_following: the original ends before the pivot');
select is((select string_agg(status::text, ',' order by scheduled_start) from public.task_occurrences where task_id = current_setting('t.r4')::uuid), 'done,pending,cancelled', 'this_and_following: before the pivot stays, from it pending ones go or are cancelled if they have history');
select is((select pg_temp.hist(current_setting('t.r4_hist')::uuid)), 3::bigint, 'this_and_following: a cancelled one keeps its history');
select is((select rrule from public.tasks where title = 'R4 tail'), 'FREQ=DAILY;INTERVAL=2', 'this_and_following: the new task has the new rule');
select is((select parent_task_id from public.tasks where title = 'R4 tail'), current_setting('t.r4')::uuid, 'this_and_following: and points to the original');
select is((select task_id from public.task_occurrences where id = current_setting('t.r4_missed')::uuid), pg_temp.tid('R4 tail'), 'this_and_following: a resolved occurrence from the pivot on moves, with its id');
select is((select count(*) from public.task_occurrences where task_id = pg_temp.tid('R4 tail')), 1::bigint, 'this_and_following: and it is the only one there until the materialization');

-- this_and_following on the first occurrence is all
select pg_temp.mk('R5', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('R5', now() + interval '1 day');
select pg_temp.mk_occ('R5', now() + interval '2 days');
select set_config('t.r5', pg_temp.tid('R5')::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(pg_temp.occ('R5', 1), 'this_and_following', pg_temp.form(now() + interval '1 day'), 'FREQ=DAILY;INTERVAL=3', null),
  array[current_setting('t.r5')::uuid], 'this_and_following without a head rule edits the whole series');
select pg_temp.pg();
select is((select count(*) from public.tasks where parent_task_id = current_setting('t.r5')::uuid), 0::bigint, 'and creates no new task');
select is((select rrule from public.tasks where id = current_setting('t.r5')::uuid), 'FREQ=DAILY;INTERVAL=3', 'it replaced the rule');

-- One-off task edits: scope does not matter, and a changed schedule needs a pending occurrence
select pg_temp.mk('E1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('E2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is(
  public.edit_task(pg_temp.occ('E1'), 'this', pg_temp.form(now() + interval '3 days', '{"title": "E1 new"}'), null, null),
  '{}'::uuid[], 'a member edits their own one-off task, any scope');
select pg_temp.pg();
select is((select scheduled_start from public.task_occurrences where task_id = pg_temp.tid('E1 new')), now() + interval '3 days', 'its pending occurrence follows the new schedule');
select is((select count(*) from public.tasks where parent_task_id is not null and title = 'E1 new'), 0::bigint, 'and no task was split');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select public.edit_task(pg_temp.occ('E1 new'), 'all', pg_temp.form(now() + interval '3 days', '{"assigneeId": "00000000-0000-0000-0000-00000000000f"}'), null, null)$$, '42501', 'forbidden', 'but cannot hand it to someone else without task.create_for_others');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('E2'), 'done', 'pending', null)$$, 'a one-off occurrence gets resolved');
select throws_ok($$select public.edit_task(pg_temp.occ('E2'), 'all', pg_temp.form(now() + interval '4 days'), null, null)$$, 'P0001', 'occurrence_not_pending', 'then its schedule cannot change');
select lives_ok($$select public.edit_task(pg_temp.occ('E2'), 'all', pg_temp.form(now() + interval '2 days', '{"title": "E2 new"}'), null, null)$$, 'but its other fields can');
select is((select status::text from public.task_occurrences where task_id = pg_temp.tid('E2 new')), 'done', 'and it stays resolved');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.edit_task(pg_temp.occ('A2'), 'all', pg_temp.form(now() + interval '2 days'), null, null)$$, '42501', 'forbidden', 'admin cannot edit a member''s private task');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.edit_task(pg_temp.occ('A1'), 'all', pg_temp.form(now() + interval '2 days', '{"title": "A1"}'), null, null)$$, 'the owner edits a group task as an editor');
select throws_ok($$select public.edit_task(pg_temp.occ('A4'), 'all', pg_temp.form(now() + interval '2 days'), null, null)$$, '42501', 'forbidden', 'but not the admin''s private one');
select throws_ok($$select public.edit_task(pg_temp.occ('A1'), 'all', null, null, null)$$, '22023', 'invalid_task', 'a missing form is rejected');

-- delete_task
select pg_temp.pg();
select pg_temp.mk('D1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('D1', now() + interval '1 day');
select pg_temp.mk_occ('D1', now() + interval '2 days');
select pg_temp.mk_occ('D1', now() + interval '3 days');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('D1', 1);
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select public.delete_task(pg_temp.occ('D1', 2), 'this', null)$$, '42501', 'forbidden', 'a member cannot delete a task the admin gave them');
select throws_ok($$select public.delete_task(pg_temp.occ('D1', 2), 'all', null)$$, '42501', 'forbidden', 'nor the whole series');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.delete_task(pg_temp.occ('D1', 2), 'this', null)$$, 'this: the admin deletes one occurrence');
select is((select string_agg(status::text, ',' order by scheduled_start) from public.task_occurrences where task_id = pg_temp.tid('D1')), 'done,cancelled,pending', 'this: it is cancelled and the row stays');
select throws_ok($$select public.delete_task(pg_temp.occ('D1', 1), 'this', null)$$, '23514', 'invalid_transition', 'this: a completed occurrence cannot be deleted');
select throws_ok($$select public.delete_task(pg_temp.occ('D1', 2), 'this', null)$$, '23514', 'invalid_transition', 'this: nor one already cancelled');
select is((select archived_at from public.tasks where title = 'D1'), null, 'this: the task is not archived');

select pg_temp.pg();
select pg_temp.mk('D3', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('D3', now() + interval '1 day');
select pg_temp.mk_occ('D3', now() + interval '2 days');
select pg_temp.mk_occ('D3', now() + interval '3 days');
select pg_temp.mk_occ('D3', now() + interval '4 days');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('D3', 4);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.delete_task(pg_temp.occ('D3', 3), 'this_and_following', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'this_and_following: deletes from the pivot on');
select is((select string_agg(status::text, ',' order by scheduled_start) from public.task_occurrences where task_id = pg_temp.tid('D3')), 'pending,pending,cancelled,done', 'this_and_following: pending ones from the pivot are cancelled, earlier and resolved ones stay');
select is((select rrule from public.tasks where title = 'D3'), 'FREQ=DAILY;UNTIL=20261231T000000Z', 'this_and_following: and the series ends before it');

select pg_temp.pg();
select pg_temp.mk('D4', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk('D4 child', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days', 'easy', true, null, pg_temp.tid('D4'));
select pg_temp.mk('D4 other', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk_occ('D4', now() + interval '1 day');
select pg_temp.mk_occ('D4', now() + interval '2 days');
select pg_temp.mk_occ('D4 child', now() + interval '2 days');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('D4', 2);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.delete_task(pg_temp.occ('D4', 1), 'all', null)$$, 'all: deletes the whole series');
select pg_temp.pg();
select is((select count(*) from public.tasks where title in ('D4', 'D4 child') and archived_at is not null), 2::bigint, 'all: the task and its descendants are archived');
select is((select archived_at from public.tasks where title = 'D4 other'), null, 'all: unrelated tasks are not');
select is((select string_agg(status::text, ',' order by scheduled_start, status::text) from public.task_occurrences where task_id in (pg_temp.tid('D4'), pg_temp.tid('D4 child'))), 'cancelled,cancelled,done', 'all: pending ones are cancelled, the completed one stays');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('D4', 1), 'pending', 'cancelled', null)$$, '42501', 'forbidden', 'all: an archived task cannot be brought back through its occurrences');
select throws_ok($$select public.delete_task(pg_temp.occ('D4', 1), 'all', null)$$, '42501', 'forbidden', 'all: nor deleted twice');

select pg_temp.pg();
select pg_temp.mk('D5', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.mk('O3', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '2 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.delete_task(pg_temp.occ('D5'), 'this', null)$$, 'a one-off task deleted with scope this');
select is((select status::text from public.task_occurrences where task_id = pg_temp.tid('D5')), 'cancelled', 'only cancels its occurrence');
select is((select archived_at from public.tasks where title = 'D5'), null, 'and the task stays, so the cancel can be undone');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$select public.delete_task(pg_temp.occ('O3'), 'all', null)$$, 'a member deletes their own task');
select pg_temp.pg();
select isnt((select archived_at from public.tasks where title = 'O3'), null, 'which archives it');
select is((select count(*) from public.tasks where title = 'O3'), 1::bigint, 'nothing is ever removed');

-- Excluded days (exdates are local days, ADR-0005 section 8)
select pg_temp.pg();
select pg_temp.mk('F1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-05-10 23:30-03', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('F1', '2027-05-10 23:30-03');
select pg_temp.mk_occ('F1', '2027-05-11 23:30-03');
select pg_temp.mk_occ('F1', '2027-05-12 23:30-03');
select pg_temp.mk_occ('F1', '2027-05-13 23:30-03');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('F1', 4);
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('F1', 4);
select set_config('t.f1', pg_temp.tid('F1')::text, true);
select set_config('t.f1_o1', pg_temp.occ('F1', 1)::text, true);
select set_config('t.f1_o2', pg_temp.occ('F1', 2)::text, true);
select set_config('t.f1_o4', pg_temp.occ('F1', 4)::text, true);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.delete_task(current_setting('t.f1_o1')::uuid, 'this', null)$$, 'exdates: deleting one occurrence of a series');
select pg_temp.pg();
select is((select status::text from public.task_occurrences where id = current_setting('t.f1_o1')::uuid), 'cancelled', 'exdates 1: the row stays, cancelled');
select is((select exdates::text from public.tasks where id = current_setting('t.f1')::uuid), '{2027-05-10}', 'exdates 1: at 23:30 local the excluded day is the local one, not the UTC one');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select status::text from public.set_occurrence_status(current_setting('t.f1_o1')::uuid, 'pending', 'cancelled', null)), 'pending', 'exdates 6: the deleter reopens it');
select pg_temp.pg();
select is((select exdates::text from public.tasks where id = current_setting('t.f1')::uuid), '{2027-05-10}', 'exdates 6: reopening does not change the list');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(current_setting('t.f1_o2')::uuid, 'this', pg_temp.form('2027-05-12 01:00-03', '{"title": "F1 detached"}'), null, null)$$, 'exdates: detaching one occurrence with a new time');
select pg_temp.pg();
select is((select exdates::text from public.tasks where id = current_setting('t.f1')::uuid), '{2027-05-10,2027-05-11}', 'exdates 2: the original day is excluded, not the new one');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(current_setting('t.f1_o4')::uuid, 'all', pg_temp.form('2027-05-10 22:00-04', '{"timezone": "America/Manaus"}'), 'FREQ=DAILY', null),
  array[current_setting('t.f1')::uuid], 'exdates 3: all, with the hour and the zone changed together');
select pg_temp.pg();
select is((select exdates::text from public.tasks where id = current_setting('t.f1')::uuid), '{2027-05-10,2027-05-11}', 'exdates 3: the list is untouched');
select is((select status::text || ' ' || scheduled_start::text from public.task_occurrences where id = current_setting('t.f1_o4')::uuid), 'cancelled ' || ('2027-05-13 23:30-03'::timestamptz)::text, 'exdates 5: a future pending one with history is cancelled and keeps its old start');
select is((select count(*) from public.task_occurrences where task_id = current_setting('t.f1')::uuid and status = 'pending' and id <> current_setting('t.f1_o1')::uuid), 0::bigint, 'exdates 5: the ones without history are gone');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(current_setting('t.f1_o1')::uuid, 'all', pg_temp.form('2027-05-10 22:00-04', '{"timezone": "America/Manaus"}'), 'FREQ=WEEKLY;BYDAY=MO', null),
  array[current_setting('t.f1')::uuid], 'exdates 4: the series moves to other weekdays');
select pg_temp.pg();
select is((select exdates::text from public.tasks where id = current_setting('t.f1')::uuid), '{2027-05-10,2027-05-11}', 'exdates 4: the list is untouched');
select is((select exdates::text from public.tasks where title = 'D3'), '{}', 'exdates: cancelling inside delete_task and edit_task writes nothing');
select is((select exdates::text from public.tasks where title = 'R2 new'), '{}', 'exdates: nor does an internal cancel by a schedule change');
select is((select exdates::text from public.tasks where title = 'D5'), '{}', 'exdates: nor does cancelling a one-off task');

select pg_temp.mk('F2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-06-01 10:00-03', 'easy', true, 'FREQ=DAILY');
update public.tasks set exdates = '{2027-06-05,2027-06-12,2027-06-20}' where title = 'F2';
select pg_temp.mk_occ('F2', '2027-06-10 10:00-03');
select pg_temp.mk_occ('F2', '2027-06-14 10:00-03');
select pg_temp.mk_occ('F2', '2027-06-18 10:00-03');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(pg_temp.occ('F2', 2), 'this_and_following', pg_temp.form('2027-06-14 10:00-03', '{"title": "F2 tail"}'), 'FREQ=DAILY;INTERVAL=2', 'FREQ=DAILY;UNTIL=20270613T000000Z')$$, 'exdates: splitting a series that has excluded days');
select pg_temp.pg();
select is((select exdates::text from public.tasks where title = 'F2 tail'), '{2027-06-20}', 'exdates 7: the new task inherits only the days from the pivot on');

-- edit_task review fixes (ADR-0005 section 8)
-- 1. A series that stops repeating leaves one pending occurrence, so a second edit works
select pg_temp.pg();
select pg_temp.mk('Q1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('Q1', now() - interval '3 days');
select pg_temp.mk_occ('Q1', now() - interval '2 days');
select pg_temp.mk_occ('Q1', now() + interval '1 day');
select set_config('t.q1', pg_temp.tid('Q1')::text, true);
select set_config('t.q1_occ', pg_temp.occ('Q1', 1)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(current_setting('t.q1_occ')::uuid, 'all', pg_temp.form(now() + interval '5 days', '{"title": "Q1 once"}'), null, null),
  '{}'::uuid[], 'stop repeating: nothing to materialize');
select pg_temp.pg();
select is((select count(*) from public.task_occurrences where task_id = current_setting('t.q1')::uuid and status = 'pending'), 1::bigint, 'stop repeating: past and future pending occurrences collapse into one');
select is((select scheduled_start from public.task_occurrences where task_id = current_setting('t.q1')::uuid and status = 'pending'), now() + interval '5 days', 'stop repeating: at the new schedule');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(pg_temp.occ('Q1 once'), 'all', pg_temp.form(now() + interval '6 days', '{"title": "Q1 twice", "assigneeId": "00000000-0000-0000-0000-00000000000f"}'), null, null)$$, 'stop repeating: a second edit of schedule and assignee works');
select pg_temp.pg();
select is((select assignee_id from public.task_occurrences where task_id = current_setting('t.q1')::uuid and status = 'pending'), '00000000-0000-0000-0000-00000000000f'::uuid, 'stop repeating: and the single occurrence follows');

-- 2. One day, one occurrence: a started occurrence keeps today, the new time starts tomorrow
select pg_temp.mk('Q2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '1 minute', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('Q2', now() - interval '1 minute');
select pg_temp.mk_occ('Q2', now() + interval '1 day');
select set_config('t.q2', pg_temp.tid('Q2')::text, true);
select set_config('t.q2_today', pg_temp.occ('Q2', 1)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(current_setting('t.q2_today')::uuid, 'all', pg_temp.form(now() + interval '3 hours', '{"title": "Q2 later"}'), 'FREQ=DAILY', null),
  array[current_setting('t.q2')::uuid], 'one day: changing the hour asks for materialization');
select pg_temp.pg();
select is((select status::text from public.task_occurrences where id = current_setting('t.q2_today')::uuid), 'pending', 'one day: the started occurrence of today stays');
select is((select count(*) from public.task_occurrences where task_id = current_setting('t.q2')::uuid), 1::bigint, 'one day: and the future one is gone');
select is((select exdates::text from public.tasks where id = current_setting('t.q2')::uuid), '{' || (now() at time zone 'America/Sao_Paulo')::date::text || '}', 'one day: only today is excluded, so the new hour starts tomorrow');

-- the same with a resolved occurrence today and one resolved on a future day
select pg_temp.mk('Q3', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '1 minute', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('Q3', now() - interval '1 minute');
select pg_temp.mk_occ('Q3', now() + interval '2 days');
select pg_temp.mk_occ('Q3', now() + interval '3 days');
update public.task_occurrences set status = 'done' where id in (pg_temp.occ('Q3', 1), pg_temp.occ('Q3', 2));
select set_config('t.q3', pg_temp.tid('Q3')::text, true);
select set_config('t.q3_today', pg_temp.occ('Q3', 1)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(current_setting('t.q3_today')::uuid, 'all', pg_temp.form(now() + interval '3 hours', '{"title": "Q3 later"}'), 'FREQ=DAILY', null)$$, 'one day: editing with resolved occurrences today and later');
select pg_temp.pg();
select is((select string_agg(status::text, ',' order by scheduled_start) from public.task_occurrences where task_id = current_setting('t.q3')::uuid), 'done,done', 'one day: both resolved rows stay and the pending one is gone');
select is((select exdates::text from public.tasks where id = current_setting('t.q3')::uuid), '{' || (now() at time zone 'America/Sao_Paulo')::date::text || ',' || ((now() + interval '2 days') at time zone 'America/Sao_Paulo')::date::text || '}', 'one day: the days of both resolved rows are excluded');

-- a row cancelled by the system today records nothing
select pg_temp.mk('Q4', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '1 minute', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('Q4', now() - interval '1 minute');
select pg_temp.mk_occ('Q4', now() + interval '1 day');
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('Q4', 1);
select set_config('t.q4', pg_temp.tid('Q4')::text, true);
select set_config('t.q4_today', pg_temp.occ('Q4', 1)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(current_setting('t.q4_today')::uuid, 'all', pg_temp.form(now() + interval '3 hours', '{"title": "Q4 later"}'), 'FREQ=DAILY', null)$$, 'one day: editing a series whose today row is cancelled');
select pg_temp.pg();
select is((select exdates::text from public.tasks where id = current_setting('t.q4')::uuid), '{}', 'one day: a cancelled row excludes nothing, the new hour can use the day');

-- this_and_following with a resolved pivot
select pg_temp.mk('Q5', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '2 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('Q5', now() - interval '2 days');
select pg_temp.mk_occ('Q5', now() - interval '1 minute');
select pg_temp.mk_occ('Q5', now() + interval '1 day');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('Q5', 2);
select set_config('t.q5', pg_temp.tid('Q5')::text, true);
select set_config('t.q5_pivot', pg_temp.occ('Q5', 2)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(current_setting('t.q5_pivot')::uuid, 'this_and_following', pg_temp.form(now() + interval '3 hours', '{"title": "Q5 tail"}'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'one day: splitting at a resolved pivot with a new hour');
select pg_temp.pg();
select is((select task_id from public.task_occurrences where id = current_setting('t.q5_pivot')::uuid), pg_temp.tid('Q5 tail'), 'one day: the resolved pivot moved to the new task');
select is((select exdates::text from public.tasks where title = 'Q5 tail'), '{' || (now() at time zone 'America/Sao_Paulo')::date::text || '}', 'one day: and its day is excluded there');

-- 3. Reassigning without a schedule change reaches every occurrence still on time
select pg_temp.mk('Q6', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('Q6', now() - interval '3 days');
select pg_temp.mk_occ('Q6', now() - interval '1 day');
select pg_temp.mk_occ('Q6', now() + interval '1 day');
update public.task_occurrences set overdue_at = now() - interval '1 hour', auto_miss_at = now() - interval '1 hour' where id = pg_temp.occ('Q6', 1);
update public.task_occurrences set overdue_at = now() + interval '1 day', auto_miss_at = now() + interval '1 day' where id = pg_temp.occ('Q6', 2);
select set_config('t.q6', pg_temp.tid('Q6')::text, true);
select set_config('t.q6_o2', pg_temp.occ('Q6', 2)::text, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is(
  public.edit_task(current_setting('t.q6_o2')::uuid, 'all', pg_temp.form(now() + interval '1 day', '{"title": "Q6 new", "assigneeId": "00000000-0000-0000-0000-00000000000f"}'), 'FREQ=DAILY', null),
  '{}'::uuid[], 'reassign: same schedule, nothing to materialize');
select pg_temp.pg();
select is((select string_agg(assignee_id::text, ',' order by scheduled_start) from public.task_occurrences where task_id = current_setting('t.q6')::uuid),
  '00000000-0000-0000-0000-00000000000d,00000000-0000-0000-0000-00000000000f,00000000-0000-0000-0000-00000000000f', 'reassign: a started occurrence still on time follows the new assignee, an overdue one stays');

-- Security review of phase 2: rules, cross-group moves, private tasks, dates, XP, net, archived contexts
select pg_temp.pg();
insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'member');
select pg_temp.mk('S1', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('S1', now() + interval '1 day');
select pg_temp.mk_occ('S1', now() + interval '2 days');
select pg_temp.mk_occ('S1', now() + interval '3 days');
select pg_temp.mk_occ('S1', now() + interval '4 days');

-- RRULE grammar: only what toRRule and splitRecurrence write
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'UTC', '[]', 'x', 'FREQ=SECONDLY;INTERVAL=1')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_rrule_grammar_check"', 'rrule: a one-second frequency is rejected');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'deadline', null, now() + interval '2 hours', 'UTC', '[]', 'x', 'FREQ=DAILY;BYHOUR=10')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_rrule_grammar_check"', 'rrule: BYHOUR, which can put the end before the start, is rejected');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'UTC', '[]', 'x', 'FREQ=DAILY;INTERVAL=1')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_rrule_grammar_check"', 'rrule: even a harmless rule outside the grammar is rejected');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'UTC', '[]', 'x', 'FREQ=WEEKLY;BYDAY=MO,WE')$$, 'rrule: a rule the app writes is accepted for a real client');
select throws_ok($$select public.edit_task(pg_temp.occ('S1', 2), 'all', pg_temp.form(now() + interval '1 day'), 'FREQ=SECONDLY', null)$$, '22023', 'invalid_rrule', 'rrule: edit_task refuses a bad rule');
select throws_ok($$select public.edit_task(pg_temp.occ('S1', 2), 'this_and_following', pg_temp.form(now() + interval '2 days'), 'FREQ=DAILY', 'FREQ=DAILY;BYHOUR=3')$$, '22023', 'invalid_rrule', 'rrule: and a bad head rule');
select throws_ok($$select public.delete_task(pg_temp.occ('S1', 2), 'this_and_following', 'FREQ=HOURLY')$$, '22023', 'invalid_rrule', 'rrule: delete_task refuses a bad head rule');
select pg_temp.pg();
select is((select count(*) from regexp_split_to_table($rules$FREQ=DAILY
FREQ=WEEKLY;BYDAY=MO
FREQ=WEEKLY;BYDAY=WE,FR
FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU
FREQ=MONTHLY;BYMONTHDAY=1
FREQ=MONTHLY;BYMONTHDAY=15
FREQ=MONTHLY;BYMONTHDAY=28
FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1
FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1
FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1
FREQ=DAILY;INTERVAL=2
FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,FR
FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=28,29,30,31;BYSETPOS=-1
FREQ=DAILY;INTERVAL=99
FREQ=WEEKLY;INTERVAL=99;BYDAY=MO,TU,WE,TH,FR,SA,SU
FREQ=DAILY;COUNT=1
FREQ=WEEKLY;BYDAY=WE,FR;COUNT=1
FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;COUNT=1
FREQ=MONTHLY;INTERVAL=13;BYMONTHDAY=9;COUNT=1
FREQ=DAILY;COUNT=730
FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR,SA,SU;COUNT=730
FREQ=MONTHLY;INTERVAL=99;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;COUNT=730
FREQ=DAILY;UNTIL=20310101T025959Z
FREQ=WEEKLY;BYDAY=MO;UNTIL=20301231T145959Z
FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20310101T045959Z
FREQ=MONTHLY;INTERVAL=99;BYMONTHDAY=15;UNTIL=20310101T045959Z
FREQ=WEEKLY;BYDAY=MO,WE;COUNT=9
FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261209T025959Z
FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20270331T025959Z$rules$, E'\n') r where not public.is_valid_rrule(r)), 0::bigint, 'rrule: every rule generated by toRRule and splitRecurrence is accepted (sample of 178 real ones)');
select is((select count(*) from unnest(array[
  'FREQ=SECONDLY', 'FREQ=MINUTELY;INTERVAL=2', 'FREQ=YEARLY', 'FREQ=DAILY;BYHOUR=10', 'FREQ=DAILY;INTERVAL=1',
  'FREQ=DAILY;INTERVAL=100', 'FREQ=DAILY;COUNT=0', 'FREQ=DAILY;COUNT=731', 'FREQ=WEEKLY', 'FREQ=WEEKLY;BYDAY=XX',
  'FREQ=WEEKLY;BYDAY=MO,MO,MO,MO,MO,MO,MO,MO', 'FREQ=MONTHLY', 'FREQ=MONTHLY;BYMONTHDAY=29', 'FREQ=MONTHLY;BYMONTHDAY=0',
  'FREQ=DAILY;COUNT=3;UNTIL=20300101T000000Z', 'FREQ=DAILY;UNTIL=20301301T000000Z', 'FREQ=DAILY;UNTIL=20300101', 'freq=daily',
  'FREQ=DAILY;', 'FREQ=DAILY;X=1', E'FREQ=DAILY\nFREQ=DAILY', 'FREQ=DAILY;BYDAY=MO', ''
]) r where public.is_valid_rrule(r)), 0::bigint, 'rrule: everything else is rejected');

-- A move across groups or owners is refused, for the new task of this and this_and_following
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.edit_task(pg_temp.occ('S1', 2), 'this_and_following', pg_temp.form(now() + interval '2 days', '{"contextId": "20000000-0000-0000-0000-00000000000b"}'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, '23514', 'context_change_not_allowed', 'move: this_and_following cannot carry the series into another group');
select throws_ok($$select public.edit_task(pg_temp.occ('S1', 2), 'this', pg_temp.form(now() + interval '2 days', '{"contextId": "20000000-0000-0000-0000-00000000000b"}'), null, null)$$, '23514', 'context_change_not_allowed', 'move: nor can this');
select throws_ok($$select public.edit_task(pg_temp.occ('S1', 2), 'this', pg_temp.form(now() + interval '2 days', '{"contextId": "20000000-0000-0000-0000-00000000000d"}'), null, null)$$, '23514', 'context_change_not_allowed', 'move: nor into a personal context');
select throws_ok($$select public.edit_task(pg_temp.occ('S1', 2), 'all', pg_temp.form(now() + interval '2 days', '{"contextId": "20000000-0000-0000-0000-00000000000b"}'), 'FREQ=DAILY', null)$$, '23514', 'context_change_not_allowed', 'move: and all keeps refusing');
select lives_ok($$select public.edit_task(pg_temp.occ('S1', 3), 'this', pg_temp.form(now() + interval '3 days', '{"contextId": "20000000-0000-0000-0000-0000000000a2", "title": "S1 moved"}'), null, null)$$, 'move: a context of the same group is fine');
select pg_temp.pg();
select is((select group_id from public.tasks where title = 'S1 moved'), '10000000-0000-0000-0000-00000000000a'::uuid, 'move: and the new task stays in the group');
select is((select count(*) from public.tasks where parent_task_id = pg_temp.tid('S1') and group_id is distinct from '10000000-0000-0000-0000-00000000000a'::uuid), 0::bigint, 'move: no child of the series lives in another group');

-- A private task is invisible to a former assignee, whatever occurrence rows say
select pg_temp.mk('PV', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '3 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(pg_temp.occ('PV'), 'all', pg_temp.form(now() + interval '3 days', '{"title": "PV", "assigneeId": "00000000-0000-0000-0000-00000000000c"}'), null, null)$$, 'private: the admin takes the task');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('PV'), 'done', 'pending', null)$$, 'private: and completes it as the assignee');
select lives_ok($$select public.edit_task(pg_temp.occ('PV'), 'all', pg_temp.form(now() + interval '3 days', '{"title": "PV", "assigneeId": "00000000-0000-0000-0000-00000000000d"}'), null, null)$$, 'private: then gives it back');
select is((select count(*) from public.tasks where title = 'PV'), 1::bigint, 'private: while it is a group task the admin sees it');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select public.edit_task(pg_temp.occ('PV'), 'all', pg_temp.form(now() + interval '3 days', '{"title": "PV private", "notes": "sigilo", "visibility": "private"}'), null, null)$$, '23514', 'private_with_other_assignee', 'private: edit_task refuses it while the admin''s resolved row would go along');
select pg_temp.pg();
update public.tasks set title = 'PV private', notes = 'sigilo', visibility = 'private' where title = 'PV';
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.tasks where title = 'PV private'), 1::bigint, 'private: the member still sees it');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.tasks where title = 'PV private'), 0::bigint, 'private: the admin who once resolved an occurrence no longer sees the task');
select is((select count(*) from public.task_occurrences where id = pg_temp.occ('PV private')), 0::bigint, 'private: nor its occurrence');
select is((select count(*) from public.task_status_history where occurrence_id = pg_temp.occ('PV private')), 0::bigint, 'private: nor its history');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PV private'), 'pending', 'done', null)$$, '42501', 'forbidden', 'private: nor change its status');
select throws_ok($$select public.edit_task(pg_temp.occ('PV private'), 'all', pg_temp.form(now() + interval '3 days'), null, null)$$, '42501', 'forbidden', 'private: nor edit it');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select status::text from public.set_occurrence_status(pg_temp.occ('PV private'), 'pending', 'done', null)), 'pending', 'private: the owner reopens it');

-- Deleting a series reaches only what the caller may delete
select pg_temp.pg();
select pg_temp.mk('DT', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '1 day', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('DT', now() + interval '1 day');
select pg_temp.mk('DT group child', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '9 days', 'easy', true, null, pg_temp.tid('DT'));
select pg_temp.mk('DT private child', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'private', now() + interval '9 days', 'easy', true, null, pg_temp.tid('DT'));
alter table public.tasks disable trigger tasks_before_insert;
select pg_temp.mk('DT other group child', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '9 days', 'easy', true, null, pg_temp.tid('DT'));
alter table public.tasks enable trigger tasks_before_insert;
update public.tasks set visibility = visibility where title = 'DT other group child';
select pg_temp.mk_occ('DT group child', now() + interval '9 days');
select pg_temp.mk_occ('DT private child', now() + interval '9 days');
select pg_temp.mk_occ('DT other group child', now() + interval '9 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.delete_task(pg_temp.occ('DT'), 'all', null)$$, 'delete tree: the admin deletes the series');
select pg_temp.pg();
select is((select string_agg(title, ',' order by title) from public.tasks where archived_at is not null and title like 'DT%'), 'DT,DT group child', 'delete tree: the series and the child the admin may delete are archived');
select is((select string_agg(status::text, ',' order by title) from public.task_occurrences o join public.tasks t on t.id = o.task_id where t.title in ('DT private child', 'DT other group child')), 'pending,pending', 'delete tree: a private child and a child of another group are untouched');

-- Dates and zones
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', '-infinity')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_dates_check"', 'dates: -infinity is rejected');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'deadline', null, 'infinity')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_dates_check"', 'dates: and so is an infinite deadline');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', '1900-01-01')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_dates_check"', 'dates: and 1900');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', '2200-01-01')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_dates_check"', 'dates: and 2200');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'abc+3')$$, '22023', 'invalid_timezone', 'zone: a POSIX string that Postgres would accept is rejected');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', now(), null, 'Mars/Base')$$, '22023', 'invalid_timezone', 'zone: and so is an unknown one');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid(), 'group', 'timed', '2027-06-01 10:00+09', null, 'Asia/Tokyo')$$, 'dates and zone: a real zone and a date in range work');
select pg_temp.pg();
select throws_ok($$insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due) values (pg_temp.tid('S1'), '00000000-0000-0000-0000-00000000000d', '1900-01-01', '1900-01-01 01:00')$$, '23514', 'new row for relation "task_occurrences" violates check constraint "task_occurrences_dates_check"', 'dates: an occurrence outside the range is rejected too');

-- XP: flipping visibility between completing and reopening cannot inflate a group
select pg_temp.mk('XF', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'group', now() + interval '3 days', 'hard');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XF'), 'done', 'pending', null)$$, 'xp flip: complete as a group task');
select lives_ok($$select public.edit_task(pg_temp.occ('XF'), 'all', pg_temp.form(now() + interval '3 days', '{"title": "XF", "visibility": "private", "difficulty": "hard"}'), null, null)$$, 'xp flip: make it private');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('XF'), 'pending', 'done', null)$$, 'xp flip: reopen');
select lives_ok($$select public.edit_task(pg_temp.occ('XF'), 'all', pg_temp.form(now() + interval '3 days', '{"title": "XF", "difficulty": "hard"}'), null, null)$$, 'xp flip: make it a group task again');
select pg_temp.pg();
select is((select coalesce(sum(amount), 0) from public.xp_events where occurrence_id = pg_temp.occ('XF') and group_id = '10000000-0000-0000-0000-00000000000a'), 0::bigint, 'xp flip: the group balance of the occurrence is zero');
select is((select coalesce(sum(amount), 0) from public.xp_events where occurrence_id = pg_temp.occ('XF')), 0::bigint, 'xp flip: and so is the total');
select is((select count(*) from public.xp_events where occurrence_id = pg_temp.occ('XF') and group_id is null), 0::bigint, 'xp flip: the compensation went to the group of the original event');

-- pg_net: the grants belong to supabase_admin, so a migration cannot revoke them (see the handoff); the cron call must keep working
select is(has_schema_privilege('authenticated', 'cron', 'usage'), false, 'cron: authenticated has no schema usage either');
select pg_temp.pg();
select vault.create_secret('http://example.invalid/functions/v1/materialize-occurrences', 'materialize_url');
select vault.create_secret('local-secret', 'cron_secret');
select is((select count(*) from net.http_request_queue), 0::bigint, 'net: the queue starts empty');
select lives_ok($$select public.call_materialize_occurrences()$$, 'net: the cron call still runs for its owner');
select is((select count(*) from net.http_request_queue), 1::bigint, 'net: and queued one request');

-- Archived contexts take no new tasks
update public.contexts set archived_at = now() where id = '20000000-0000-0000-0000-0000000000a2';
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-0000000000a2', auth.uid())$$, '23514', 'context_archived', 'archived: a new task in an archived context is refused');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid())$$, 'archived: the active context still works');
select pg_temp.pg();
update public.contexts set archived_at = null where id = '20000000-0000-0000-0000-0000000000a2';
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select pg_temp.ins('20000000-0000-0000-0000-0000000000a2', auth.uid())$$, 'archived: and it works again once unarchived');

-- Closeout: a private split cannot swallow another person's rows, and Intl must read every zone
select pg_temp.pg();
select pg_temp.mk('N2', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('N2', now() - interval '3 days');
select pg_temp.mk_occ('N2', now() - interval '2 days');
select pg_temp.mk_occ('N2', now() - interval '1 day');
select pg_temp.mk_occ('N2', now() + interval '1 day');
update public.task_occurrences set status = 'partial', status_reason = 'consulta medica' where id = pg_temp.occ('N2', 3);
select pg_temp.mk('N2own', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('N2own', now() - interval '3 days');
select pg_temp.mk_occ('N2own', now() - interval '2 days');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.edit_task(pg_temp.occ('N2', 2), 'this_and_following', pg_temp.form(now() - interval '2 days', '{"title": "N2 mine", "assigneeId": "00000000-0000-0000-0000-00000000000c", "visibility": "private"}'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, '23514', 'private_with_other_assignee', 'private split: this_and_following refuses to take another person''s resolved rows');
select throws_ok($$select public.edit_task(pg_temp.occ('N2', 2), 'all', pg_temp.form(now() - interval '3 days', '{"title": "N2 mine", "assigneeId": "00000000-0000-0000-0000-00000000000c", "visibility": "private"}'), 'FREQ=DAILY', null)$$, '23514', 'private_with_other_assignee', 'private split: and so does all');
select pg_temp.pg();
select is((select count(*) from public.tasks where title = 'N2 mine'), 0::bigint, 'private split: nothing was created');
select is((select assignee_id from public.task_occurrences where id = pg_temp.occ('N2', 3)), '00000000-0000-0000-0000-00000000000d'::uuid, 'private split: the member''s resolved row stays hers');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok($$select public.edit_task(pg_temp.occ('N2', 2), 'this_and_following', pg_temp.form(now() - interval '2 days', '{"title": "N2 group"}'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'private split: the same split as a group task works');
select lives_ok($$select public.edit_task(pg_temp.occ('N2own', 1), 'all', pg_temp.form(now() - interval '3 days', '{"title": "N2own private", "assigneeId": "00000000-0000-0000-0000-00000000000c", "visibility": "private"}'), 'FREQ=DAILY', null)$$, 'private split: and one whose rows are all the admin''s can become private');
select pg_temp.pg();
select is((select count(*) from public.task_occurrences where id = pg_temp.occ('N2 group', 1) and status = 'partial' and status_reason = 'consulta medica'), 1::bigint, 'private split: with the member''s reason, now visible to her through the group task');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.task_occurrences where id = pg_temp.occ('N2 group', 1)), 1::bigint, 'private split: the member still sees it');
select pg_temp.pg();
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'group', 'timed', now(), null, 'Factory')$$, '22023', 'invalid_timezone', 'zone: Factory, which Intl rejects, is refused');
select is((select count(*) from pg_timezone_names where public.is_valid_timezone(name)), (select count(*) from pg_timezone_names where name <> 'Factory'), 'zone: Factory is the only name of the tz database left out');
select is(public.is_valid_timezone('America/Sao_Paulo'), true, 'zone: a real one is accepted');
select is(public.is_valid_timezone('abc+3'), false, 'zone: a POSIX string is not');
select is((select count(*) from cron.job where jobname = 'materialize-occurrences-daily'), 0::bigint, 'cron: the daily job is gone');

-- Team view
select pg_temp.pg();
select pg_temp.mk('T9a', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-10 13:00Z');
select pg_temp.mk('T9b', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-10 23:00Z');
select pg_temp.mk('T9c', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-10 15:00Z');
select pg_temp.mk('T9d', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-10 16:00Z');
select pg_temp.mk('T9e', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', 'private', '2027-03-10 17:00Z');
select pg_temp.mk('T9f', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f', 'group', '2027-03-10 13:00Z');
select pg_temp.mk('T9g', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-10 13:00Z');
select pg_temp.mk('T9h', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-11 01:00Z');
select pg_temp.mk('T9i', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-03-10 02:00Z');
update public.task_occurrences set overdue_at = now() - interval '1 hour' where id = pg_temp.occ('T9b');
update public.task_occurrences set status = 'done' where id = pg_temp.occ('T9b');
update public.task_occurrences set status = 'partial' where id = pg_temp.occ('T9c');
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('T9d');
update public.task_occurrences set status = 'missed' where id = pg_temp.occ('T9f');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select (pending, done, partial, missed, late)::text from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000d'), '(2,1,1,0,1)', 'team: counts by status for the local day, cancelled and private ignored');
select is((select (pending, done, partial, missed, late)::text from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000f'), '(0,0,0,1,0)', 'team: every member of the group has a row');
select is((select count(*) from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-09', '2027-03-10', 'America/Sao_Paulo')), 3::bigint, 'team: the day is local, so 23:00 on the 9th is its own day');
select is((select display_name from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000d'), 'Duda', 'team: with the display name');
select throws_ok($$select * from public.team_overview('10000000-0000-0000-0000-00000000000b', '2027-03-10', '2027-03-10', 'America/Sao_Paulo')$$, '42501', 'forbidden', 'team: the admin of A gets nothing of B');
select throws_ok($$select * from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2026-03-10', 'America/Sao_Paulo')$$, '22023', 'invalid_range', 'team: an inverted range is rejected');
select throws_ok($$select * from public.team_overview('10000000-0000-0000-0000-00000000000a', '2020-01-01', '2027-03-10', 'America/Sao_Paulo')$$, '22023', 'invalid_range', 'team: and so is one over a year');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select * from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', 'America/Sao_Paulo')$$, '42501', 'forbidden', 'team: a member without task.view_group cannot call it');

-- Team view in the viewer's zone, and a deadline on its due day
select pg_temp.pg();
select pg_temp.mk('T9j', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'group', '2027-04-11 02:30Z');
insert into public.tasks (context_id, created_by, assignee_id, title, schedule_type, start_at, due_at, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 'T9k', 'deadline', '2027-05-03 12:00Z', '2027-05-07 15:00Z', 'America/Sao_Paulo', '[]', false, false, true, 'easy', 'normal', 'group');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-04-10', '2027-04-10', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000d'), 1::bigint, 'team zone: 23:30 in Sao Paulo counts on that day for a viewer in Sao Paulo');
select is((select count(*) from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-04-10', '2027-04-10', 'Asia/Tokyo') where user_id = '00000000-0000-0000-0000-00000000000d'), 0::bigint, 'team zone: and not on that day for a viewer in Tokyo');
select is((select pending from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-04-11', '2027-04-11', 'Asia/Tokyo') where user_id = '00000000-0000-0000-0000-00000000000d'), 1, 'team zone: it counts on the next day there');
select is((select pending from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-05-07', '2027-05-07', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000d'), 1, 'team deadline: counts on the due day');
select is((select count(*) from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-05-03', '2027-05-06', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000d'), 0::bigint, 'team deadline: and not on the days it was open');
select throws_ok($$select * from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', null)$$, '22023', 'invalid_range', 'team zone: a missing zone is invalid_range');
select throws_ok($$select * from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', 'Mars/Base')$$, '22023', 'time zone "Mars/Base" not recognized', 'team zone: and an unknown one fails in Postgres');

-- A former member loses access
select pg_temp.pg();
delete from public.group_members where group_id = '10000000-0000-0000-0000-00000000000a' and user_id = '00000000-0000-0000-0000-00000000000f';
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select is((select count(*) from public.tasks), 0::bigint, 'former member: sees none of the group''s tasks, not even their own');
select is((select count(*) from public.task_occurrences), 0::bigint, 'former member: nor occurrences');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('A3'), 'pending', 'done', null)$$, '42501', 'forbidden', 'former member: cannot change a status');
select throws_ok($$select pg_temp.ins('20000000-0000-0000-0000-00000000000a', auth.uid())$$, '42501', 'forbidden', 'former member: cannot create tasks there');
select cmp_ok((select count(*) from public.xp_events), '>', 0::bigint, 'former member: keeps the XP they earned');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*) from public.team_overview('10000000-0000-0000-0000-00000000000a', '2027-03-10', '2027-03-10', 'America/Sao_Paulo') where user_id = '00000000-0000-0000-0000-00000000000f'), 0::bigint, 'former member: leaves the team view');

select pg_temp.pg();
delete from public.group_members where group_id = '10000000-0000-0000-0000-00000000000a' and user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select is((select count(*) from public.tasks where group_id = '10000000-0000-0000-0000-00000000000a'), 0::bigint, 'removed from A: no task of A is visible');
select is((select count(*) from public.tasks where title in ('B1', 'P1')), 2::bigint, 'but group B and the personal context are untouched');
select throws_ok($$select public.edit_task(pg_temp.occ('O1'), 'all', pg_temp.form(now() + interval '2 days'), null, null)$$, '42501', 'forbidden', 'removed from A: cannot edit even their own task');
select throws_ok($$select public.delete_task(pg_temp.occ('O1'), 'this', null)$$, '42501', 'forbidden', 'nor delete it');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('B1'), 'done', 'pending', null)$$, 'and they still work in B');

-- Privileges, cron and RLS guards
select pg_temp.pg();
select is(has_function_privilege('anon', 'public.set_occurrence_status(uuid, public.occurrence_status, public.occurrence_status, text)', 'execute'), false, 'anon cannot call set_occurrence_status');
select is(has_function_privilege('anon', 'public.edit_task(uuid, public.task_edit_scope, jsonb, text, text)', 'execute'), false, 'anon cannot call edit_task');
select is(has_function_privilege('anon', 'public.delete_task(uuid, public.task_edit_scope, text)', 'execute'), false, 'anon cannot call delete_task');
select is(has_function_privilege('anon', 'public.team_overview(uuid, date, date, text)', 'execute'), false, 'anon cannot call team_overview');
select is(has_function_privilege('anon', 'public.can_view_task(uuid)', 'execute'), false, 'anon cannot call can_view_task');
select is(has_function_privilege('authenticated', 'public.edit_task(uuid, public.task_edit_scope, jsonb, text, text)', 'execute'), true, 'authenticated can call edit_task');
select is(has_function_privilege('authenticated', 'public.occurrences_after_status()', 'execute'), false, 'authenticated cannot call the XP trigger function');
select is(has_function_privilege('authenticated', 'public.call_materialize_occurrences()', 'execute'), false, 'authenticated cannot trigger the cron call');
select is(has_function_privilege('authenticated', 'public.occurrence_window(public.schedule_type, timestamptz, timestamptz, int, text)', 'execute'), false, 'nor the window helper');
select is((select count(*) from cron.job where jobname = 'materialize-occurrences' and schedule = '*/15 * * * *'), 1::bigint, 'the materialization runs every 15 minutes');
-- The secrets created above for pg_net go, so this is the call with an empty Vault.
delete from vault.secrets where name in ('materialize_url', 'cron_secret');
select throws_ok($$select public.call_materialize_occurrences()$$, 'P0001', 'materialize_not_configured',
  'without Vault secrets the cron call fails loudly');
select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint, 'every public table has RLS');

select * from finish();
rollback;
