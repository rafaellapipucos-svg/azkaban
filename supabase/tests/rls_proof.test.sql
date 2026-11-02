-- Photo proof (ADR-0007) and the delay that rescheduling keeps (ADR-0005, section 11).
-- Assume a hostile client calling the REST API directly. Each rejection asserts the exact code and
-- message, and sits next to the same call allowed to someone it should allow: a missing grant fails
-- with the same code as a real denial, so a rejection alone proves little.
begin;
create extension if not exists pgtap with schema extensions;
select plan(481);

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

insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by,
    location_address, location_lat, location_lng, location_radius_m) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa A', 'teal', 'x', '00000000-0000-0000-0000-00000000000a', null, null, null, null),
  ('20000000-0000-0000-0000-00000000000b', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000b', null, 'Casa B', 'teal', 'x', '00000000-0000-0000-0000-00000000000b', null, null, null, null),
  -- A context with a place: its proofs check the distance.
  ('20000000-0000-0000-0000-00000000000c', (select id from public.areas where key = 'work'),
    '10000000-0000-0000-0000-00000000000a', null, 'Escritorio', 'violet', 'x', '00000000-0000-0000-0000-00000000000a',
    'Rua A, 1', -23.55, -46.63, 150);

-- Alice, Caio and Duda accepted the notice. Fred and Bea did not.
update public.profiles set proof_consent_version = 1, proof_consent_at = now()
where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c',
  '00000000-0000-0000-0000-00000000000d');

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

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000000' || p)::uuid;
$$;

create function pg_temp.sv(p_name text, p_val text) returns text language sql as $$
  select set_config('t.' || p_name, p_val, true);
$$;

create function pg_temp.g(p_name text) returns text language sql as $$
  select current_setting('t.' || p_name);
$$;

create temp sequence sha_seq;

-- A hash that was never used before, 64 lowercase hexadecimals.
create function pg_temp.sha() returns text language sql security definer as $$
  select lpad(to_hex(nextval('sha_seq')), 64, '0');
$$;

-- Task of the proof tests: photo on by default, no reason needed for yellow.
create function pg_temp.mkp(
  p_title text, p_ctx uuid, p_creator uuid, p_assignee uuid, p_vis public.task_visibility,
  p_start timestamptz default now() + interval '2 days', p_approval boolean default false,
  p_photo boolean default true, p_rrule text default null
) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone, rrule,
    reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty,
    priority, visibility
  ) values (
    p_ctx, p_creator, p_assignee, p_title, 'timed', p_start, 60, 'America/Sao_Paulo', p_rrule,
    '[]', p_photo, p_approval, false, 'easy', 'normal', p_vis
  ) returning id into new_id;
  return new_id;
end;
$$;

-- Same as the Phase 2 fixture: partial needs a reason, any photo flag off.
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

create function pg_temp.xp_count(p_occ uuid) returns bigint language sql security definer as $$
  select count(*) from public.xp_events where occurrence_id = p_occ;
$$;

create function pg_temp.status_of(p_occ uuid) returns text language sql security definer as $$
  select status::text from public.task_occurrences where id = p_occ;
$$;

create function pg_temp.late_of(p_occ uuid) returns boolean language sql security definer as $$
  select late from public.task_occurrences where id = p_occ;
$$;

create function pg_temp.review_of(p_occ uuid) returns text language sql security definer as $$
  select proof_review_status::text from public.task_occurrences where id = p_occ;
$$;

create function pg_temp.overdue_of(p_occ uuid) returns timestamptz language sql security definer as $$
  select overdue_at from public.task_occurrences where id = p_occ;
$$;

create function pg_temp.auto_miss_of(p_occ uuid) returns timestamptz language sql security definer as $$
  select auto_miss_at from public.task_occurrences where id = p_occ;
$$;

create function pg_temp.proofs_of(p_occ uuid) returns bigint language sql security definer as $$
  select count(*) from public.task_proofs where occurrence_id = p_occ;
$$;

-- The current proof of an occurrence.
create function pg_temp.proof_of(p_occ uuid) returns uuid language sql security definer as $$
  select current_proof_id from public.task_occurrences where id = p_occ;
$$;

-- The oldest proof of an occurrence, current or not.
create function pg_temp.first_proof(p_occ uuid) returns uuid language sql security definer as $$
  select id from public.task_proofs where occurrence_id = p_occ order by ctid limit 1;
$$;

-- The history of an occurrence in the order it was written, as from>to:review.
create function pg_temp.hist(p_occ uuid) returns text language sql security definer as $$
  select string_agg(from_status || '>' || to_status || ':' || coalesce(proof_review_status::text, '-'), ' ' order by ctid)
  from public.task_status_history where occurrence_id = p_occ;
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

-- The form of one of Fred's own tasks.
create function pg_temp.fform(p_start timestamptz, p_title text, p_extra jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.form(p_start, jsonb_build_object('title', p_title, 'assigneeId', pg_temp.u('f')) || p_extra);
$$;

-- Rows an update or a delete reached, under the role of the caller.
create function pg_temp.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Opens the camera as the user and has proof-validate claim the nonce: what happens before the body is read.
create function pg_temp.claimed(p_user uuid, p_occ uuid) returns uuid language plpgsql as $$
declare nonce uuid;
begin
  perform pg_temp.login(p_user);
  nonce := (public.issue_proof_challenge(p_occ) ->> 'nonce')::uuid;
  perform pg_temp.service();
  perform public.claim_proof_challenge(nonce, p_user);
  perform pg_temp.pg();
  return nonce;
end;
$$;

-- What proof-validate does with the bytes it accepted: commit_proof, as the service role.
create function pg_temp.commit(
  p_nonce uuid, p_user uuid, p_flags text[] default '{}', p_hash text default null
) returns jsonb language plpgsql as $$
declare
  occ uuid;
  hash text := coalesce(p_hash, pg_temp.sha());
  res jsonb;
begin
  select occurrence_id into occ from public.proof_challenges where id = p_nonce;
  perform pg_temp.service();
  -- The claims of the caller, right before and right after: the impersonation must not outlive the call.
  perform set_config('t.cb', current_setting('request.jwt.claims', true), true);
  res := public.commit_proof(
    p_nonce, p_user, occ::text || '/' || p_nonce::text || '.jpg', hash, 1000, 640, 480, now(), null, null,
    p_flags, 'web', '1.0.0', 'test-agent'
  );
  perform set_config('t.ca', current_setting('request.jwt.claims', true), true);
  perform set_config('t.ua', coalesce(auth.uid()::text, 'null'), true);
  perform pg_temp.pg();
  return res;
end;
$$;

-- The whole flow for a proof that nothing disturbs.
create function pg_temp.prove(p_user uuid, p_occ uuid) returns jsonb language plpgsql as $$
begin
  return pg_temp.commit(pg_temp.claimed(p_user, p_occ), p_user);
end;
$$;

-- ===== The rules and the schema =====
select is((select count(*) from public.occurrence_transitions), 23::bigint, 'the four reviewer pairs are seeded');
select is((select string_agg(from_status || '>' || to_status, ',' order by from_status::text, to_status::text) from public.occurrence_transitions where actor = 'reviewer'), 'done>missed,done>partial,missed>done,partial>done', 'and they are the reviewer''s');
select is((select string_agg(role::text, ',' order by role::text) from public.role_permissions where permission_key = 'proof.review'), 'admin,owner', 'proof.review belongs to owner and admin, and not to member');
select is((select (value ->> 'maxBytes')::int from public.app_settings where key = 'proof_rules'), 2097152, 'proof_rules are seeded');
select is((public.proof_rules() ->> 'consentVersion')::int, 1, 'and read by the accessor');
select is((select public from storage.buckets where id = 'task-proofs'), false, 'the proofs bucket is private');
select is((select file_size_limit from storage.buckets where id = 'task-proofs'), 2097152::bigint, 'it has the size limit of proofRules');
select is((select allowed_mime_types from storage.buckets where id = 'task-proofs'), array['image/jpeg'], 'and only takes jpeg');
select col_not_null('public', 'task_occurrences', 'auto_miss_at', 'auto_miss_at is never null');
-- Only this test's users: the E2E run leaves challenges of its own in the same database.
select is(
  (select count(*) from public.proof_challenges
   where user_id in (pg_temp.u('a'), pg_temp.u('b'), pg_temp.u('c'), pg_temp.u('d'), pg_temp.u('e'), pg_temp.u('f'))),
  0::bigint, 'nobody has a challenge yet');

-- Context location: all of it or none
select pg_temp.login(pg_temp.u('a'));
select lives_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon, location_address, location_lat, location_lng, location_radius_m) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'Com local', 'teal', 'x', 'Rua B, 2', -22.9, -43.2, 200)$$, 'owner creates a context with a place');
select lives_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'Sem local', 'teal', 'x')$$, 'and one without');
select throws_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon, location_address) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'So endereco', 'teal', 'x', 'Rua')$$, '23514', 'new row for relation "contexts" violates check constraint "contexts_location_check"', 'an address without a point is refused');
select throws_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon, location_lat, location_lng, location_radius_m) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'So ponto', 'teal', 'x', -22.9, -43.2, 200)$$, '23514', 'new row for relation "contexts" violates check constraint "contexts_location_check"', 'a point without an address is refused');
select throws_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon, location_address, location_lat, location_lng, location_radius_m) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'Raio', 'teal', 'x', 'Rua', -22.9, -43.2, 10)$$, '23514', 'new row for relation "contexts" violates check constraint "contexts_location_check"', 'a radius under 20 m is refused');
select throws_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon, location_address, location_lat, location_lng, location_radius_m) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'Raio', 'teal', 'x', 'Rua', -22.9, -43.2, 5001)$$, '23514', 'new row for relation "contexts" violates check constraint "contexts_location_check"', 'and over 5000 m');
select throws_ok($$insert into public.contexts (area_id, group_id, name, color_token, icon, location_address, location_lat, location_lng, location_radius_m) values ((select id from public.areas where key = 'work'), '10000000-0000-0000-0000-00000000000a', 'Lat', 'teal', 'x', 'Rua', 91, -43.2, 200)$$, '23514', 'new row for relation "contexts" violates check constraint "contexts_location_check"', 'a latitude past 90 is refused');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$update public.contexts set location_address = 'Rua C, 3', location_lat = -22.0, location_lng = -43.0, location_radius_m = 100 where name = 'Sem local'$$, 'an admin with context.manage edits the place');
select is((select location_radius_m from public.contexts where name = 'Sem local'), 100, 'and it was written');
select pg_temp.login(pg_temp.u('d'));
select is((select location_address from public.contexts where name = 'Sem local'), 'Rua C, 3', 'a member of the group reads the address');
select lives_ok($$update public.contexts set location_radius_m = 999 where name = 'Sem local'$$, 'a member without context.manage updates nothing, with no error');
select is((select location_radius_m from public.contexts where name = 'Sem local'), 100, 'because the policy hides the row from the update');
select pg_temp.login(pg_temp.u('e'));
select is((select count(*) from public.contexts where name = 'Sem local'), 0::bigint, 'an outsider does not see the place');

-- Consent columns: read by the owner, written only by record_proof_consent
select pg_temp.login(pg_temp.u('d'));
select is((select proof_consent_version from public.profiles where id = auth.uid()), 1, 'a user reads their own consent');
select throws_ok($$update public.profiles set proof_consent_version = 5 where id = auth.uid()$$, '42501', 'permission denied for table profiles', 'but cannot write it');
select throws_ok($$update public.profiles set proof_consent_at = now() where id = auth.uid()$$, '42501', 'permission denied for table profiles', 'nor its date');
select lives_ok($$update public.profiles set display_name = 'Duda B' where id = auth.uid()$$, 'while the other profile fields stay editable');

-- tasks: requires_admin_approval needs a photo and a group task (33)
select lives_ok($$insert into public.tasks (context_id, assignee_id, title, schedule_type, start_at, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'Ok approval', 'timed', now(), 'UTC', '[]', true, true, false, 'easy', 'normal', 'group')$$, 'a group task with photo and approval is saved');
select throws_ok($$insert into public.tasks (context_id, assignee_id, title, schedule_type, start_at, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'Private approval', 'timed', now(), 'UTC', '[]', true, true, false, 'easy', 'normal', 'private')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_admin_approval_check"', 'approval on a private task is refused');
select throws_ok($$insert into public.tasks (context_id, assignee_id, title, schedule_type, start_at, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'No photo approval', 'timed', now(), 'UTC', '[]', false, true, false, 'easy', 'normal', 'group')$$, '23514', 'new row for relation "tasks" violates check constraint "tasks_admin_approval_check"', 'and approval without a photo');
select throws_ok($$insert into public.tasks (context_id, assignee_id, title, schedule_type, start_at, timezone, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility, parent_task_id) values ('20000000-0000-0000-0000-00000000000a', auth.uid(), 'Child', 'timed', now(), 'UTC', '[]', true, false, false, 'easy', 'normal', 'group', gen_random_uuid())$$, '42501', 'permission denied for table tasks', 'the client cannot write parent_task_id, which would skip the occurrence of the trigger');
select pg_temp.pg();

-- ===== Fixture of the proof tests =====
select pg_temp.mkp('PH1', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.mkp('PH2', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.mkp('PH3', '20000000-0000-0000-0000-00000000000a', pg_temp.u('d'), pg_temp.u('d'), 'private');
select pg_temp.mkp('PH4', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('c'), 'group');
select pg_temp.mkp('PH5', '20000000-0000-0000-0000-00000000000a', pg_temp.u('d'), pg_temp.u('d'), 'group');
select pg_temp.mk('NP1', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days');

-- ===== Rescheduling keeps the delay (ADR-0005, section 11) =====
-- 1. Own task, overdue yesterday, moved to tomorrow: overdue_at stays, done is late
select pg_temp.mk('L1', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.sv('l1_overdue', pg_temp.overdue_of(pg_temp.occ('L1'))::text);
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('L1'), 'all', pg_temp.fform(now() + interval '30 hours', 'L1'), null, null)$$, 'the owner reschedules their own overdue task');
select pg_temp.pg();
select is(pg_temp.overdue_of(pg_temp.occ('L1')), pg_temp.g('l1_overdue')::timestamptz, 'overdue_at did not move');
select ok(pg_temp.auto_miss_of(pg_temp.occ('L1')) > pg_temp.overdue_of(pg_temp.occ('L1')), 'auto_miss_at followed the new schedule');
select ok((select scheduled_start from public.task_occurrences where id = pg_temp.occ('L1')) > now() + interval '29 hours', 'and the occurrence is on the new day');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L1'), 'done', 'pending', null)$$, 'done today is accepted, inside the window of the original deadline');
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('L1')), true, 'and it is late');
select is(pg_temp.xp(pg_temp.occ('L1')), 5::bigint, 'with the XP of done_late');
select is((select reason from public.xp_events where occurrence_id = pg_temp.occ('L1')), 'occurrence_done_late', 'recorded as late, not as occurrence_done');

-- 2. The same with partial
select pg_temp.mk('L2', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('L2'), 'all', pg_temp.fform(now() + interval '30 hours', 'L2'), null, null)$$, 'a one-off task is rescheduled');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L2'), 'partial', 'pending', 'tried')$$, 'and marked yellow');
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('L2')), true, 'yellow stays late');
select is(pg_temp.xp(pg_temp.occ('L2')), 3::bigint, 'with the XP of partial');

-- 3. Moved after the window: done is refused
select pg_temp.mk('L3', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '100 hours');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('L3'), 'all', pg_temp.fform(now() + interval '30 hours', 'L3'), null, null)$$, 'a task past the window can still be rescheduled');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('L3'), 'done', 'pending', null)$$, 'P0001', 'late_window_expired', 'but the original deadline decides the window');

-- 4. Rescheduled inside the window, resolved after the original window ended
select pg_temp.pg();
select pg_temp.mk('L4', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('L4'), 'all', pg_temp.fform(now() + interval '60 hours', 'L4'), null, null)$$, 'rescheduled inside the window');
select pg_temp.pg();
update public.task_occurrences set overdue_at = now() - interval '80 hours' where id = pg_temp.occ('L4');
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('L4'), 'done', 'pending', null)$$, 'P0001', 'late_window_expired', 'once the original window is over, done is refused');
select pg_temp.pg();

-- 5. missed -> pending by the editor, reschedule, done: late
select pg_temp.mk('L5', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
update public.task_occurrences set status = 'missed' where id = pg_temp.occ('L5');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L5'), 'pending', 'missed', null)$$, 'the editor reopens a missed occurrence');
select lives_ok($$select public.edit_task(pg_temp.occ('L5'), 'all', pg_temp.fform(now() + interval '30 hours', 'L5'), null, null)$$, 'reschedules it');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L5'), 'done', 'pending', null)$$, 'and completes it');
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('L5')), true, 'reopening does not erase the delay');

-- 6. done late, reopen, reschedule, done: still late
select pg_temp.mk('L6', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L6'), 'done', 'pending', null)$$, 'done late');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L6'), 'pending', 'done', null)$$, 'reopened');
select lives_ok($$select public.edit_task(pg_temp.occ('L6'), 'all', pg_temp.fform(now() + interval '30 hours', 'L6'), null, null)$$, 'rescheduled');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('L6'), 'done', 'pending', null)$$, 'done again');
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('L6')), true, 'it is still late');
select is(pg_temp.xp(pg_temp.occ('L6')), 5::bigint, 'and the XP is the late one, once');

-- 7. this, in a series: the same row, the same result
select pg_temp.mk('SR', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('SR', now() - interval '30 hours');
select pg_temp.mk_occ('SR', now() + interval '18 hours');
select pg_temp.sv('sr1', pg_temp.occ('SR', 1)::text);
select pg_temp.sv('sr1_overdue', pg_temp.overdue_of(pg_temp.occ('SR', 1))::text);
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.g('sr1')::uuid, 'this', pg_temp.fform(now() + interval '30 hours', 'SR one'), null, null)$$, 'this: an overdue occurrence of a series is rescheduled');
select pg_temp.pg();
select is((select task_id from public.task_occurrences where id = pg_temp.g('sr1')::uuid), pg_temp.tid('SR one'), 'it is the same row, now in the new task');
select is(pg_temp.overdue_of(pg_temp.g('sr1')::uuid), pg_temp.g('sr1_overdue')::timestamptz, 'and overdue_at did not move');

-- 8. A one-off task, by every scope
select pg_temp.mk('L8a', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.mk('L8b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.mk('L8c', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.sv('l8a', pg_temp.overdue_of(pg_temp.occ('L8a'))::text);
select pg_temp.sv('l8b', pg_temp.overdue_of(pg_temp.occ('L8b'))::text);
select pg_temp.sv('l8c', pg_temp.overdue_of(pg_temp.occ('L8c'))::text);
select pg_temp.sv('l8a_id', pg_temp.occ('L8a')::text);
select pg_temp.sv('l8b_id', pg_temp.occ('L8b')::text);
select pg_temp.sv('l8c_id', pg_temp.occ('L8c')::text);
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.g('l8a_id')::uuid, 'this', pg_temp.fform(now() + interval '30 hours', 'L8a'), null, null)$$, 'one-off, scope this');
select lives_ok($$select public.edit_task(pg_temp.g('l8b_id')::uuid, 'this_and_following', pg_temp.fform(now() + interval '30 hours', 'L8b'), null, 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'one-off, scope this_and_following');
select lives_ok($$select public.edit_task(pg_temp.g('l8c_id')::uuid, 'all', pg_temp.fform(now() + interval '30 hours', 'L8c'), null, null)$$, 'one-off, scope all');
select pg_temp.pg();
select is(pg_temp.overdue_of(pg_temp.g('l8a_id')::uuid), pg_temp.g('l8a')::timestamptz, 'this keeps the delay');
select is(pg_temp.overdue_of(pg_temp.g('l8b_id')::uuid), pg_temp.g('l8b')::timestamptz, 'this_and_following keeps it');
select is(pg_temp.overdue_of(pg_temp.g('l8c_id')::uuid), pg_temp.g('l8c')::timestamptz, 'all keeps it');

-- 9. Two reschedules in a row keep the first overdue_at
select pg_temp.mk('L9', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.sv('l9', pg_temp.overdue_of(pg_temp.occ('L9'))::text);
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('L9'), 'all', pg_temp.fform(now() + interval '30 hours', 'L9'), null, null)$$, 'first reschedule');
select lives_ok($$select public.edit_task(pg_temp.occ('L9'), 'all', pg_temp.fform(now() + interval '78 hours', 'L9'), null, null)$$, 'second reschedule');
select pg_temp.pg();
select is(pg_temp.overdue_of(pg_temp.occ('L9')), pg_temp.g('l9')::timestamptz, 'the delay is still the first one');
select ok(pg_temp.auto_miss_of(pg_temp.occ('L9')) > pg_temp.overdue_of(pg_temp.occ('L9')) + interval '24 hours', 'while auto_miss_at follows the last schedule');

-- 10. Not overdue: overdue_at follows the schedule. 11. Moved earlier: it goes down
select pg_temp.mk('L10', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() + interval '2 days');
select pg_temp.mk('L11', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() + interval '5 days');
select pg_temp.sv('l10', pg_temp.overdue_of(pg_temp.occ('L10'))::text);
select pg_temp.sv('l11', pg_temp.overdue_of(pg_temp.occ('L11'))::text);
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('L10'), 'all', pg_temp.fform(now() + interval '5 days', 'L10'), null, null)$$, 'a task not overdue is moved later');
select lives_ok($$select public.edit_task(pg_temp.occ('L11'), 'all', pg_temp.fform(now() + interval '1 day', 'L11'), null, null)$$, 'and another one earlier');
select pg_temp.pg();
select ok(pg_temp.overdue_of(pg_temp.occ('L10')) > pg_temp.g('l10')::timestamptz, 'overdue_at went with the schedule, later');
select is(pg_temp.overdue_of(pg_temp.occ('L10')), pg_temp.auto_miss_of(pg_temp.occ('L10')), 'and equals auto_miss_at');
select ok(pg_temp.overdue_of(pg_temp.occ('L11')) < pg_temp.g('l11')::timestamptz, 'moved earlier, overdue_at goes down');

-- 12. An admin with task.manage_group reschedules a member's task: new deadline
select pg_temp.mk('LA', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() - interval '30 hours');
select pg_temp.sv('la', pg_temp.overdue_of(pg_temp.occ('LA'))::text);
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.edit_task(pg_temp.occ('LA'), 'all', pg_temp.form(now() + interval '30 hours', '{"title": "LA"}'), null, null)$$, 'the admin reschedules the member''s overdue task');
select pg_temp.pg();
select ok(pg_temp.overdue_of(pg_temp.occ('LA')) > pg_temp.g('la')::timestamptz, 'the deadline moved');
select is(pg_temp.overdue_of(pg_temp.occ('LA')), pg_temp.auto_miss_of(pg_temp.occ('LA')), 'to the new schedule');
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('LA'), 'done', 'pending', null)$$, 'the member completes it');
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('LA')), false, 'on time');
select is(pg_temp.xp(pg_temp.occ('LA')), 10::bigint, 'with the full XP');

-- 13. The admin on a task of their own, or as the assignee: no forgiveness
select pg_temp.mk('LB', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('c'), 'group', now() - interval '30 hours');
select pg_temp.mk('LC', '20000000-0000-0000-0000-00000000000a', pg_temp.u('a'), pg_temp.u('c'), 'group', now() - interval '30 hours');
select pg_temp.sv('lb', pg_temp.overdue_of(pg_temp.occ('LB'))::text);
select pg_temp.sv('lc', pg_temp.overdue_of(pg_temp.occ('LC'))::text);
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.edit_task(pg_temp.occ('LB'), 'all', pg_temp.form(now() + interval '30 hours', '{"title": "LB", "assigneeId": "00000000-0000-0000-0000-00000000000c"}'), null, null)$$, 'the admin reschedules their own task');
select lives_ok($$select public.edit_task(pg_temp.occ('LC'), 'all', pg_temp.form(now() + interval '30 hours', '{"title": "LC", "assigneeId": "00000000-0000-0000-0000-00000000000c"}'), null, null)$$, 'and one assigned to them');
select pg_temp.pg();
select is(pg_temp.overdue_of(pg_temp.occ('LB')), pg_temp.g('lb')::timestamptz, 'the admin does not forgive their own delay');
select is(pg_temp.overdue_of(pg_temp.occ('LC')), pg_temp.g('lc')::timestamptz, 'nor as the assignee');

-- 14. A member with task.edit_assigned, set in the matrix inside the test: no forgiveness either
insert into public.role_permissions (role, permission_key) values ('member', 'task.edit_assigned');
select pg_temp.mk('LD', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.sv('ld', pg_temp.overdue_of(pg_temp.occ('LD'))::text);
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('LD'), 'all', pg_temp.fform(now() + interval '30 hours', 'LD'), null, null)$$, 'a member with edit_assigned reschedules the task assigned to them');
select pg_temp.pg();
select is(pg_temp.overdue_of(pg_temp.occ('LD')), pg_temp.g('ld')::timestamptz, 'task.edit_assigned does not forgive');
delete from public.role_permissions where role = 'member' and permission_key = 'task.edit_assigned';

-- 15. A schedule update without a user (a job, the service role): no forgiveness
select pg_temp.mk('LE', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.sv('le', pg_temp.overdue_of(pg_temp.occ('LE'))::text);
select pg_temp.service();
select lives_ok($$update public.task_occurrences set scheduled_start = now() + interval '30 hours', scheduled_due = now() + interval '31 hours' where id = pg_temp.occ('LE')$$, 'the service role moves an overdue occurrence');
select pg_temp.pg();
select is(pg_temp.overdue_of(pg_temp.occ('LE')), pg_temp.g('le')::timestamptz, 'and does not forgive it');

-- 16. An admin reassigns an overdue task to someone else with a new date: forgiven, unless they are one of the two
select pg_temp.mk('LF', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() - interval '30 hours');
select pg_temp.mk('LG', '20000000-0000-0000-0000-00000000000a', pg_temp.u('a'), pg_temp.u('c'), 'group', now() - interval '30 hours');
select pg_temp.mk('LH', '20000000-0000-0000-0000-00000000000a', pg_temp.u('a'), pg_temp.u('d'), 'group', now() - interval '30 hours');
select pg_temp.sv('lf', pg_temp.overdue_of(pg_temp.occ('LF'))::text);
select pg_temp.sv('lg', pg_temp.overdue_of(pg_temp.occ('LG'))::text);
select pg_temp.sv('lh', pg_temp.overdue_of(pg_temp.occ('LH'))::text);
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.edit_task(pg_temp.occ('LF'), 'all', pg_temp.fform(now() + interval '30 hours', 'LF'), null, null)$$, 'the admin reassigns Duda''s overdue task to Fred, with a new date');
select lives_ok($$select public.edit_task(pg_temp.occ('LG'), 'all', pg_temp.fform(now() + interval '30 hours', 'LG'), null, null)$$, 'the admin passes their own overdue task to Fred');
select lives_ok($$select public.edit_task(pg_temp.occ('LH'), 'all', pg_temp.form(now() + interval '30 hours', '{"title": "LH", "assigneeId": "00000000-0000-0000-0000-00000000000c"}'), null, null)$$, 'the admin takes Duda''s overdue task for themself');
select pg_temp.pg();
select ok(pg_temp.overdue_of(pg_temp.occ('LF')) > pg_temp.g('lf')::timestamptz, 'a third party with authority grants a new deadline');
select is(pg_temp.overdue_of(pg_temp.occ('LG')), pg_temp.g('lg')::timestamptz, 'the previous assignee does not');
select is(pg_temp.overdue_of(pg_temp.occ('LH')), pg_temp.g('lh')::timestamptz, 'nor the new one');

-- 17-18. this_and_following from an overdue pending occurrence
select pg_temp.mk('LI', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('LI', now() - interval '30 hours');
select pg_temp.mk_occ('LI', now() + interval '18 hours');
select pg_temp.mk('LJ', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('LJ', now() - interval '30 hours');
select pg_temp.mk_occ('LJ', now() + interval '18 hours');
select pg_temp.mk('LK', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('LK', now() - interval '30 hours');
select pg_temp.mk_occ('LK', now() + interval '18 hours');
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select public.edit_task(pg_temp.occ('LI', 1), 'this_and_following', pg_temp.fform((select scheduled_start + interval '2 hours' from public.task_occurrences where id = pg_temp.occ('LI', 1)), 'LI'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'P0001', 'overdue_occurrence_blocks_edit', 'a member cannot change the schedule from an overdue pending occurrence on');
select lives_ok($$select public.edit_task(pg_temp.occ('LK', 1), 'this_and_following', pg_temp.fform((select scheduled_start from public.task_occurrences where id = pg_temp.occ('LK', 1)), 'LK renamed'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'the same scope with only a new title goes through');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.edit_task(pg_temp.occ('LJ', 1), 'this_and_following', pg_temp.form((select scheduled_start + interval '2 hours' from public.task_occurrences where id = pg_temp.occ('LJ', 1)), '{"title": "LJ"}'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, 'the admin makes the same schedule change');
select pg_temp.pg();

-- 19-20. all, when it deletes or cancels what is overdue
select pg_temp.mk('LL', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('LL', now() - interval '30 hours');
select pg_temp.mk_occ('LL', now() + interval '18 hours');
select pg_temp.mk('LL2', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('LL2', now() + interval '18 hours');
select pg_temp.mk('LM', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() - interval '30 hours');
select pg_temp.mk('LM2', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group', now() + interval '2 days');
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select public.edit_task(pg_temp.occ('LL', 1), 'all', pg_temp.fform(now(), 'LL'), null, null)$$, 'P0001', 'overdue_occurrence_blocks_edit', 'a series cannot stop repeating while it holds an overdue pending occurrence');
select lives_ok($$select public.edit_task(pg_temp.occ('LL2', 1), 'all', pg_temp.fform(now() + interval '18 hours', 'LL2'), null, null)$$, 'the same edit with nothing overdue goes through');
select lives_ok($$select public.edit_task(pg_temp.occ('LM'), 'all', pg_temp.fform(now() + interval '30 hours', 'LM'), null, null)$$, 'a one-off task is rescheduled to the future');
select throws_ok($$select public.edit_task(pg_temp.occ('LM'), 'all', pg_temp.fform(now() + interval '30 hours', 'LM'), 'FREQ=DAILY', null)$$, 'P0001', 'overdue_occurrence_blocks_edit', 'adding a repetition would delete that overdue row and bring a new one');
select lives_ok($$select public.edit_task(pg_temp.occ('LM2'), 'all', pg_temp.fform(now() + interval '2 days', 'LM2'), 'FREQ=DAILY', null)$$, 'while adding one to a task that is not overdue is fine');
select pg_temp.pg();

-- 21. Reassigning without a schedule change reaches the rows still to be marked red
select pg_temp.mk('LN', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() - interval '3 days', 'easy', true, 'FREQ=DAILY');
select pg_temp.mk_occ('LN', now() - interval '30 hours');
select pg_temp.mk_occ('LN', now() + interval '18 hours');
select pg_temp.mk_occ('LN', now() + interval '42 hours');
select pg_temp.sv('ln_past', pg_temp.occ('LN', 1)::text);
select pg_temp.sv('ln_moved', pg_temp.occ('LN', 2)::text);
select pg_temp.sv('ln_future', pg_temp.occ('LN', 3)::text);
-- The middle one was moved: its deadline has passed, but it is not marked red until tomorrow.
update public.task_occurrences set overdue_at = now() - interval '1 hour', auto_miss_at = now() + interval '1 hour' where id = pg_temp.g('ln_moved')::uuid;
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.edit_task(pg_temp.g('ln_future')::uuid, 'all', pg_temp.form((select start_at from public.tasks where title = 'LN'), '{"title": "LN", "assigneeId": "00000000-0000-0000-0000-00000000000f"}'), 'FREQ=DAILY', null)$$, 'the admin reassigns the series without touching the schedule');
select pg_temp.pg();
select is((select assignee_id from public.task_occurrences where id = pg_temp.g('ln_moved')::uuid), pg_temp.u('f'), 'the moved row changed hands, although its overdue_at is in the past');
select is((select assignee_id from public.task_occurrences where id = pg_temp.g('ln_future')::uuid), pg_temp.u('f'), 'so did the future one');
select is((select assignee_id from public.task_occurrences where id = pg_temp.g('ln_past')::uuid), pg_temp.u('d'), 'the one the job would already mark red stays with who answered for it');

-- 22. The invariant for the rows that exist
select is((select count(*) from public.task_occurrences where auto_miss_at is null), 0::bigint, 'every row has an auto_miss_at');
select is((select count(*) from public.task_occurrences o join public.tasks t on t.id = o.task_id where t.title in ('NP1', 'PH1', 'L10') and o.auto_miss_at <> o.overdue_at), 0::bigint, 'and a row never moved has auto_miss_at = overdue_at');

-- ===== Section 9 of the spec: nobody turns a photo task green =====
-- 23. A member does not mark green
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH1'), 'done', 'pending', null)$$, 'P0001', 'proof_required', 'the assignee cannot mark a photo task green');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH5'), 'done', 'pending', null)$$, 'P0001', 'proof_required', 'nor can the owner of a task of their own');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('NP1'), 'done', 'pending', null)$$, 'while a task without photo is completed as before');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('PH5'), 'partial', 'pending', null)$$, 'and yellow does not ask for a photo');

-- 25. Admin, editor and owner, from pending and from missed
select pg_temp.pg();
update public.task_occurrences set status = 'missed' where id = pg_temp.occ('PH2');
select pg_temp.login(pg_temp.u('c'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH1'), 'done', 'pending', null)$$, 'P0001', 'proof_required', 'the admin cannot mark it green either');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH2'), 'done', 'missed', null)$$, 'P0001', 'proof_required', 'nor from missed');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH1'), 'done', 'pending', null)$$, 'P0001', 'proof_required', 'the group owner cannot');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH2'), 'done', 'missed', null)$$, 'P0001', 'proof_required', 'from missed neither');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('PH2'), 'done', 'missed', null)$$, 'P0001', 'proof_required', 'and the assignee from missed');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('NP1'), 'pending', 'done', null)$$, 'while the admin reopens a task without photo');
select is(pg_temp.status_of(pg_temp.occ('PH1')), 'pending', 'and no photo task changed');
select pg_temp.pg();
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('PH2');

-- 26. The service role cannot update a status to done without a proof
select pg_temp.service();
select throws_ok($$update public.task_occurrences set status = 'done' where id = pg_temp.occ('PH1')$$, 'P0001', 'proof_required', 'service role: done without a proof fails');
select throws_ok($$update public.task_occurrences set status = 'done', proof_review_status = 'approved' where id = pg_temp.occ('PH1')$$, 'P0001', 'proof_required', 'even when it claims the proof was approved');
select lives_ok($$update public.task_occurrences set status = 'partial' where id = pg_temp.occ('PH1')$$, 'while partial is a plain update');
select lives_ok($$update public.task_occurrences set status = 'pending' where id = pg_temp.occ('PH1')$$, 'and so is the reopening');
select pg_temp.pg();

-- 27. An insert of a resolved occurrence in a photo task fails
select pg_temp.mkp('PHR', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', false, true, 'FREQ=DAILY');
select pg_temp.service();
select throws_ok($$insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due, status) values (pg_temp.tid('PHR'), pg_temp.u('d'), now() + interval '1 day', now() + interval '2 days', 'done')$$, 'P0001', 'proof_required', 'service role: an occurrence born done in a photo task fails');
select throws_ok($$insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due, status) values (pg_temp.tid('PHR'), pg_temp.u('d'), now() + interval '1 day', now() + interval '2 days', 'cancelled')$$, 'P0001', 'proof_required', 'and born in any state but pending');
select lives_ok($$insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due) values (pg_temp.tid('PHR'), pg_temp.u('d'), now() + interval '1 day', now() + interval '2 days')$$, 'while a pending one is what the materialization inserts');
select lives_ok($$insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due, status) values (pg_temp.tid('NP1'), pg_temp.u('d'), now() + interval '9 days', now() + interval '10 days', 'done')$$, 'and a task without photo accepts a resolved row, as before');
select pg_temp.pg();

-- 29. Nobody but the service role calls claim_proof_challenge and commit_proof
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.claim_proof_challenge(gen_random_uuid(), auth.uid())$$, '42501', 'permission denied for function claim_proof_challenge', 'authenticated cannot call claim_proof_challenge');
select throws_ok($$select public.commit_proof(gen_random_uuid(), auth.uid(), 'x', 'x', 1, 1, 1, now(), null, null, '{}', 'web', '1', 'x')$$, '42501', 'permission denied for function commit_proof', 'nor commit_proof');
select pg_temp.pg();
set local role anon;
select throws_ok($$select public.claim_proof_challenge(gen_random_uuid(), gen_random_uuid())$$, '42501', 'permission denied for function claim_proof_challenge', 'anon cannot either');
select throws_ok($$select public.commit_proof(gen_random_uuid(), gen_random_uuid(), 'x', 'x', 1, 1, 1, now(), null, null, '{}', 'web', '1', 'x')$$, '42501', 'permission denied for function commit_proof', 'anon cannot commit');
select throws_ok($$select public.issue_proof_challenge(gen_random_uuid())$$, '42501', 'permission denied for function issue_proof_challenge', 'anon cannot ask for a challenge');
select throws_ok($$select public.review_proof(gen_random_uuid(), 'approve', null, null)$$, '42501', 'permission denied for function review_proof', 'anon cannot review');
select pg_temp.service();
select throws_ok($$select public.claim_proof_challenge(gen_random_uuid(), gen_random_uuid())$$, 'P0001', 'challenge_invalid', 'the service role may call claim_proof_challenge, and an unknown nonce is invalid');
select throws_ok($$select public.commit_proof(gen_random_uuid(), gen_random_uuid(), 'x', 'x', 1, 1, 1, now(), null, null, '{}', 'web', '1', 'x')$$, 'P0001', 'challenge_invalid', 'and commit_proof, which refuses a nonce it does not know');
select pg_temp.pg();
select is(has_function_privilege('authenticated', 'public.claim_proof_challenge(uuid, uuid)', 'execute'), false, 'authenticated: no execute on claim_proof_challenge');
select is(has_function_privilege('service_role', 'public.claim_proof_challenge(uuid, uuid)', 'execute'), true, 'service_role: execute on claim_proof_challenge');
select is(has_function_privilege('authenticated', 'public.commit_proof(uuid, uuid, text, text, int, int, int, timestamptz, int, int, text[], text, text, text)', 'execute'), false, 'authenticated: no execute on commit_proof');
select is(has_function_privilege('service_role', 'public.commit_proof(uuid, uuid, text, text, int, int, int, timestamptz, int, int, text[], text, text, text)', 'execute'), true, 'service_role: execute on commit_proof');
select is(has_function_privilege('authenticated', 'public.proofs_due_for_retention(int)', 'execute'), false, 'authenticated: no execute on the retention listing');
select is(has_function_privilege('authenticated', 'public.mark_proof_photo_deleted(uuid)', 'execute'), false, 'nor on mark_proof_photo_deleted');
select is(has_function_privilege('authenticated', 'public.orphan_proof_objects(int)', 'execute'), false, 'nor on the orphan listing');
select is(has_function_privilege('authenticated', 'public.delete_stale_proof_challenges()', 'execute'), false, 'nor on the challenge cleanup');
select is(has_function_privilege('authenticated', 'public.call_proof_retention()', 'execute'), false, 'nor on the cron call');
select is(has_function_privilege('authenticated', 'public.occurrence_award_xp(public.task_occurrences)', 'execute'), false, 'nor on the XP function');
select is(has_function_privilege('authenticated', 'public.occurrence_forgives_overdue(uuid, public.task_visibility, uuid, uuid)', 'execute'), false, 'nor on the forgiveness rule');
select is(has_function_privilege('authenticated', 'public.proof_rules()', 'execute'), false, 'nor on proof_rules');
select is(has_function_privilege('authenticated', 'public.proof_user_can(uuid, uuid, text)', 'execute'), false, 'nor on proof_user_can');
select is(has_function_privilege('authenticated', 'public.proof_assert_open(public.task_occurrences, uuid, timestamptz, timestamptz)', 'execute'), false, 'nor on proof_assert_open');
select is(has_function_privilege('authenticated', 'public.occurrences_before_insert()', 'execute'), false, 'nor on the insert trigger function');
select is(has_function_privilege('authenticated', 'public.task_proofs_before_update()', 'execute'), false, 'nor on the immutability trigger function');
select is(has_function_privilege('anon', 'public.issue_proof_challenge(uuid)', 'execute'), false, 'anon: no execute on issue_proof_challenge');
select is(has_function_privilege('authenticated', 'public.issue_proof_challenge(uuid)', 'execute'), true, 'authenticated: execute on issue_proof_challenge');
select is(has_function_privilege('authenticated', 'public.review_proof(uuid, text, public.occurrence_status, text)', 'execute'), true, 'authenticated: execute on review_proof');
select is(has_function_privilege('authenticated', 'public.record_proof_consent(int)', 'execute'), true, 'authenticated: execute on record_proof_consent');

-- Every function in public: closed to PUBLIC and anon, and open to authenticated only on the intended list.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (has_function_privilege('anon', p.oid, 'execute')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  0::bigint, 'no function in public is executable by anon or PUBLIC');
select is(
  (select string_agg(proname, ',' order by proname collate "C") from (
    select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')) s),
  'accept_invite,can_delete_task,can_edit_task,can_review_proof,can_view_proof,can_view_task,delete_task,edit_task,generate_invite_code,get_invite_preview,group_member_profiles,has_permission,is_group_member,is_valid_rrule,is_valid_timezone,issue_proof_challenge,record_proof_consent,review_proof,set_member_role,set_occurrence_status,team_overview,transfer_group_ownership',
  'the functions open to authenticated are exactly the intended ones');

-- 30. The client does not read or write the challenges
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH1'))$$, 'the assignee asks for a challenge');
select pg_temp.pg();
select is((select count(*) from public.proof_challenges where user_id = pg_temp.u('d')), 1::bigint, 'and the row exists');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select * from public.proof_challenges$$, '42501', 'permission denied for table proof_challenges', 'authenticated cannot read the challenges');
select throws_ok($$insert into public.proof_challenges (occurrence_id, user_id, expires_at) values (pg_temp.occ('PH1'), auth.uid(), now() + interval '1 day')$$, '42501', 'permission denied for table proof_challenges', 'cannot write one');
select throws_ok($$update public.proof_challenges set used_at = null$$, '42501', 'permission denied for table proof_challenges', 'cannot reset one');
select throws_ok($$delete from public.proof_challenges$$, '42501', 'permission denied for table proof_challenges', 'nor delete');
select pg_temp.pg();
set local role anon;
select throws_ok($$select * from public.proof_challenges$$, '42501', 'permission denied for table proof_challenges', 'anon cannot read them');
select pg_temp.pg();
select is((select relrowsecurity from pg_class where oid = 'public.proof_challenges'::regclass), true, 'RLS is on for the challenges');
select is((select count(*) from pg_policies where tablename in ('proof_challenges')), 0::bigint, 'with no policy at all');

-- ===== The challenge (34) =====
-- No session, not visible, archived
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH1'))$$, '42501', 'forbidden', 'no session: forbidden');
select pg_temp.login(pg_temp.u('e'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH1'))$$, '42501', 'forbidden', 'an outsider: forbidden');
select throws_ok($$select public.issue_proof_challenge(gen_random_uuid())$$, '42501', 'forbidden', 'an occurrence that does not exist looks the same');
select pg_temp.pg();
update public.tasks set archived_at = now() where title = 'PH4';
select pg_temp.login(pg_temp.u('c'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH4'))$$, '42501', 'forbidden', 'an archived task: forbidden');
select pg_temp.pg();
update public.tasks set archived_at = null where title = 'PH4';
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH4'))$$, 'and the same occurrence unarchived gets its challenge');
-- Not the assignee
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH1'))$$, '42501', 'forbidden', 'the admin, who is not the assignee, cannot send the proof');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH1'))$$, '42501', 'forbidden', 'nor the group owner');
-- Left the group
select pg_temp.pg();
select pg_temp.mkp('PHF', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group');
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('f');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PHF'))$$, 'Fred, a member, asks for a challenge');
select pg_temp.pg();
delete from public.group_members where user_id = pg_temp.u('f');
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHF'))$$, '42501', 'forbidden', 'and after leaving the group it is forbidden');
select pg_temp.pg();
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000a', pg_temp.u('f'), 'member');
update public.profiles set proof_consent_version = null where id = pg_temp.u('f');
-- Not required, not open, disputed
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('NP1'))$$, 'P0001', 'proof_not_required', 'a task without photo: proof_not_required');
select pg_temp.pg();
select pg_temp.mkp('PHS', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
update public.task_occurrences set status = 'partial' where id = pg_temp.occ('PHS');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'P0001', 'occurrence_not_open', 'partial: occurrence_not_open');
select pg_temp.pg();
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('PHS');
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('PHS');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'P0001', 'occurrence_not_open', 'cancelled: occurrence_not_open');
select pg_temp.pg();
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('PHS');
update public.task_occurrences set status = 'missed', proof_review_status = 'disputed' where id = pg_temp.occ('PHS');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'P0001', 'proof_disputed', 'a disputed proof: proof_disputed');
select pg_temp.pg();
update public.task_occurrences set status = 'pending', proof_review_status = null where id = pg_temp.occ('PHS');
-- Window
update public.task_occurrences set overdue_at = now() - interval '80 hours' where id = pg_temp.occ('PHS');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'P0001', 'late_window_expired', 'past the window: late_window_expired');
select pg_temp.pg();
update public.task_occurrences set overdue_at = now() - interval '80 hours' where id = pg_temp.occ('PH4');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH4'))$$, 'but an admin who is the assignee and has task.manage_group has no window');
select pg_temp.pg();
update public.task_occurrences set overdue_at = now() - interval '10 hours' where id = pg_temp.occ('PHS');
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'and inside the window the member gets one');
-- Consent
select pg_temp.pg();
select pg_temp.mkp('PHG', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group');
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHG'))$$, 'P0001', 'proof_consent_required', 'without the notice accepted: proof_consent_required');
select throws_ok($$select public.record_proof_consent(2)$$, '22023', 'invalid_consent_version', 'the consent only takes the current version');
select throws_ok($$select public.record_proof_consent(0)$$, '22023', 'invalid_consent_version', 'not an older one either');
select lives_ok($$select public.record_proof_consent(1)$$, 'the current version is recorded');
select is((select proof_consent_version from public.profiles where id = auth.uid()), 1, 'with its version');
select ok((select proof_consent_at from public.profiles where id = auth.uid()) is not null, 'and its date');
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PHG'))$$, 'and then the challenge is issued');
select pg_temp.pg();
-- A new notice version asks everyone again (39)
update public.app_settings set value = jsonb_set(value, '{consentVersion}', '2') where key = 'proof_rules';
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'P0001', 'proof_consent_required', 'after consentVersion goes up, an old acceptance is not enough');
select throws_ok($$select public.record_proof_consent(1)$$, '22023', 'invalid_consent_version', 'and the old version cannot be recorded again');
select lives_ok($$select public.record_proof_consent(2)$$, 'the new version can');
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PHS'))$$, 'and then the challenge is issued');
select pg_temp.pg();
update public.app_settings set value = jsonb_set(value, '{consentVersion}', '1') where key = 'proof_rules';
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('d');
-- The order of the table: the first failing line is the one reported
select pg_temp.mk('NPX', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days');
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('NPX');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('NPX'))$$, 'P0001', 'proof_not_required', 'not required comes before not open');
select pg_temp.pg();
update public.profiles set proof_consent_version = null where id = pg_temp.u('d');
update public.task_occurrences set status = 'partial' where id = pg_temp.occ('PH5');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'P0001', 'occurrence_not_open', 'not open comes before the missing consent');
select pg_temp.pg();
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('PH5');
update public.task_occurrences set overdue_at = now() - interval '80 hours' where id = pg_temp.occ('PH5');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'P0001', 'late_window_expired', 'the window comes before the missing consent');
select pg_temp.pg();
update public.task_occurrences set overdue_at = now() + interval '1 day' where id = pg_temp.occ('PH5');
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('d');
-- The shape of the answer
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('ok_challenge', public.issue_proof_challenge(pg_temp.occ('PH5'))::text);
select pg_temp.pg();
select is((pg_temp.g('ok_challenge')::jsonb ->> 'expiresInSeconds')::int, 300, 'the answer carries a duration, not an instant');
select is((pg_temp.g('ok_challenge')::jsonb ->> 'checkLocation')::boolean, false, 'a context without a place does not ask for the position');
select is((select user_id from public.proof_challenges where id = (pg_temp.g('ok_challenge')::jsonb ->> 'nonce')::uuid), pg_temp.u('d'), 'the nonce belongs to the user');
select is((select used_at from public.proof_challenges where id = (pg_temp.g('ok_challenge')::jsonb ->> 'nonce')::uuid), null, 'unused');
select is((select expires_at - created_at from public.proof_challenges where id = (pg_temp.g('ok_challenge')::jsonb ->> 'nonce')::uuid), interval '300 seconds', 'and valid for the configured time');
select pg_temp.mkp('PHL', '20000000-0000-0000-0000-00000000000c', pg_temp.u('a'), pg_temp.u('d'), 'group');
select pg_temp.login(pg_temp.u('d'));
select is((public.issue_proof_challenge(pg_temp.occ('PHL')) ->> 'checkLocation')::boolean, true, 'a context with a place asks the app for the position');
select pg_temp.pg();

-- 35-37. The nonce: another user, used twice, expired
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('n35', public.issue_proof_challenge(pg_temp.occ('PH1')) ->> 'nonce');
select pg_temp.pg();
select pg_temp.service();
select throws_ok($$select public.claim_proof_challenge(pg_temp.g('n35')::uuid, pg_temp.u('c'))$$, 'P0001', 'challenge_invalid', 'another user''s nonce is invalid');
select throws_ok($$select public.claim_proof_challenge(gen_random_uuid(), pg_temp.u('d'))$$, 'P0001', 'challenge_invalid', 'and so is one that does not exist');
select is((public.claim_proof_challenge(pg_temp.g('n35')::uuid, pg_temp.u('d')) ->> 'occurrenceId')::uuid, pg_temp.occ('PH1'), 'the owner claims it, and gets the occurrence back');
select throws_ok($$select public.claim_proof_challenge(pg_temp.g('n35')::uuid, pg_temp.u('d'))$$, 'P0001', 'challenge_used', 'a second claim of the same nonce: challenge_used');
select pg_temp.pg();
select ok((select used_at from public.proof_challenges where id = pg_temp.g('n35')::uuid) is not null, 'used_at holds the time of receipt');
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('n37', (public.issue_proof_challenge(pg_temp.occ('PH2')) ->> 'nonce'));
select pg_temp.pg();
update public.proof_challenges set created_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes' where id = pg_temp.g('n37')::uuid;
select pg_temp.service();
select throws_ok($$select public.claim_proof_challenge(pg_temp.g('n37')::uuid, pg_temp.u('d'))$$, 'P0001', 'challenge_expired', 'an expired nonce: challenge_expired');
select pg_temp.pg();
select is((select used_at from public.proof_challenges where id = pg_temp.g('n37')::uuid), null, 'and it was not consumed');
-- The occurrence changes between the issue and the claim: nothing is consumed
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('n37b', (public.issue_proof_challenge(pg_temp.occ('PH2')) ->> 'nonce'));
select pg_temp.pg();
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('PH2');
select pg_temp.service();
select throws_ok($$select public.claim_proof_challenge(pg_temp.g('n37b')::uuid, pg_temp.u('d'))$$, 'P0001', 'occurrence_not_open', 'claim re-checks the occurrence: cancelled meanwhile');
select pg_temp.pg();
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('PH2');

-- 38. The limits (the table is cleaned first so the counts start from zero)
delete from public.proof_challenges;
-- 31st per hour per user: 29 from the past minutes on other occurrences, then the 30th passes and the 31st does not
insert into public.proof_challenges (occurrence_id, user_id, created_at, expires_at)
select pg_temp.occ(case n % 3 when 0 then 'PH1' when 1 then 'PH2' else 'PH3' end), pg_temp.u('d'), now() - interval '1 minute', now() + interval '1 minute'
from generate_series(1, 27) n;
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'the 28th challenge of the hour');
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'the 29th');
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'the 30th');
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'P0001', 'challenge_rate_limited', 'the 31st of the hour is refused');
select pg_temp.pg();
-- an hour later the same user is free again
update public.proof_challenges set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour 55 minutes' where user_id = pg_temp.u('d');
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH5'))$$, 'challenges older than an hour stop counting');
select pg_temp.pg();
-- 11th per occurrence: Caio, on a task of his own
delete from public.proof_challenges;
insert into public.proof_challenges (occurrence_id, user_id, created_at, expires_at)
select pg_temp.occ('PH4'), pg_temp.u('c'), now() - interval '1 minute', now() + interval '1 minute' from generate_series(1, 9) n;
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PH4'))$$, 'the 10th challenge on the same occurrence');
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PH4'))$$, 'P0001', 'challenge_rate_limited', 'the 11th on the occurrence is refused');
select pg_temp.pg();
-- 30 proofs in the day: Alice has 30 received two hours ago
delete from public.proof_challenges;
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('a');
select pg_temp.mkp('PHA', '20000000-0000-0000-0000-00000000000a', pg_temp.u('a'), pg_temp.u('a'), 'group');
insert into public.proof_challenges (id, occurrence_id, user_id, created_at, expires_at, used_at)
select ('90000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, pg_temp.occ('PH5'), pg_temp.u('a'),
  now() - interval '2 hours', now() - interval '115 minutes', now() - interval '2 hours' from generate_series(1, 30) n;
insert into public.task_proofs (occurrence_id, challenge_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds)
select pg_temp.occ('PH5'), ('90000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, pg_temp.u('a'), lpad(to_hex(1000000 + n), 64, '0'), 100, 640, 480,
  now() - interval '2 hours', now() - interval '2 hours', 0 from generate_series(1, 29) n;
select pg_temp.login(pg_temp.u('a'));
select lives_ok($$select public.issue_proof_challenge(pg_temp.occ('PHA'))$$, '29 proofs in the day still leave room for one more challenge');
select pg_temp.pg();
insert into public.task_proofs (occurrence_id, challenge_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds)
values (pg_temp.occ('PH5'), '90000000-0000-0000-0000-000000000030', pg_temp.u('a'), lpad(to_hex(1000030), 64, '0'), 100, 640, 480, now() - interval '2 hours', now() - interval '2 hours', 0);
delete from public.proof_challenges where user_id = pg_temp.u('a') and used_at is null;
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHA'))$$, 'P0001', 'challenge_rate_limited', 'with 30 proofs in the day, the next challenge is refused');
select pg_temp.pg();
update public.task_proofs set superseded_at = now() where user_id = pg_temp.u('a');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('PHA'))$$, 'P0001', 'challenge_rate_limited', 'superseded proofs still count: the photo is stored until retention');
select pg_temp.pg();
delete from public.task_proofs where user_id = pg_temp.u('a');
delete from public.proof_challenges where user_id = pg_temp.u('a');

-- ===== commit_proof =====
-- 40-41. Author as status_changed_by and changed_by; unreviewed with XP now
select pg_temp.sv('claims_before', coalesce(current_setting('request.jwt.claims', true), ''));
select pg_temp.sv('p1', (pg_temp.prove(pg_temp.u('d'), pg_temp.occ('PH1')))::text);
select is(pg_temp.status_of(pg_temp.occ('PH1')), 'done', 'the proof takes the occurrence to done');
select is((pg_temp.g('p1')::jsonb ->> 'reviewStatus'), 'unreviewed', 'without approval it is unreviewed');
select is((pg_temp.g('p1')::jsonb ->> 'status'), 'done', 'the answer follows proofResultSchema');
select is(jsonb_typeof(pg_temp.g('p1')::jsonb -> 'flags'), 'array', 'with flags as an array');
select is((select status_changed_by from public.task_occurrences where id = pg_temp.occ('PH1')), pg_temp.u('d'), 'status_changed_by is the author, not null');
select is((select changed_by from public.task_status_history where occurrence_id = pg_temp.occ('PH1') and to_status = 'done'), pg_temp.u('d'), 'and so is the history line');
select is(pg_temp.xp(pg_temp.occ('PH1')), 10::bigint, 'without approval the XP is granted at once');
select is(pg_temp.review_of(pg_temp.occ('PH1')), 'unreviewed', 'the occurrence carries the review state');
select is((select current_proof_id from public.task_occurrences where id = pg_temp.occ('PH1')), (pg_temp.g('p1')::jsonb ->> 'proofId')::uuid, 'and points at the proof');
select is((select user_id from public.task_proofs where id = (pg_temp.g('p1')::jsonb ->> 'proofId')::uuid), pg_temp.u('d'), 'which is the author''s');
-- The impersonation of commit_proof does not outlive the call, even inside the same transaction
select is(pg_temp.g('ca'), pg_temp.g('cb'), 'the claims after commit_proof are the ones the caller had');
select is(pg_temp.g('ua'), 'null', 'and auth.uid() is empty again right after it, for the next statement');
select is(pg_temp.g('cb'), '{"role": "service_role"}', 'the caller was the service role, with no user');
select is(coalesce(current_setting('request.jwt.claims', true), ''), '', 'nothing of the author is left in the transaction');
select is((select count(*) from public.task_proofs where occurrence_id = pg_temp.occ('PH1')), 1::bigint, 'one proof was written');

-- 41. With approval: in_review, no XP
select pg_temp.mkp('C41', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.sv('p41', pg_temp.prove(pg_temp.u('d'), pg_temp.occ('C41'))::text);
select is(pg_temp.status_of(pg_temp.occ('C41')), 'done', 'with approval the occurrence is done too');
select is(pg_temp.review_of(pg_temp.occ('C41')), 'in_review', 'but in review');
select is(pg_temp.g('p41')::jsonb ->> 'reviewStatus', 'in_review', 'and the answer says so');
select is(pg_temp.xp_count(pg_temp.occ('C41')), 0::bigint, 'and the XP waits');
select is((select review_status::text from public.task_proofs where occurrence_id = pg_temp.occ('C41')), 'in_review', 'the proof is in review as well');
select is(pg_temp.hist(pg_temp.occ('C41')), 'pending>done:in_review', 'the history says it');

-- 42. Received before the deadline and committed after it: not late
select pg_temp.mkp('C42', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.sv('n42', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C42'))::text);
update public.proof_challenges set created_at = now() - interval '12 minutes', used_at = now() - interval '10 minutes' where id = pg_temp.g('n42')::uuid;
update public.task_occurrences set overdue_at = now() - interval '5 minutes' where id = pg_temp.occ('C42');
select lives_ok($$select pg_temp.commit(pg_temp.g('n42')::uuid, pg_temp.u('d'))$$, 'the commit comes after the deadline');
select is(pg_temp.late_of(pg_temp.occ('C42')), false, 'the time of receipt counts, so it is not late');
select is(pg_temp.xp(pg_temp.occ('C42')), 10::bigint, 'and the XP is the full one');
select is((select received_at from public.task_proofs where occurrence_id = pg_temp.occ('C42')), (select used_at from public.proof_challenges where id = pg_temp.g('n42')::uuid), 'received_at is the instant the challenge was used');
select is((select clock_delta_seconds from public.task_proofs where occurrence_id = pg_temp.occ('C42')), -600, 'clock_delta_seconds is received_at minus the device time');

-- 43. Received after the deadline: done_late
select pg_temp.mkp('C43', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
update public.task_occurrences set overdue_at = now() - interval '1 hour' where id = pg_temp.occ('C43');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('C43'));
select is(pg_temp.late_of(pg_temp.occ('C43')), true, 'received after the deadline: late');
select is(pg_temp.xp(pg_temp.occ('C43')), 5::bigint, 'with the XP of done_late');
select is((select reason from public.xp_events where occurrence_id = pg_temp.occ('C43')), 'occurrence_done_late', 'recorded as such');

-- 44. missed -> done, inside the window and outside it
select pg_temp.mkp('C44', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
update public.task_occurrences set status = 'missed', overdue_at = now() - interval '10 hours' where id = pg_temp.occ('C44');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('C44'));
select is(pg_temp.status_of(pg_temp.occ('C44')), 'done', 'missed -> done through a proof inside the window');
select is(pg_temp.late_of(pg_temp.occ('C44')), true, 'and it is late');
select pg_temp.mkp('C44b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
update public.task_occurrences set status = 'missed', overdue_at = now() - interval '100 hours' where id = pg_temp.occ('C44b');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('C44b'))$$, 'P0001', 'late_window_expired', 'outside the window the member cannot even ask for a challenge');
select pg_temp.pg();
-- The window is re-checked at the claim and at the commit, with the time of receipt
select pg_temp.mkp('C44c', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('n44c', public.issue_proof_challenge(pg_temp.occ('C44c')) ->> 'nonce');
select pg_temp.pg();
update public.task_occurrences set overdue_at = now() - interval '100 hours' where id = pg_temp.occ('C44c');
select pg_temp.service();
select throws_ok($$select public.claim_proof_challenge(pg_temp.g('n44c')::uuid, pg_temp.u('d'))$$, 'P0001', 'late_window_expired', 'the claim re-checks the window');
select pg_temp.pg();

-- 45. Cancelled, reassigned or reopened between the claim and the commit: no row is created
select pg_temp.mkp('C45a', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.mkp('C45b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.mkp('C45c', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.mkp('C45d', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.sv('n45a', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C45a'))::text);
select pg_temp.sv('n45b', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C45b'))::text);
select pg_temp.sv('n45c', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C45c'))::text);
select pg_temp.sv('n45d', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C45d'))::text);
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('C45a');
update public.task_occurrences set assignee_id = pg_temp.u('f') where id = pg_temp.occ('C45b');
update public.proof_challenges set created_at = now() - interval '1 hour' where id = pg_temp.g('n45c')::uuid;
update public.task_occurrences set status = 'cancelled' where id = pg_temp.occ('C45c');
update public.task_occurrences set status = 'pending' where id = pg_temp.occ('C45c');
update public.task_occurrences set status = 'partial' where id = pg_temp.occ('C45d');
select throws_ok($$select pg_temp.commit(pg_temp.g('n45a')::uuid, pg_temp.u('d'))$$, 'P0001', 'occurrence_not_open', 'cancelled in between: occurrence_not_open');
select throws_ok($$select pg_temp.commit(pg_temp.g('n45b')::uuid, pg_temp.u('d'))$$, '42501', 'forbidden', 'reassigned in between: forbidden');
select throws_ok($$select pg_temp.commit(pg_temp.g('n45c')::uuid, pg_temp.u('d'))$$, 'P0001', 'challenge_invalid', 'cancelled and reopened in between: the challenge is no longer valid');
select throws_ok($$select pg_temp.commit(pg_temp.g('n45d')::uuid, pg_temp.u('d'))$$, 'P0001', 'occurrence_not_open', 'marked yellow in between: occurrence_not_open');
select is((select count(*) from public.task_proofs where occurrence_id in (pg_temp.occ('C45a'), pg_temp.occ('C45b'), pg_temp.occ('C45c'), pg_temp.occ('C45d'))), 0::bigint, 'and none of them left a proof');
select is((select count(*) from public.xp_events where occurrence_id in (pg_temp.occ('C45a'), pg_temp.occ('C45b'), pg_temp.occ('C45c'))), 0::bigint, 'or XP');
select pg_temp.mkp('C45e', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.sv('n45e', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C45e'))::text);
update public.tasks set requires_photo_proof = false where title = 'C45e';
select throws_ok($$select pg_temp.commit(pg_temp.g('n45e')::uuid, pg_temp.u('d'))$$, 'P0001', 'proof_not_required', 'the flag turned off in between: proof_not_required');
update public.tasks set requires_photo_proof = true, archived_at = now() where title = 'C45e';
select throws_ok($$select pg_temp.commit(pg_temp.g('n45e')::uuid, pg_temp.u('d'))$$, '42501', 'forbidden', 'an archived task in between: forbidden');
update public.tasks set archived_at = null where title = 'C45e';
select lives_ok($$select pg_temp.commit(pg_temp.g('n45e')::uuid, pg_temp.u('d'))$$, 'and with everything back as it was, the same nonce commits');

-- 46. An assignee who left the group
select pg_temp.mkp('C46', '20000000-0000-0000-0000-00000000000b', pg_temp.u('b'), pg_temp.u('d'), 'group');
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('d');
select pg_temp.sv('n46', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C46'))::text);
delete from public.group_members where user_id = pg_temp.u('d') and group_id = '10000000-0000-0000-0000-00000000000b';
select throws_ok($$select pg_temp.commit(pg_temp.g('n46')::uuid, pg_temp.u('d'))$$, '42501', 'forbidden', 'a user who left the group cannot commit');
select is((select count(*) from public.task_proofs where occurrence_id = pg_temp.occ('C46')), 0::bigint, 'and no proof was written');
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000b', pg_temp.u('d'), 'member');

-- 47. The same bytes again
select pg_temp.mkp('C47', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.sv('n47', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C47'))::text);
select throws_ok($$select pg_temp.commit(pg_temp.g('n47')::uuid, pg_temp.u('d'), '{}', (select sha256 from public.task_proofs where occurrence_id = pg_temp.occ('PH1')))$$, '23505', 'proof_duplicate', 'the same hash is a duplicate');
select is(pg_temp.status_of(pg_temp.occ('C47')), 'pending', 'and the occurrence did not move');
select lives_ok($$select pg_temp.commit(pg_temp.g('n47')::uuid, pg_temp.u('d'))$$, 'the failed commit rolled back, so the claimed nonce takes other bytes');
-- Other rejections of commit_proof
select pg_temp.mkp('C47b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.sv('n47b', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('C47b'))::text);
select pg_temp.service();
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('c'), 'x', pg_temp.sha(), 1000, 640, 480, now(), null, null, '{}', 'web', '1', 'x')$$, 'P0001', 'challenge_invalid', 'a nonce is only committed by who it was issued to');
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), 'x', pg_temp.sha(), 1000, 640, 480, now(), null, null, '{}', 'web', '1', 'x')$$, '22023', 'invalid_storage_path', 'the path comes from the nonce and the occurrence, not from the caller');
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), pg_temp.occ('C47b')::text || '/' || pg_temp.g('n47b') || '.jpg', pg_temp.sha(), 2097153, 640, 480, now(), null, null, '{}', 'web', '1', 'x')$$, 'P0001', 'proof_too_large', 'a proof over the size limit is refused');
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), pg_temp.occ('C47b')::text || '/' || pg_temp.g('n47b') || '.jpg', pg_temp.sha(), 1000, 100, 480, now(), null, null, '{}', 'web', '1', 'x')$$, 'P0001', 'proof_bad_dimensions', 'one under the minimum edge');
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), pg_temp.occ('C47b')::text || '/' || pg_temp.g('n47b') || '.jpg', pg_temp.sha(), 1000, 640, 4000, now(), null, null, '{}', 'web', '1', 'x')$$, 'P0001', 'proof_bad_dimensions', 'or over the maximum');
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), pg_temp.occ('C47b')::text || '/' || pg_temp.g('n47b') || '.jpg', 'XYZ', 1000, 640, 480, now(), null, null, '{}', 'web', '1', 'x')$$, '23514', 'new row for relation "task_proofs" violates check constraint "task_proofs_sha256_check"', 'a hash that is not 64 lowercase hexadecimals');
select throws_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), pg_temp.occ('C47b')::text || '/' || pg_temp.g('n47b') || '.jpg', pg_temp.sha(), 1000, 640, 480, now(), null, null, '{nonsense}', 'web', '1', 'x')$$, '23514', 'new row for relation "task_proofs" violates check constraint "task_proofs_flags_check"', 'flags are the three the contract names');
select lives_ok($$select public.commit_proof(pg_temp.g('n47b')::uuid, pg_temp.u('d'), pg_temp.occ('C47b')::text || '/' || pg_temp.g('n47b') || '.jpg', pg_temp.sha(), 2097152, 320, 2048, now() + interval '100 years', 12, 5, '{out_of_radius,clock_mismatch,out_of_radius}', 'ios', '1.2.3', 'ua')$$, 'while the limits themselves pass, the future device clock too');
select pg_temp.pg();
select is((select flags from public.task_proofs where occurrence_id = pg_temp.occ('C47b')), array['clock_mismatch', 'out_of_radius'], 'flags are stored once, in order');
select ok((select clock_delta_seconds from public.task_proofs where occurrence_id = pg_temp.occ('C47b')) = -2147483648, 'a device clock a century ahead is clamped instead of overflowing');
select is((select distance_m from public.task_proofs where occurrence_id = pg_temp.occ('C47b')), 12, 'the distance is kept');

-- Commit without a claim
select pg_temp.mkp('C47c', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.login(pg_temp.u('d'));
select pg_temp.sv('n47c', (public.issue_proof_challenge(pg_temp.occ('C47c')) ->> 'nonce'));
select pg_temp.pg();
select throws_ok($$select pg_temp.commit(pg_temp.g('n47c')::uuid, pg_temp.u('d'))$$, 'P0001', 'challenge_invalid', 'a nonce that was not claimed cannot be committed');
-- The same nonce committed twice
select throws_ok($$select pg_temp.commit(pg_temp.g('n42')::uuid, pg_temp.u('d'))$$, 'P0001', 'occurrence_not_open', 'a nonce already committed finds the occurrence closed');

-- 52. A dispute keeps lateness; undoing it uses the time of receipt (set up first, used in the review block)
select pg_temp.mkp('R52', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.sv('n52', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('R52'))::text);
update public.proof_challenges set created_at = now() - interval '3 hours', used_at = now() - interval '2 hours' where id = pg_temp.g('n52')::uuid;
update public.task_occurrences set overdue_at = now() - interval '1 hour' where id = pg_temp.occ('R52');
select pg_temp.commit(pg_temp.g('n52')::uuid, pg_temp.u('d'));

-- ===== The review =====
-- 48. Each line of the table, with the exact XP
select pg_temp.mkp('R48', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R48'));
select pg_temp.sv('r48', pg_temp.proof_of(pg_temp.occ('R48'))::text);
select is(pg_temp.xp(pg_temp.occ('R48')), 0::bigint, 'in review: no XP yet');
select pg_temp.login(pg_temp.u('a'));
select lives_ok($$select public.review_proof(pg_temp.g('r48')::uuid, 'approve', null, null)$$, 'in_review, approve: the owner approves');
select pg_temp.pg();
select is(pg_temp.status_of(pg_temp.occ('R48')), 'done', 'the status does not change');
select is(pg_temp.review_of(pg_temp.occ('R48')), 'approved', 'the occurrence is approved');
select is(pg_temp.xp(pg_temp.occ('R48')), 10::bigint, 'and the XP is granted now');
select is((select review_status::text || ':' || reviewed_by::text from public.task_proofs where id = pg_temp.g('r48')::uuid), 'approved:' || pg_temp.u('a')::text, 'the proof records who decided');
-- 53. Approving twice
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.review_proof(pg_temp.g('r48')::uuid, 'approve', null, null)$$, 'P0001', 'proof_already_reviewed', 'the same decision twice: proof_already_reviewed');
select pg_temp.login(pg_temp.u('c'));
select throws_ok($$select public.review_proof(pg_temp.g('r48')::uuid, 'approve', null, 'again')$$, 'P0001', 'proof_already_reviewed', 'from another reviewer too');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48')), 10::bigint, 'with no double XP');
-- unreviewed -> approve: nothing more
select pg_temp.mkp('R48b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R48b'));
select pg_temp.sv('r48b', pg_temp.proof_of(pg_temp.occ('R48b'))::text);
select pg_temp.login(pg_temp.u('a'));
select lives_ok($$select public.review_proof(pg_temp.g('r48b')::uuid, 'approve', null, 'looks good')$$, 'unreviewed, approve');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48b')), 10::bigint, 'the XP was granted at the commit and is not repeated');
select is(pg_temp.xp_count(pg_temp.occ('R48b')), 1::bigint, 'one event');
select is((select review_note from public.task_proofs where id = pg_temp.g('r48b')::uuid), 'looks good', 'the note is kept');
-- unreviewed -> dispute partial; approved -> dispute missed
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.review_proof(pg_temp.g('r48b')::uuid, 'dispute', 'partial', null)$$, '22023', 'reason_required', 'a dispute needs a reason');
select throws_ok($$select public.review_proof(pg_temp.g('r48b')::uuid, 'dispute', 'done', 'x')$$, '23514', 'invalid_transition', 'and goes to partial or missed');
select throws_ok($$select public.review_proof(pg_temp.g('r48b')::uuid, 'burn', null, 'x')$$, '22023', 'invalid_decision', 'an unknown decision is refused');
select is((select status::text from public.review_proof(pg_temp.g('r48b')::uuid, 'dispute', 'partial', 'blurry')), 'partial', 'approved, dispute to partial');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48b')), 3::bigint, 'the XP is compensated and the yellow one is granted');
select is(pg_temp.review_of(pg_temp.occ('R48b')), 'disputed', 'the occurrence is disputed');
select is((select status_reason from public.task_occurrences where id = pg_temp.occ('R48b')), 'blurry', 'the reason is the one given');
select is(pg_temp.late_of(pg_temp.occ('R48b')), false, 'on time stays on time');
-- disputed -> approve from partial: back to green
select pg_temp.login(pg_temp.u('c'));
select is((select status::text from public.review_proof(pg_temp.g('r48b')::uuid, 'approve', null, null)), 'done', 'disputed, approve: back to done');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48b')), 10::bigint, 'the XP of done is back, once');
select is(pg_temp.review_of(pg_temp.occ('R48b')), 'approved', 'approved');
select is((select status_reason from public.task_occurrences where id = pg_temp.occ('R48b')), null, 'the reason of the dispute is gone');
-- unreviewed -> dispute missed
select pg_temp.mkp('R48c', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R48c'));
select pg_temp.sv('r48c', pg_temp.proof_of(pg_temp.occ('R48c'))::text);
select pg_temp.login(pg_temp.u('a'));
select is((select status::text from public.review_proof(pg_temp.g('r48c')::uuid, 'dispute', 'missed', 'not the task')), 'missed', 'unreviewed, dispute to missed');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48c')), 0::bigint, 'the XP is compensated and the balance is zero');
select is(pg_temp.late_of(pg_temp.occ('R48c')), false, 'missed is never late');
select pg_temp.login(pg_temp.u('c'));
select throws_ok($$select public.review_proof(pg_temp.g('r48c')::uuid, 'dispute', 'partial', 'x')$$, 'P0001', 'proof_already_reviewed', 'yellow to red or red to yellow needs an approval in between: already disputed');
select is((select status::text from public.review_proof(pg_temp.g('r48c')::uuid, 'approve', null, null)), 'done', 'disputed to missed, approve: done again');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48c')), 10::bigint, 'with the XP of done');
-- in_review -> dispute partial / missed
select pg_temp.mkp('R48d', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.mkp('R48e', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R48d'));
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R48e'));
select pg_temp.sv('r48d', pg_temp.proof_of(pg_temp.occ('R48d'))::text);
select pg_temp.sv('r48e', pg_temp.proof_of(pg_temp.occ('R48e'))::text);
select pg_temp.login(pg_temp.u('a'));
select public.review_proof(pg_temp.g('r48d')::uuid, 'dispute', 'partial', 'blurry');
select public.review_proof(pg_temp.g('r48e')::uuid, 'dispute', 'missed', 'wrong place');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('R48d')), 3::bigint, 'in review, dispute to partial: only the yellow is granted');
select is(pg_temp.xp_count(pg_temp.occ('R48d')), 1::bigint, 'with no compensation, because nothing was granted');
select is(pg_temp.xp_count(pg_temp.occ('R48e')), 0::bigint, 'in review, dispute to missed: no event at all');

-- 49. The author with proof.review does not review their own proof
select pg_temp.prove(pg_temp.u('c'), pg_temp.occ('PH4'));
select pg_temp.sv('r49', pg_temp.proof_of(pg_temp.occ('PH4'))::text);
select is(pg_temp.xp(pg_temp.occ('PH4')), 5::bigint, 'the admin''s own proof is accepted 80 hours after the deadline, with no window, and it is late');
select pg_temp.login(pg_temp.u('c'));
select throws_ok($$select public.review_proof(pg_temp.g('r49')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'the author, even with proof.review, cannot review their own proof');
select throws_ok($$select public.review_proof(pg_temp.g('r49')::uuid, 'dispute', 'missed', 'x')$$, '42501', 'forbidden', 'nor dispute it');
select pg_temp.login(pg_temp.u('a'));
select lives_ok($$select public.review_proof(pg_temp.g('r49')::uuid, 'approve', null, null)$$, 'while another person with proof.review can');

-- 50. Without the key, other group, outsider, unknown
select pg_temp.pg();
select pg_temp.mkp('R50', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R50'));
select pg_temp.sv('r50', pg_temp.proof_of(pg_temp.occ('R50'))::text);
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'a member without the key: forbidden');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'the assignee, a member: forbidden');
select pg_temp.login(pg_temp.u('b'));
select throws_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'the owner of another group: forbidden');
select pg_temp.login(pg_temp.u('e'));
select throws_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'an outsider: forbidden');
select throws_ok($$select public.review_proof(gen_random_uuid(), 'approve', null, null)$$, '42501', 'forbidden', 'a proof that does not exist looks the same');
select pg_temp.pg();
select throws_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'no session: forbidden');
select is(pg_temp.review_of(pg_temp.occ('R50')), 'unreviewed', 'and nothing changed');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'approve', null, null)$$, 'the admin, who has the key and is not the author, can');

-- 51. A private task: the admin neither sees nor reviews
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('PH3'));
select pg_temp.sv('r51', pg_temp.proof_of(pg_temp.occ('PH3'))::text);
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('r51')::uuid), 0::bigint, 'the admin does not see the proof of a private task');
select throws_ok($$select public.review_proof(pg_temp.g('r51')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'and does not review it');
select pg_temp.login(pg_temp.u('a'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('r51')::uuid), 0::bigint, 'the owner of the group neither');
select throws_ok($$select public.review_proof(pg_temp.g('r51')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'nor reviews it');
select pg_temp.login(pg_temp.u('d'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('r51')::uuid), 1::bigint, 'the author sees it');
select pg_temp.pg();

-- 52. A dispute keeps lateness; undoing it uses the time of receipt
select pg_temp.sv('r52', pg_temp.proof_of(pg_temp.occ('R52'))::text);
select is(pg_temp.late_of(pg_temp.occ('R52')), false, 'received before the deadline: on time, although the commit came after it');
select pg_temp.login(pg_temp.u('a'));
select public.review_proof(pg_temp.g('r52')::uuid, 'dispute', 'partial', 'x');
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('R52')), false, 'a dispute after the deadline does not make it late');
select pg_temp.login(pg_temp.u('a'));
select public.review_proof(pg_temp.g('r52')::uuid, 'approve', null, null);
select pg_temp.pg();
select is(pg_temp.late_of(pg_temp.occ('R52')), false, 'and undoing it recomputes from received_at, so it is still on time');
select is(pg_temp.xp(pg_temp.occ('R52')), 10::bigint, 'with the full XP');

-- 54. A superseded proof
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('R50'), 'pending', 'done', null)$$, 'the assignee reopens a green task');
select pg_temp.pg();
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.review_proof(pg_temp.g('r50')::uuid, 'dispute', 'missed', 'x')$$, 'P0001', 'proof_superseded', 'the old proof is superseded: proof_superseded');
select pg_temp.pg();

-- 57-58. Reopening
select is(pg_temp.status_of(pg_temp.occ('R50')), 'pending', 'reopened');
select is(pg_temp.proof_of(pg_temp.occ('R50')), null, 'current_proof_id is cleared');
select is(pg_temp.review_of(pg_temp.occ('R50')), null, 'proof_review_status is cleared');
select is(pg_temp.late_of(pg_temp.occ('R50')), false, 'late is cleared');
select ok((select superseded_at from public.task_proofs where id = pg_temp.g('r50')::uuid) is not null, 'the proof is marked superseded');
select is(pg_temp.xp(pg_temp.occ('R50')), 0::bigint, 'the XP is compensated');
select ok((select storage_path from public.task_proofs where id = pg_temp.g('r50')::uuid) is not null and (select photo_deleted_at from public.task_proofs where id = pg_temp.g('r50')::uuid) is null, 'and the photo stays until retention');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R50'), 'done', 'pending', null)$$, 'P0001', 'proof_required', 'the next green asks for a proof again');
select pg_temp.pg();
select pg_temp.service();
select throws_ok($$update public.task_occurrences set status = 'done', current_proof_id = pg_temp.g('r50')::uuid, proof_review_status = 'unreviewed' where id = pg_temp.occ('R50')$$, 'P0001', 'proof_required', 'and the old proof cannot be put back, not even by the service role');
select pg_temp.pg();
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R50'));
select is(pg_temp.status_of(pg_temp.occ('R50')), 'done', 'a new challenge and a new photo make it green');
select is(pg_temp.proofs_of(pg_temp.occ('R50')), 2::bigint, 'with two proofs on record');
select isnt(pg_temp.proof_of(pg_temp.occ('R50')), pg_temp.g('r50')::uuid, 'and the new one is the current');
select is(pg_temp.xp(pg_temp.occ('R50')), 10::bigint, 'with the XP once');

-- 55. A disputed occurrence only moves with proof.review
select pg_temp.mkp('R55', '20000000-0000-0000-0000-00000000000a', pg_temp.u('d'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R55'));
select pg_temp.sv('r55', pg_temp.proof_of(pg_temp.occ('R55'))::text);
select pg_temp.login(pg_temp.u('a'));
select public.review_proof(pg_temp.g('r55')::uuid, 'dispute', 'missed', 'not you');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55'), 'pending', 'missed', null)$$, 'P0001', 'proof_disputed', 'the owner of their own task cannot reopen the red');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55'), 'cancelled', 'missed', null)$$, 'P0001', 'proof_disputed', 'cannot cancel it');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55'), 'done', 'missed', null)$$, 'P0001', 'proof_disputed', 'cannot mark it green');
select throws_ok($$select public.issue_proof_challenge(pg_temp.occ('R55'))$$, 'P0001', 'proof_disputed', 'and cannot ask for a new photo');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('R55'), 'pending', 'missed', null)$$, 'another admin reopens it');
select pg_temp.pg();
select is(pg_temp.status_of(pg_temp.occ('R55')), 'pending', 'reopened');
select is(pg_temp.review_of(pg_temp.occ('R55')), null, 'with the dispute cleared');
-- The same for yellow
select pg_temp.mkp('R55b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('d'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R55b'));
select pg_temp.sv('r55b', pg_temp.proof_of(pg_temp.occ('R55b'))::text);
select pg_temp.login(pg_temp.u('a'));
select public.review_proof(pg_temp.g('r55b')::uuid, 'dispute', 'partial', 'x');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55b'), 'pending', 'partial', null)$$, 'P0001', 'proof_disputed', 'the assignee does not reopen the yellow either');
select pg_temp.pg();
-- The reviewer's pairs do not exist for set_occurrence_status
select pg_temp.mkp('R55c', '20000000-0000-0000-0000-00000000000a', pg_temp.u('d'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('R55c'));
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55c'), 'partial', 'done', 'x')$$, '42501', 'forbidden', 'nobody disputes through set_occurrence_status: reviewer is not an actor there');
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55c'), 'missed', 'done', 'x')$$, '42501', 'forbidden', 'not to missed either');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('R55c'), 'partial', 'done', 'x')$$, '42501', 'forbidden', 'nor the assignee');
select pg_temp.pg();
-- A direct update does not dispute either
select pg_temp.service();
select throws_ok($$update public.task_occurrences set status = 'partial' where id = pg_temp.occ('R55c')$$, '23514', 'invalid_transition', 'service role: done -> partial without a dispute is refused');
select throws_ok($$update public.task_occurrences set status = 'missed' where id = pg_temp.occ('R55c')$$, '23514', 'invalid_transition', 'and done -> missed');
select lives_ok($$update public.task_occurrences set status = 'partial', proof_review_status = 'disputed' where id = pg_temp.occ('R55c')$$, 'with the dispute it is the review''s transition');
select throws_ok($$update public.task_occurrences set status = 'done' where id = pg_temp.occ('R55c')$$, '23514', 'invalid_transition', 'partial -> done needs the approval');
select pg_temp.pg();

-- 56. The history, one line per decision, in order
select is(pg_temp.hist(pg_temp.occ('R48b')), 'pending>done:unreviewed done>done:approved done>partial:disputed partial>done:approved', 'history: commit, approval, dispute, undo');
select is(pg_temp.hist(pg_temp.occ('R48')), 'pending>done:in_review done>done:approved', 'history: in review, then approved without a status change');
select is(pg_temp.hist(pg_temp.occ('R50')), 'pending>done:unreviewed done>done:approved done>pending:- pending>done:unreviewed', 'history: a reopening in the middle');
select is((select changed_by from public.task_status_history where occurrence_id = pg_temp.occ('R48') and from_status = to_status), pg_temp.u('a'), 'an approval line has who decided');

-- ===== Who sees a proof (59-61) =====
select pg_temp.mkp('V1', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', false, true, 'FREQ=DAILY');
select pg_temp.mk_occ('V1', now() + interval '1 day');
select pg_temp.mk_occ('V1', now() + interval '2 days');
update public.task_occurrences set assignee_id = pg_temp.u('f') where id = pg_temp.occ('V1', 1);
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('f');
select pg_temp.prove(pg_temp.u('f'), pg_temp.occ('V1', 1));
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('V1', 2));
select pg_temp.sv('v_f', pg_temp.proof_of(pg_temp.occ('V1', 1))::text);
select pg_temp.sv('v_d', pg_temp.proof_of(pg_temp.occ('V1', 2))::text);
select pg_temp.login(pg_temp.u('d'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_d')::uuid), 1::bigint, 'the author sees their proof');
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_f')::uuid), 0::bigint, 'the assignee of the task does not see the proof of a day someone else answered for');
select is((select count(*) from public.task_occurrences where id = pg_temp.occ('V1', 1)), 1::bigint, 'although the task and its occurrence are visible to them');
select pg_temp.login(pg_temp.u('f'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_f')::uuid), 1::bigint, 'Fred sees the proof of his own day');
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_d')::uuid), 0::bigint, 'and not the one of the other day of the series');
select is((select count(*) from public.tasks where title = 'V1'), 1::bigint, 'even though he sees the task, since he answered for one of its days');
select pg_temp.login(pg_temp.u('a'));
select is((select count(*) from public.task_proofs where id in (pg_temp.g('v_f')::uuid, pg_temp.g('v_d')::uuid)), 2::bigint, 'the owner, with proof.review, sees both');
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from public.task_proofs where id in (pg_temp.g('v_f')::uuid, pg_temp.g('v_d')::uuid)), 2::bigint, 'and so does the admin');
select pg_temp.pg();
-- The creator of the task without the key
update public.group_members set role = 'member' where user_id = pg_temp.u('c');
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from public.tasks where title = 'V1'), 1::bigint, 'the creator, now a member, still sees their task');
select is((select count(*) from public.task_proofs where id in (pg_temp.g('v_f')::uuid, pg_temp.g('v_d')::uuid)), 0::bigint, 'but not the proofs, without proof.review');
select pg_temp.pg();
update public.group_members set role = 'admin' where user_id = pg_temp.u('c');
-- Group B: its owner does not see group A's proofs, and group A's admin does not see B's
select pg_temp.mkp('VB', '20000000-0000-0000-0000-00000000000b', pg_temp.u('b'), pg_temp.u('d'), 'group');
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('VB'));
select pg_temp.sv('v_b', pg_temp.proof_of(pg_temp.occ('VB'))::text);
select pg_temp.login(pg_temp.u('b'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_b')::uuid), 1::bigint, 'the owner of B sees the proof in B');
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_d')::uuid), 0::bigint, 'and none in A');
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_b')::uuid), 0::bigint, 'the admin of A sees nothing in B, although Duda is in both');
select pg_temp.login(pg_temp.u('d'));
select is((select count(*) from public.task_proofs where id in (pg_temp.g('v_b')::uuid, pg_temp.g('v_d')::uuid)), 2::bigint, 'while Duda sees her proofs in both groups');
select pg_temp.login(pg_temp.u('e'));
select is((select count(*) from public.task_proofs), 0::bigint, 'an outsider sees no proof');
select pg_temp.pg();
-- An ex-member: the author who left, and the reviewer who left
delete from public.group_members where user_id = pg_temp.u('f');
select pg_temp.login(pg_temp.u('f'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_f')::uuid), 0::bigint, 'an author who left the group sees nothing, not even their own');
select pg_temp.pg();
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000a', pg_temp.u('f'), 'member');
select pg_temp.login(pg_temp.u('f'));
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_f')::uuid), 1::bigint, 'and gets them back by returning');
select pg_temp.pg();
delete from public.group_members where user_id = pg_temp.u('c');
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from public.task_proofs), 0::bigint, 'an admin who left sees no proof');
select throws_ok($$select public.review_proof(pg_temp.g('v_d')::uuid, 'approve', null, null)$$, '42501', 'forbidden', 'nor reviews one');
select pg_temp.pg();
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000a', pg_temp.u('c'), 'admin');

-- 61. storage_path and the nonce are not readable; nothing is writable
select pg_temp.login(pg_temp.u('d'));
select lives_ok($$select id, sha256, size_bytes, width_px, height_px, received_at, clock_delta_seconds, flags, review_status, superseded_at, photo_deleted_at from public.task_proofs$$, 'the author reads the columns of taskProofSchema');
select throws_ok($$select storage_path from public.task_proofs$$, '42501', 'permission denied for table task_proofs', 'storage_path is not readable');
select throws_ok($$select challenge_id from public.task_proofs$$, '42501', 'permission denied for table task_proofs', 'nor is the nonce');
select throws_ok($$select * from public.task_proofs$$, '42501', 'permission denied for table task_proofs', 'a select * hits the same wall');
-- 24. Insert, update and delete, as authenticated and as anon
select throws_ok($$insert into public.task_proofs (occurrence_id, challenge_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds) values (pg_temp.occ('PH5'), gen_random_uuid(), auth.uid(), pg_temp.sha(), 1, 1, 1, now(), now(), 0)$$, '42501', 'permission denied for table task_proofs', 'authenticated cannot insert a proof');
select throws_ok($$update public.task_proofs set review_status = 'approved'$$, '42501', 'permission denied for table task_proofs', 'cannot update one');
select throws_ok($$update public.task_proofs set sha256 = pg_temp.sha()$$, '42501', 'permission denied for table task_proofs', 'cannot swap its hash');
select throws_ok($$delete from public.task_proofs$$, '42501', 'permission denied for table task_proofs', 'cannot delete one');
select throws_ok($$update public.task_occurrences set current_proof_id = null where id = pg_temp.occ('PH1')$$, '42501', 'permission denied for table task_occurrences', 'nor detach it from the occurrence');
select pg_temp.pg();
set local role anon;
select throws_ok($$select id from public.task_proofs$$, '42501', 'permission denied for table task_proofs', 'anon cannot read proofs');
select throws_ok($$insert into public.task_proofs (occurrence_id, challenge_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds) values (gen_random_uuid(), gen_random_uuid(), pg_temp.sha(), 1, 1, 1, now(), now(), 0)$$, '42501', 'permission denied for table task_proofs', 'anon cannot insert');
select throws_ok($$update public.task_proofs set review_status = 'approved'$$, '42501', 'permission denied for table task_proofs', 'anon cannot update');
select throws_ok($$delete from public.task_proofs$$, '42501', 'permission denied for table task_proofs', 'anon cannot delete');
select pg_temp.pg();
select is((select relrowsecurity from pg_class where oid = 'public.task_proofs'::regclass), true, 'RLS is on for the proofs');

-- ===== The storage bucket (24) =====
-- A bucket with a policy is the control: the same calls work there and fail on task-proofs.
insert into storage.buckets (id, name, public) values ('control', 'control', false);
create policy control_all on storage.objects for all to anon, authenticated
  using (bucket_id = 'control') with check (bucket_id = 'control');
insert into storage.objects (bucket_id, name) values ('control', 'a/b.jpg'), ('task-proofs', 'x/y.jpg');
-- Storage blocks a direct DELETE unless its own API says so. The API sets this, so the tests do the same
-- and what is under test is the policies and nothing else.
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.login(pg_temp.u('d'));
select is((select count(*) from storage.objects where bucket_id = 'control'), 1::bigint, 'control: authenticated reads a bucket with a policy');
select is((select count(*) from storage.objects where bucket_id = 'task-proofs'), 0::bigint, 'task-proofs: the same read sees nothing');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('control', 'a/c.jpg')$$, 'control: authenticated inserts');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-proofs', 'x/z.jpg')$$, '42501', 'new row violates row-level security policy for table "objects"', 'task-proofs: an insert is denied by RLS, not by a missing grant');
select is(pg_temp.rows($q$update storage.objects set name = 'a/d.jpg' where bucket_id = 'control' and name = 'a/c.jpg'$q$), 1::bigint, 'control: authenticated overwrites');
select is(pg_temp.rows($q$update storage.objects set name = 'x/other.jpg' where bucket_id = 'task-proofs'$q$), 0::bigint, 'task-proofs: an update reaches no row');
select is(pg_temp.rows($q$delete from storage.objects where bucket_id = 'control' and name = 'a/d.jpg'$q$), 1::bigint, 'control: authenticated deletes');
select is(pg_temp.rows($q$delete from storage.objects where bucket_id = 'task-proofs'$q$), 0::bigint, 'task-proofs: a delete reaches no row');
select pg_temp.pg();
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'control'), 1::bigint, 'control: anon reads a bucket with a policy');
select is((select count(*) from storage.objects where bucket_id = 'task-proofs'), 0::bigint, 'task-proofs: anon sees nothing');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('task-proofs', 'x/z.jpg')$$, '42501', 'new row violates row-level security policy for table "objects"', 'task-proofs: anon cannot insert');
select is(pg_temp.rows($q$update storage.objects set name = 'x/other.jpg' where bucket_id = 'task-proofs'$q$), 0::bigint, 'task-proofs: anon cannot update');
select is(pg_temp.rows($q$delete from storage.objects where bucket_id = 'task-proofs'$q$), 0::bigint, 'task-proofs: anon cannot delete');
select pg_temp.pg();
select is((select count(*) from storage.objects where bucket_id = 'task-proofs' and name = 'x/y.jpg'), 1::bigint, 'and the object is exactly where it was');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname <> 'control_all'), 0::bigint, 'no other policy exists on storage.objects');
delete from storage.objects where bucket_id in ('control', 'task-proofs');
drop policy control_all on storage.objects;
delete from storage.buckets where id = 'control';

-- ===== Flags that only the owner or manage_group switch (31) =====
insert into public.role_permissions (role, permission_key) values ('member', 'task.edit_assigned');
update public.profiles set proof_consent_version = 1 where id = pg_temp.u('f');
select pg_temp.mkp('FL1', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('f'), 'group', now() + interval '2 days', false, true, 'FREQ=DAILY');
select pg_temp.mk_occ('FL1', now() + interval '1 day');
select pg_temp.mk_occ('FL1', now() + interval '2 days');
select pg_temp.mkp('FL2', '20000000-0000-0000-0000-00000000000a', pg_temp.u('f'), pg_temp.u('f'), 'group');
select pg_temp.mkp('FL3', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('f'), 'group');
select pg_temp.login(pg_temp.u('f'));
select lives_ok($$select public.edit_task(pg_temp.occ('FL1', 2), 'all', pg_temp.fform((select start_at from public.tasks where title = 'FL1'), 'FL1 renamed', '{"requiresPhotoProof": true}'), 'FREQ=DAILY', null)$$, 'a member with edit_assigned edits the title and keeps the photo flag');
select throws_ok($$select public.edit_task(pg_temp.occ('FL1 renamed', 2), 'all', pg_temp.fform((select start_at from public.tasks where title = 'FL1 renamed'), 'FL1 renamed', '{"requiresPhotoProof": false}'), 'FREQ=DAILY', null)$$, '42501', 'proof_flags_locked', 'but cannot switch the photo off, scope all');
select throws_ok($$select public.edit_task(pg_temp.occ('FL1 renamed', 2), 'this', pg_temp.fform(now() + interval '3 days', 'FL1 once', '{"requiresPhotoProof": false}'), null, null)$$, '42501', 'proof_flags_locked', 'nor with this, which would create a task without the flag');
select throws_ok($$select public.edit_task(pg_temp.occ('FL1 renamed', 2), 'this_and_following', pg_temp.fform(now() + interval '3 days', 'FL1 tail', '{"requiresPhotoProof": false}'), 'FREQ=DAILY', 'FREQ=DAILY;UNTIL=20261231T000000Z')$$, '42501', 'proof_flags_locked', 'nor with this_and_following');
select throws_ok($$select public.edit_task(pg_temp.occ('FL3'), 'all', pg_temp.fform((select start_at from public.tasks where title = 'FL3'), 'FL3', '{"requiresPhotoProof": true, "requiresAdminApproval": true}'), null, null)$$, '42501', 'proof_flags_locked', 'nor switch the approval on');
select is((select requires_photo_proof from public.tasks where title = 'FL1 renamed'), true, 'the flag is still on');
select is((select count(*) from public.tasks where title in ('FL1 once', 'FL1 tail')), 0::bigint, 'and no task without it was created');
select lives_ok($$select public.edit_task(pg_temp.occ('FL2'), 'all', pg_temp.fform((select start_at from public.tasks where title = 'FL2'), 'FL2', '{"requiresPhotoProof": false}'), null, null)$$, 'the owner of a task of their own switches the photo off');
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.edit_task(pg_temp.occ('FL3'), 'all', pg_temp.form((select start_at from public.tasks where title = 'FL3'), '{"title": "FL3", "assigneeId": "00000000-0000-0000-0000-00000000000f", "requiresPhotoProof": false}'), null, null)$$, 'an admin switches it off on a group task');
select lives_ok($$select public.edit_task(pg_temp.occ('FL1 renamed', 2), 'this', pg_temp.form(now() + interval '3 days', '{"title": "FL1 once", "assigneeId": "00000000-0000-0000-0000-00000000000f", "requiresPhotoProof": false}'), null, null)$$, 'and detaches an occurrence without it');
select pg_temp.pg();
select is((select requires_photo_proof from public.tasks where title = 'FL1 once'), false, 'the detached task has no photo');
delete from public.role_permissions where role = 'member' and permission_key = 'task.edit_assigned';

-- 32. A task without photo: everything as in the ADR-0005
select pg_temp.login(pg_temp.u('c'));
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('NP1'), 'done', 'pending', null)$$, 'the admin completes a task without photo');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('NP1'), 'pending', 'done', null)$$, 'and reopens it');
select pg_temp.login(pg_temp.u('d'));
select throws_ok($$select public.set_occurrence_status(pg_temp.occ('NP1'), 'done', 'partial', null)$$, 'P0001', 'status_conflict', 'a stale expectation is still a conflict');
select lives_ok($$select public.set_occurrence_status(pg_temp.occ('NP1'), 'done', 'pending', null)$$, 'the assignee completes it');
select is(pg_temp.xp(pg_temp.occ('NP1')), 10::bigint, 'with the usual XP');
select is(pg_temp.review_of(pg_temp.occ('NP1')), null, 'and no review state');
select pg_temp.pg();

-- ===== Retention and the immutability of the record (62-63) =====
-- A proof received 100 days ago, waiting for an admin, and a recent one
select pg_temp.mkp('T62', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.sv('n62', pg_temp.claimed(pg_temp.u('d'), pg_temp.occ('T62'))::text);
update public.proof_challenges set created_at = now() - interval '101 days', used_at = now() - interval '100 days', expires_at = now() - interval '101 days' + interval '5 minutes' where id = pg_temp.g('n62')::uuid;
select pg_temp.commit(pg_temp.g('n62')::uuid, pg_temp.u('d'));
select pg_temp.sv('t62', pg_temp.proof_of(pg_temp.occ('T62'))::text);
select pg_temp.sv('t62_path', (select storage_path from public.task_proofs where id = pg_temp.g('t62')::uuid));
select is(pg_temp.xp_count(pg_temp.occ('T62')), 0::bigint, 'the old proof is still in review, with no XP');
select pg_temp.service();
select is((select count(*) from public.proofs_due_for_retention(100) where proof_id = pg_temp.g('t62')::uuid), 1::bigint, 'it is due for retention');
select is((select count(*) from public.proofs_due_for_retention(100) where proof_id = pg_temp.g('r48')::uuid), 0::bigint, 'a recent one is not');
select is((select storage_path from public.proofs_due_for_retention(100) where proof_id = pg_temp.g('t62')::uuid), pg_temp.g('t62_path'), 'the listing carries the path to remove');
select is((select count(*) from public.proofs_due_for_retention(0)), 1::bigint, 'the limit is at least one');
select lives_ok($$select public.mark_proof_photo_deleted(pg_temp.g('t62')::uuid)$$, 'the job marks the proof after removing the object');
select pg_temp.pg();
select is(pg_temp.review_of(pg_temp.occ('T62')), 'approved', 'an in-review proof is approved by the system');
select is(pg_temp.xp(pg_temp.occ('T62')), 10::bigint, 'with the XP granted');
select is((select reviewed_by::text || ':' || review_note from public.task_proofs where id = pg_temp.g('t62')::uuid), null, 'by nobody: reviewed_by stays null');
select is((select review_note from public.task_proofs where id = pg_temp.g('t62')::uuid), 'retention_auto_approved', 'with a note from the system');
select ok((select photo_deleted_at from public.task_proofs where id = pg_temp.g('t62')::uuid) is not null, 'photo_deleted_at is set');
select is((select storage_path from public.task_proofs where id = pg_temp.g('t62')::uuid), null, 'the path is gone');
select is((select user_agent from public.task_proofs where id = pg_temp.g('t62')::uuid), null, 'and the user agent');
select ok((select sha256 from public.task_proofs where id = pg_temp.g('t62')::uuid) is not null and (select size_bytes from public.task_proofs where id = pg_temp.g('t62')::uuid) > 0, 'while hash and size stay');
select is(pg_temp.hist(pg_temp.occ('T62')), 'pending>done:in_review done>done:approved', 'the approval is in the history');
select pg_temp.service();
select lives_ok($$select public.mark_proof_photo_deleted(pg_temp.g('t62')::uuid)$$, 'running it again is safe');
select lives_ok($$select public.mark_proof_photo_deleted(gen_random_uuid())$$, 'and so is a proof that is gone');
select is((select count(*) from public.proofs_due_for_retention(100) where proof_id = pg_temp.g('t62')::uuid), 0::bigint, 'it is no longer listed');
select pg_temp.pg();
select is(pg_temp.xp(pg_temp.occ('T62')), 10::bigint, 'the XP was granted once');
select is(pg_temp.xp_count(pg_temp.occ('T62')), 1::bigint, 'with one event');
-- A superseded proof is not approved by the job
select pg_temp.mkp('T62b', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group', now() + interval '2 days', true);
select pg_temp.prove(pg_temp.u('d'), pg_temp.occ('T62b'));
select pg_temp.sv('t62b', pg_temp.proof_of(pg_temp.occ('T62b'))::text);
select pg_temp.login(pg_temp.u('d'));
select public.set_occurrence_status(pg_temp.occ('T62b'), 'pending', 'done', null);
select pg_temp.pg();
select pg_temp.service();
select public.mark_proof_photo_deleted(pg_temp.g('t62b')::uuid);
select pg_temp.pg();
select is((select review_status::text from public.task_proofs where id = pg_temp.g('t62b')::uuid), 'in_review', 'a superseded proof keeps its review state');
select is(pg_temp.xp_count(pg_temp.occ('T62b')), 0::bigint, 'and grants nothing');
select ok((select photo_deleted_at from public.task_proofs where id = pg_temp.g('t62b')::uuid) is not null, 'but its photo is gone like the others');
select is(pg_temp.status_of(pg_temp.occ('T62b')), 'pending', 'and the reopened occurrence is untouched');
-- Orphan objects and stale challenges
insert into storage.objects (bucket_id, name, created_at) values
  ('task-proofs', 'orphan/old.jpg', now() - interval '30 hours'),
  ('task-proofs', 'orphan/new.jpg', now() - interval '1 hour'),
  ('task-proofs', (select storage_path from public.task_proofs where id = pg_temp.g('v_d')::uuid), now() - interval '30 hours');
select pg_temp.service();
select is((select string_agg(name, ',') from public.orphan_proof_objects(100)), 'orphan/old.jpg', 'only an old object that no row points to is an orphan');
select pg_temp.pg();
delete from storage.objects where bucket_id = 'task-proofs';
delete from public.proof_challenges where id not in (select challenge_id from public.task_proofs);
insert into public.proof_challenges (occurrence_id, user_id, created_at, expires_at) values
  (pg_temp.occ('PH5'), pg_temp.u('d'), now() - interval '30 hours', now() - interval '29 hours'),
  (pg_temp.occ('PH5'), pg_temp.u('d'), now() - interval '1 hour', now() - interval '55 minutes');
select pg_temp.service();
select is(public.delete_stale_proof_challenges(), 1::int, 'a challenge older than 24 hours with no proof is deleted');
select pg_temp.pg();
select is((select count(*) from public.proof_challenges where created_at > now() - interval '2 hours' and used_at is null), 1::bigint, 'a recent one stays');
select ok((select count(*) from public.proof_challenges c where exists (select 1 from public.task_proofs p where p.challenge_id = c.id)) > 0, 'and so do the challenges behind a proof');
select is((select count(*) from cron.job where jobname = 'proof-retention' and schedule = '0 * * * *'), 1::bigint, 'the retention job runs every hour');

-- 63. The record cannot be rewritten, service role included
insert into public.proof_challenges (id, occurrence_id, user_id, expires_at) values ('90000000-0000-0000-0000-0000000000aa', pg_temp.occ('PH5'), pg_temp.u('d'), now() + interval '5 minutes');
select pg_temp.mkp('X77', '20000000-0000-0000-0000-00000000000a', pg_temp.u('c'), pg_temp.u('d'), 'group');
select pg_temp.service();
select throws_ok($$update public.task_proofs set sha256 = pg_temp.sha() where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'service role: the hash cannot change');
select throws_ok($$update public.task_proofs set received_at = received_at + interval '1 minute' where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'nor the time of receipt');
select throws_ok($$update public.task_proofs set captured_at_device = captured_at_device + interval '1 minute' where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'nor the time of the device');
select throws_ok($$update public.task_proofs set occurrence_id = pg_temp.occ('PH1') where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'nor the occurrence');
select throws_ok($$update public.task_proofs set challenge_id = gen_random_uuid() where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'nor the challenge');
select throws_ok($$update public.task_proofs set user_id = pg_temp.u('a') where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'nor can the proof be given to someone else');
select lives_ok($$update public.task_proofs set review_note = 'service note' where id = pg_temp.g('v_d')::uuid$$, 'while the review fields can be written');
select lives_ok($$update public.task_proofs set user_id = null where id = pg_temp.g('v_d')::uuid$$, 'and the author can become null');
select throws_ok($$update public.task_proofs set user_id = pg_temp.u('d') where id = pg_temp.g('v_d')::uuid$$, '42501', 'proof_immutable', 'but not come back');
select throws_ok($$insert into public.task_proofs (occurrence_id, challenge_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds) values (pg_temp.occ('PH1'), gen_random_uuid(), pg_temp.u('d'), pg_temp.sha(), 1, 1, 1, now(), now(), 0)$$, '23503', 'insert or update on table "task_proofs" violates foreign key constraint "task_proofs_challenge_fkey"', 'service role: a proof needs a challenge of its own occurrence and author');
select throws_ok($$insert into public.task_proofs (occurrence_id, challenge_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds) values (pg_temp.occ('PH1'), '90000000-0000-0000-0000-0000000000aa', pg_temp.u('d'), pg_temp.sha(), 1, 1, 1, now(), now(), 0)$$, '23503', 'insert or update on table "task_proofs" violates foreign key constraint "task_proofs_challenge_fkey"', 'a challenge of another occurrence does not serve');
select throws_ok($$update public.task_occurrences set current_proof_id = pg_temp.g('v_b')::uuid where id = pg_temp.occ('PH1')$$, '23503', 'insert or update on table "task_occurrences" violates foreign key constraint "task_occurrences_current_proof_fkey"', 'the proof of another occurrence cannot be made current');
select throws_ok($$update public.task_occurrences set status = 'done', current_proof_id = pg_temp.g('v_b')::uuid, proof_review_status = 'unreviewed' where id = pg_temp.occ('X77')$$, 'P0001', 'proof_required', 'nor to turn an occurrence green');
select pg_temp.pg();

-- Deleting an account. The occurrences and tasks of the assignee go with it, and with them their proofs.
-- A proof of an occurrence that stayed (it changed hands) keeps its row and loses the author. The test
-- user is new, so the history written in this transaction does not belong to anyone else's deletion.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000010', 'gina@test.local', '{"display_name": "Gina"}');
insert into public.group_members (group_id, user_id, role) values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000010', 'member');
update public.profiles set proof_consent_version = 1 where id = '00000000-0000-0000-0000-000000000010';
select pg_temp.mkp('GG', '20000000-0000-0000-0000-00000000000b', pg_temp.u('b'), '00000000-0000-0000-0000-000000000010', 'group');
select pg_temp.prove('00000000-0000-0000-0000-000000000010', pg_temp.occ('GG'));
select pg_temp.sv('v_g', pg_temp.proof_of(pg_temp.occ('GG'))::text);
update public.tasks set assignee_id = pg_temp.u('b') where title = 'GG';
update public.task_occurrences set assignee_id = pg_temp.u('b') where id = pg_temp.occ('GG');
delete from public.task_status_history where changed_by = '00000000-0000-0000-0000-000000000010';
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-000000000010'$$, 'an account with a proof can be deleted');
select is((select count(*) from public.task_proofs where id = pg_temp.g('v_g')::uuid), 1::bigint, 'the proof of an occurrence that stayed survives it');
select is((select user_id from public.task_proofs where id = pg_temp.g('v_g')::uuid), null, 'with a null author');
select is((select count(*) from public.proof_challenges where user_id = '00000000-0000-0000-0000-000000000010'), 0::bigint, 'and her challenges are gone');

select * from finish();
rollback;
