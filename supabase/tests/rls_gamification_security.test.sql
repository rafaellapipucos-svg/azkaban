-- Security review of Phase 6 (ADR-0010, section 14): SEG6-1 to SEG6-5, with the five proofs of concept of
-- the review as tests. Assume a hostile client. The clock is the transaction's now(); what has to be in
-- the past is backdated by hand.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists pgrowlocks with schema extensions;
select plan(47);

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid;
$$;

-- s1 the zone swap, s2 to s5 the history, s6 the auto-miss batch, s7 the group pair, r* the ranking,
-- k* the close job.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@sec.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['1', '2', '3', '4', '5', '6', '7', '71', '72', '73', '74', '81', '82']) k;
insert into public.contexts (area_id, group_id, owner_user_id, name, color_token, icon, created_by)
select (select id from public.areas where key = 'work'), null, p.id, 'Own', 'teal', 'x', p.id from public.profiles p
where p.id in (select pg_temp.u(k) from unnest(array['1', '2', '3', '4', '5', '6', '7', '81', '82']) k);

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

create temp sequence gseq;

create function pg_temp.today(p_user uuid) returns date language sql as $$
  select (now() at time zone timezone)::date from public.profiles where id = p_user;
$$;

-- p_date at noon in the profile's zone, plus p_min minutes.
create function pg_temp.at(p_user uuid, p_date date, p_min int default 0) returns timestamptz language sql as $$
  select (p_date + time '12:00' + make_interval(mins => p_min)) at time zone timezone from public.profiles where id = p_user;
$$;

create function pg_temp.mko(
  p_user uuid, p_start timestamptz, p_diff public.task_difficulty default 'easy', p_ctx uuid default null,
  p_vis public.task_visibility default 'private'
) returns uuid language plpgsql as $$
declare tid uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone, reminders,
    requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility
  ) values (
    coalesce(p_ctx, (select id from public.contexts where owner_user_id = p_user)), p_user, p_user,
    'S' || nextval('gseq'), 'timed', p_start, 30, 'America/Sao_Paulo', '[]', false, false, false, p_diff,
    'normal', p_vis
  ) returning id into tid;
  return (select id from public.task_occurrences where task_id = tid);
end;
$$;

create function pg_temp.st(p_occ uuid, p_status public.occurrence_status) returns void language sql as $$
  update public.task_occurrences set status = p_status where id = p_occ;
$$;

create function pg_temp.xp(p_occ uuid) returns bigint language sql as $$
  select coalesce(sum(amount), 0) from public.xp_events where occurrence_id = p_occ;
$$;

-- The start of the current ranking week (Monday) of p_user, in its zone, minus p_weeks weeks.
create function pg_temp.week(p_user uuid, p_weeks int default 0) returns date language sql as $$
  select pg_temp.today(p_user) - (extract(isodow from pg_temp.today(p_user))::int - 1) - 7 * p_weeks;
$$;

-- ===== The mirror =====
select is(public.gamification_rules() -> 'xp' -> 'capWindowHours', '24'::jsonb, 'capWindowHours is mirrored');
select is(public.gamification_rules() -> 'historyDays', '400'::jsonb, 'historyDays is mirrored');
select is(public.gamification_rules() -> 'ranking' -> 'weekStartsOn', '1'::jsonb, 'weekStartsOn is mirrored');
select is(public.gamification_rules() -> 'ranking' -> 'maxWeeks', '2'::jsonb, 'maxWeeks is mirrored');
select is(public.gamification_rules() -> 'closeJob' -> 'batchSize', '64'::jsonb, 'closeJob.batchSize is 64, inside the subtransaction cache (SEG6-7)');

-- ===== SEG6-1: the zone of the profile =====
select pg_temp.login(pg_temp.u('1'));
select throws_ok($$update public.profiles set timezone = '<X>-13:37' where id = auth.uid()$$,
  '22023', 'invalid_timezone', 'a POSIX zone is refused');
select throws_ok($$update public.profiles set timezone = 'Factory' where id = auth.uid()$$,
  '22023', 'invalid_timezone', 'and so is a name Intl rejects');
select lives_ok($$update public.profiles set timezone = 'Pacific/Kiritimati' where id = auth.uid()$$, 'a real zone is taken');
select lives_ok($$update public.profiles set timezone = 'America/Sao_Paulo' where id = auth.uid()$$, 'and back');
select pg_temp.pg();
insert into auth.users (id, email) values (pg_temp.u('99'), '99@sec.local');
delete from public.profiles where id = pg_temp.u('99');
select throws_ok($$insert into public.profiles (id, display_name, timezone) values ('00000000-0000-0000-0000-000000000099', 'x', 'Mars/Base')$$,
  '22023', 'invalid_timezone', 'an insert is checked too');

-- PoC 1: 300 done two hours ago, then the zone whose midnight is the most recent, then one more.
create temp table s1_occ as
  select i, pg_temp.mko(pg_temp.u('1'), now() + make_interval(mins => i), 'hard') as id from generate_series(1, 13) i;
select pg_temp.st(id, 'done') from s1_occ where i <= 10;
update public.xp_events set created_at = now() - interval '2 hours' where user_id = pg_temp.u('1');
create temp table recent_midnight as
  select name from pg_timezone_names where name <> 'Factory' order by (now() at time zone name)::time limit 1;
grant select on recent_midnight to authenticated;
select ok((now() at time zone (select name from recent_midnight))::time < time '02:00',
  'some zone had its midnight less than two hours ago');
select pg_temp.login(pg_temp.u('1'));
update public.profiles set timezone = (select name from recent_midnight) where id = auth.uid();
select pg_temp.pg();
select pg_temp.st(id, 'done') from s1_occ where i = 11;
select is(pg_temp.xp((select id from s1_occ where i = 11)), 0::bigint, 'swapping the zone between completions opens no room');
update public.app_settings set value = jsonb_set(value, '{xp,capWindowHours}', '1') where key = 'gamification_rules';
select pg_temp.st(id, 'done') from s1_occ where i = 12;
select is(pg_temp.xp((select id from s1_occ where i = 12)), 30::bigint, 'the window is capWindowHours long');
update public.app_settings set value = jsonb_set(value, '{xp,capWindowHours}', '24') where key = 'gamification_rules';
update public.xp_events set created_at = now() - interval '25 hours' where user_id = pg_temp.u('1');
select pg_temp.st(id, 'done') from s1_occ where i = 13;
select is(pg_temp.xp((select id from s1_occ where i = 13)), 30::bigint, 'and events older than 24 h leave it');

-- ===== SEG6-2: the floor of the history =====
create temp table s2_occ as select pg_temp.mko(pg_temp.u('2'), '2000-03-01 12:00-03', 'easy') as id;
select pg_temp.st(id, 'missed') from s2_occ;
select is((select count(*) from public.user_day_stats where user_id = pg_temp.u('2')), 0::bigint,
  'an occurrence of 2000 marked missed writes no day');
select is((select count(*) from public.xp_events where user_id = pg_temp.u('2')), 0::bigint, 'and no event');
select public.recompute_user_gamification(pg_temp.u('2'));
select is((select count(*) from public.user_day_stats where user_id = pg_temp.u('2')), 0::bigint, 'nor does the recount');

-- historyDays: a profile of 1000 days counts only the last 400.
update public.profiles set created_at = now() - interval '1000 days' where id = pg_temp.u('3');
select pg_temp.st(pg_temp.mko(pg_temp.u('3'), pg_temp.at(pg_temp.u('3'), pg_temp.today(pg_temp.u('3')) - 500)), 'done');
select pg_temp.st(pg_temp.mko(pg_temp.u('3'), pg_temp.at(pg_temp.u('3'), pg_temp.today(pg_temp.u('3')) - 10)), 'done');
select is((select string_agg((pg_temp.today(pg_temp.u('3')) - local_date)::text, ',') from public.user_day_stats where user_id = pg_temp.u('3')),
  '10', 'an old profile counts 10 days ago, not 500');

-- The day before the creation counts, but without a perfect day.
select pg_temp.st(pg_temp.mko(pg_temp.u('4'), pg_temp.at(pg_temp.u('4'), pg_temp.today(pg_temp.u('4')) - 1)), 'done');
select pg_temp.st(pg_temp.mko(pg_temp.u('4'), pg_temp.at(pg_temp.u('4'), pg_temp.today(pg_temp.u('4')))), 'done');
select is((select perfect from public.user_day_stats where user_id = pg_temp.u('4') and local_date = pg_temp.today(pg_temp.u('4')) - 1),
  true, 'the day before the creation is perfect');
select is((select string_agg(local_date::text, ',') from public.xp_events where user_id = pg_temp.u('4') and reason = 'perfect_day'),
  pg_temp.today(pg_temp.u('4'))::text, 'and only the day of the creation earns the bonus');

-- One fold per user per statement: five days in one update.
update public.profiles set created_at = now() - interval '10 days' where id = pg_temp.u('5');
create temp table s5_occ as
  select pg_temp.mko(pg_temp.u('5'), pg_temp.at(pg_temp.u('5'), pg_temp.today(pg_temp.u('5')) - i)) as id from generate_series(0, 4) i;
insert into public.user_stats (user_id) values (pg_temp.u('5')) on conflict do nothing;
create temp table folds (n int);
create function pg_temp.count_fold() returns trigger language plpgsql as $$
begin
  insert into folds values (1);
  return null;
end;
$$;
create trigger count_fold after update of current_streak on public.user_stats
  for each row when (new.user_id = '00000000-0000-0000-0000-000000000005') execute function pg_temp.count_fold();
update public.task_occurrences set status = 'done' where id in (select id from s5_occ);
drop trigger count_fold on public.user_stats;
select is((select count(*) from folds), 1::bigint, 'five occurrences in one update fold once');
select is((select current_streak from public.user_stats where user_id = pg_temp.u('5')), 5, 'and the streak is 5');
select is((select count(*) from public.user_day_stats where user_id = pg_temp.u('5')), 5::bigint, 'with one row per day');

-- PoC 2: 500 pending tasks from 2000 to 2025, then the auto-miss job, timed.
insert into public.tasks (
  context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone, reminders,
  requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility
)
select (select id from public.contexts where owner_user_id = pg_temp.u('6')), pg_temp.u('6'), pg_temp.u('6'), 'Old ' || i,
  'timed', ('2000-01-01 12:00'::timestamp + make_interval(days => 19 * i)) at time zone 'America/Sao_Paulo', 30,
  'America/Sao_Paulo', '[]', false, false, false, 'easy', 'normal', 'private'
from generate_series(0, 499) i;
create temp table job_clock (t0 timestamptz, t1 timestamptz, marked int);
insert into job_clock (t0) values (clock_timestamp());
update job_clock set marked = public.auto_miss_occurrences();
update job_clock set t1 = clock_timestamp();
select is((select count(*) from public.task_occurrences where assignee_id = pg_temp.u('6') and status = 'missed'), 500::bigint,
  'the job marks the 500 old occurrences');
select is((select count(*) from public.user_day_stats where user_id = pg_temp.u('6')), 0::bigint, 'with no day written');
select diag('auto_miss_occurrences, 500 rows from 2000 to 2025: ' || (select round(extract(epoch from t1 - t0) * 1000) from job_clock) || ' ms');
select ok((select t1 - t0 from job_clock) < interval '5 seconds', 'in less than 5 seconds');

-- ===== SEG6-3: the balance per (occurrence, group), with PoC 3 =====
insert into public.groups (id, name, type, owner_id) values
  ('30000000-0000-0000-0000-000000000007', 'Casa 7', 'family', pg_temp.u('7'));
insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('40000000-0000-0000-0000-000000000007', (select id from public.areas where key = 'home'),
    '30000000-0000-0000-0000-000000000007', null, 'Casa 7', 'teal', 'x', pg_temp.u('7'));
create temp table s7 as select pg_temp.mko(pg_temp.u('7'), now() + interval '1 minute', 'hard',
  '40000000-0000-0000-0000-000000000007', 'private') as id;
select pg_temp.st(id, 'done') from s7;
update public.xp_events set created_at = now() - interval '30 hours' where user_id = pg_temp.u('7');
update public.tasks set visibility = 'group' where id = (select task_id from public.task_occurrences where id = (select id from s7));
select pg_temp.st(id, 'pending') from s7;
select pg_temp.st(id, 'done') from s7;
select pg_temp.st(pg_temp.mko(pg_temp.u('7'), now() + make_interval(mins => 10 + i), 'hard', '40000000-0000-0000-0000-000000000007', 'group'), 'done')
from generate_series(1, 10) i;
select is((select sum(amount) from public.xp_events where user_id = pg_temp.u('7') and group_id is not null), 300::bigint,
  'a private award redone in the group consumes the cap: 300 to the group, not 330');
select pg_temp.login(pg_temp.u('7'));
select is((select xp from public.group_ranking('30000000-0000-0000-0000-000000000007', pg_temp.week(pg_temp.u('7')))), 300,
  'and the ranking shows 300');
select pg_temp.pg();

-- ===== SEG6-4: the ranking =====
select hasnt_function('public', 'group_ranking', array['uuid', 'date', 'text'], 'the ranking of three arguments is gone');
insert into public.groups (id, name, type, owner_id) values
  ('30000000-0000-0000-0000-0000000000f1', 'Fam', 'family', pg_temp.u('71')),
  ('30000000-0000-0000-0000-0000000000c1', 'Co', 'company', pg_temp.u('71'));
insert into public.group_members (group_id, user_id, role) values
  ('30000000-0000-0000-0000-0000000000f1', pg_temp.u('72'), 'member'),
  ('30000000-0000-0000-0000-0000000000f1', pg_temp.u('73'), 'member'),
  ('30000000-0000-0000-0000-0000000000c1', pg_temp.u('72'), 'member');
select is((select array[ranking_enabled_at = now(), ranking_enabled_at is null] from public.groups where id = '30000000-0000-0000-0000-0000000000f1'),
  array[true, false], 'a family is born with ranking_enabled_at');
select is((select ranking_enabled_at from public.groups where id = '30000000-0000-0000-0000-0000000000c1'), null, 'a company without it');

select pg_temp.login(pg_temp.u('72'));
select throws_ok(format('select * from public.group_ranking(%L, %L)', '30000000-0000-0000-0000-0000000000f1', pg_temp.week(pg_temp.u('72')) + 1),
  '22023', 'invalid_argument', 'PoC 4: a week moved by one day is refused');
select throws_ok(format('select * from public.group_ranking(%L, %L)', '30000000-0000-0000-0000-0000000000f1', pg_temp.week(pg_temp.u('72'), 2)),
  '22023', 'invalid_argument', 'and so is three weeks ago');
select throws_ok(format('select * from public.group_ranking(%L, %L)', '30000000-0000-0000-0000-0000000000f1', pg_temp.week(pg_temp.u('72'), -1)),
  '22023', 'invalid_argument', 'and next week');
select lives_ok(format('select * from public.group_ranking(%L, %L)', '30000000-0000-0000-0000-0000000000f1', pg_temp.week(pg_temp.u('72'), 1)),
  'last week is answered');

select pg_temp.login(pg_temp.u('71'));
select throws_ok($$update public.groups set ranking_enabled_at = now() - interval '1 year' where id = '30000000-0000-0000-0000-0000000000f1'$$,
  '42501', 'permission denied for table groups', 'the client does not write ranking_enabled_at');
select throws_ok($$insert into public.groups (name, type, ranking_enabled_at) values ('X', 'family', now() - interval '1 year')$$,
  '42501', 'permission denied for table groups', 'not even on insert');

-- XP of last week, before the company turned the ranking on, by a member who was already there.
select pg_temp.pg();
update public.group_members set joined_at = now() - interval '30 days'
where group_id = '30000000-0000-0000-0000-0000000000c1' and user_id = pg_temp.u('72');
insert into public.xp_events (user_id, group_id, amount, reason, created_at) values
  (pg_temp.u('72'), '30000000-0000-0000-0000-0000000000c1', 30, 'occurrence_done', pg_temp.at(pg_temp.u('72'), pg_temp.week(pg_temp.u('72'), 1) + 1)),
  (pg_temp.u('72'), '30000000-0000-0000-0000-0000000000c1', 10, 'occurrence_done', now());
select pg_temp.login(pg_temp.u('71'));
update public.groups set settings = '{"rankingEnabled": true}' where id = '30000000-0000-0000-0000-0000000000c1';
select is((select ranking_enabled_at from public.groups where id = '30000000-0000-0000-0000-0000000000c1'), now(), 'turning it on stamps now');
update public.groups set name = 'Co 2' where id = '30000000-0000-0000-0000-0000000000c1';
select pg_temp.login(pg_temp.u('72'));
select is((select count(*) from public.group_ranking('30000000-0000-0000-0000-0000000000c1', pg_temp.week(pg_temp.u('72'), 1))), 0::bigint,
  'last week''s XP from before the ranking was on is out');
select is((select xp from public.group_ranking('30000000-0000-0000-0000-0000000000c1', pg_temp.week(pg_temp.u('72')))), 10,
  'what came after it is in');
select pg_temp.login(pg_temp.u('71'));
update public.groups set settings = '{"rankingEnabled": false}' where id = '30000000-0000-0000-0000-0000000000c1';
select is((select ranking_enabled_at from public.groups where id = '30000000-0000-0000-0000-0000000000c1'), null, 'turning it off clears it');

-- XP of last week, in a family on for a month, before 73 joined: 72 sees it, 73 does not.
select pg_temp.pg();
alter table public.groups disable trigger groups_set_ranking_enabled_at;
update public.groups set ranking_enabled_at = now() - interval '30 days' where id = '30000000-0000-0000-0000-0000000000f1';
alter table public.groups enable trigger groups_set_ranking_enabled_at;
update public.group_members set joined_at = now() - interval '30 days'
where group_id = '30000000-0000-0000-0000-0000000000f1' and user_id = pg_temp.u('72');
insert into public.xp_events (user_id, group_id, amount, reason, created_at) values
  (pg_temp.u('72'), '30000000-0000-0000-0000-0000000000f1', 30, 'occurrence_done', pg_temp.at(pg_temp.u('72'), pg_temp.week(pg_temp.u('72'), 1) + 1));
select pg_temp.login(pg_temp.u('72'));
select is((select xp from public.group_ranking('30000000-0000-0000-0000-0000000000f1', pg_temp.week(pg_temp.u('72'), 1))), 30,
  'a member of a month sees last week');
select pg_temp.login(pg_temp.u('73'));
select is((select count(*) from public.group_ranking('30000000-0000-0000-0000-0000000000f1', pg_temp.week(pg_temp.u('73'), 1))), 0::bigint,
  'one who joined now does not');
select pg_temp.pg();

-- ===== SEG6-5: the close job =====
-- k1 fails inside the batch, k2 closes all the same; both need closing.
update public.profiles set created_at = now() - interval '5 days' where id in (pg_temp.u('81'), pg_temp.u('82'));
create function pg_temp.boom() returns trigger language plpgsql as $$
begin
  raise exception 'boom';
end;
$$;
create trigger boom before insert or update on public.user_stats
  for each row when (new.user_id = '00000000-0000-0000-0000-000000000081') execute function pg_temp.boom();
select ok(public.close_gamification_days() >= 1, 'the job runs past a profile that fails');
drop trigger boom on public.user_stats;
select is((select last_closed_date from public.user_stats where user_id = pg_temp.u('82')), pg_temp.today(pg_temp.u('82')) - 1,
  'the other profile is closed');
select is((select count(*) from public.user_stats where user_id = pg_temp.u('81')), 0::bigint, 'the one that failed did not move');

-- PoC 5: the rows the job holds are for no key update, which the for key share of a foreign key (an
-- xp_events or task_occurrences insert of that profile) does not wait for.
select is((select array_agg(distinct m) from pgrowlocks('public.profiles') l, unnest(l.modes) m
  where l.locked_row = (select ctid from public.profiles where id = pg_temp.u('82'))),
  array['For No Key Update'], 'the job locks the profile for no key update');

select * from finish();
rollback;
