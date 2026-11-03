-- Gamification (ADR-0010): the daily cap and its lock, the proof bonus, the days, the streak with the
-- canonical cases of section 3 (the same table as packages/core), the perfect day, the achievements, the
-- close job, the ranking, the daily summary and the RLS of the new tables. Assume a hostile client.
-- The clock is the transaction's now(): days are built relative to the profile's today, and the close job
-- only takes profiles created before yesterday, which here is one profile backdated on purpose, so the
-- pg_cron run of the stack never changes what this suite sees.
begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

create function pg_temp.u(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-' || lpad(p, 12, '0'))::uuid;
$$;

-- a owns Casa (family), Firma (company) and Clube (other); b is a member of Casa and Firma; c is admin of
-- Casa; e is outside; x left Casa. 2xx are the streak cases, 3xx the cap, the loop, the zones, the job.
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(k), k || '@test.local', jsonb_build_object('display_name', 'User ' || k)
from unnest(array['a', 'b', 'c', 'e', 'f', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210',
  '211', '212', '213', '301', '302', '303', '304', '305', '306', '307']) k;
update public.profiles set timezone = 'Asia/Tokyo' where id = pg_temp.u('304');

insert into public.groups (id, name, type, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'Casa', 'family', pg_temp.u('a')),
  ('10000000-0000-0000-0000-00000000000c', 'Firma', 'company', pg_temp.u('a')),
  ('10000000-0000-0000-0000-00000000000e', 'Clube', 'other', pg_temp.u('a'));
insert into public.group_members (group_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', pg_temp.u('b'), 'member'),
  ('10000000-0000-0000-0000-00000000000a', pg_temp.u('c'), 'admin'),
  ('10000000-0000-0000-0000-00000000000a', pg_temp.u('f'), 'member'),
  ('10000000-0000-0000-0000-00000000000c', pg_temp.u('b'), 'member');
insert into public.contexts (id, area_id, group_id, owner_user_id, name, color_token, icon, created_by) values
  ('20000000-0000-0000-0000-00000000000a', (select id from public.areas where key = 'home'),
    '10000000-0000-0000-0000-00000000000a', null, 'Casa', 'teal', 'x', pg_temp.u('a'));
insert into public.contexts (area_id, group_id, owner_user_id, name, color_token, icon, created_by)
select (select id from public.areas where key = 'work'), null, p.id, 'Own', 'teal', 'x', p.id from public.profiles p
where p.id in (select pg_temp.u(k) from unnest(array['b', 'e', '201', '202', '203', '204', '205', '206', '207',
  '208', '209', '210', '211', '212', '213', '301', '302', '303', '304', '305', '306', '307']) k);

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

-- Today at noon in the profile's zone, plus p_min minutes: always the profile's today.
create function pg_temp.noon(p_user uuid, p_min int) returns timestamptz language sql as $$
  select (pg_temp.today(p_user) + time '12:00' + make_interval(mins => p_min)) at time zone timezone
  from public.profiles where id = p_user;
$$;

-- One task with its one occurrence, for p_user, at p_start. Personal by default.
create function pg_temp.mko(
  p_user uuid, p_start timestamptz, p_diff public.task_difficulty default 'easy', p_ctx uuid default null,
  p_vis public.task_visibility default 'private', p_photo boolean default false
) returns uuid language plpgsql as $$
declare tid uuid;
begin
  insert into public.tasks (
    context_id, created_by, assignee_id, title, schedule_type, start_at, duration_min, timezone, reminders,
    requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility
  ) values (
    coalesce(p_ctx, (select id from public.contexts where owner_user_id = p_user)), p_user, p_user,
    'G' || nextval('gseq'), 'timed', p_start, 30, 'America/Sao_Paulo', '[]', p_photo, false, false, p_diff,
    'normal', p_vis
  ) returning id into tid;
  return (select id from public.task_occurrences where task_id = tid);
end;
$$;

create function pg_temp.st(p_occ uuid, p_status public.occurrence_status) returns void language sql as $$
  update public.task_occurrences set status = p_status where id = p_occ;
$$;

-- Occurrences on the local day today - p_offset of the profile, at noon: done, partial, then pending.
-- The profile is backdated to that day at the latest, as days before its creation are not counted.
create function pg_temp.day(p_user uuid, p_offset int, p_done int, p_partial int default 0, p_pending int default 0)
returns void language plpgsql as $$
declare
  tz text := (select timezone from public.profiles where id = p_user);
  d date := pg_temp.today(p_user) - p_offset;
  o uuid;
begin
  update public.profiles set created_at = least(created_at, d::timestamp at time zone tz) where id = p_user;
  for i in 1 .. p_done + p_partial + p_pending loop
    o := pg_temp.mko(p_user, (d + time '12:00' + make_interval(mins => i)) at time zone tz);
    if i <= p_done then
      perform pg_temp.st(o, 'done');
    elsif i <= p_done + p_partial then
      perform pg_temp.st(o, 'partial');
    end if;
  end loop;
end;
$$;

-- The notation of the ADR: F met (one done, one partial: met, not perfect), P perfect (one done), x missed
-- (one pending), 0 empty, h+ and h- today. The last token is yesterday, or today when it is h+ or h-.
create function pg_temp.days(p_user uuid, p_days text) returns void language plpgsql as $$
declare
  tokens text[] := regexp_split_to_array(trim(p_days), '\s+');
  n int := cardinality(tokens);
  base int := case when tokens[n] like 'h%' then 0 else 1 end;
  off int;
begin
  for i in 1 .. n loop
    off := base + n - i;
    case tokens[i]
      when 'F' then perform pg_temp.day(p_user, off, 1, 1);
      when 'P' then perform pg_temp.day(p_user, off, 1);
      when 'x' then perform pg_temp.day(p_user, off, 0, 0, 1);
      when 'h+' then perform pg_temp.day(p_user, off, 1, 1);
      when 'h-' then perform pg_temp.day(p_user, off, 0, 0, 1);
      else null;
    end case;
  end loop;
  perform public.recompute_user_gamification(p_user);
end;
$$;

create function pg_temp.state(p_user uuid) returns int[] language sql as $$
  select array[current_streak, streak_freezes, perfect_run] from public.user_stats where user_id = p_user;
$$;

create function pg_temp.xp(p_occ uuid) returns bigint language sql as $$
  select coalesce(sum(amount), 0) from public.xp_events where occurrence_id = p_occ;
$$;

create function pg_temp.capped_today(p_user uuid) returns bigint language sql as $$
  select coalesce(sum(amount), 0) from public.xp_events
  where user_id = p_user and created_at = now() and reason not in ('perfect_day', 'perfect_day_reverted');
$$;

-- ===== Schema and mirror =====
select is((public.gamification_rules() -> 'xp' ->> 'dailyCap')::int, 300, 'gamification_rules is seeded and read by the accessor');
select is((select string_agg(key || ':' || kind || ':' || threshold, ',' order by sort_order) from public.achievements),
  'first_task:occurrences_done:1,streak_7:streak_days:7,streak_30:streak_days:30,proofs_100:proofs:100,perfect_week:perfect_run:7',
  'the achievements of section 5 are seeded');
select throws_ok($$insert into public.xp_events (user_id, amount, reason) values ('00000000-0000-0000-0000-00000000000e', 20, 'perfect_day')$$,
  '23514', 'new row for relation "xp_events" violates check constraint "xp_events_local_date_check"', 'a perfect day needs local_date');
select throws_ok($$insert into public.xp_events (user_id, amount, reason, local_date) values ('00000000-0000-0000-0000-00000000000e', 10, 'occurrence_done', current_date)$$,
  '23514', 'new row for relation "xp_events" violates check constraint "xp_events_local_date_check"', 'and no other reason takes it');
select throws_ok($$insert into public.xp_events (user_id, amount, reason) values ('00000000-0000-0000-0000-00000000000e', 10, 'bogus')$$,
  '23514', 'new row for relation "xp_events" violates check constraint "xp_events_reason_check"', 'an unknown reason is refused');
select lives_ok($$insert into public.xp_events (user_id, amount, reason) values ('00000000-0000-0000-0000-00000000000e', 7, 'shopping_completed')$$,
  'shopping_completed is reserved and accepted');
select is((select total_xp from public.user_stats where user_id = pg_temp.u('e')), 7, 'total_xp follows the insert, born by upsert');
select is((select schedule from cron.job where jobname = 'close-gamification-days'), '*/15 * * * *', 'the close job runs every 15 minutes');
select is(has_function_privilege('service_role', 'public.recompute_user_gamification(uuid)', 'execute'), true, 'the service role recomputes');
select is(has_function_privilege('authenticated', 'public.recompute_user_gamification(uuid)', 'execute'), false, 'a client does not');
select is(has_function_privilege('authenticated', 'public.refresh_user_day_counts(uuid, date)', 'execute'), false, 'nor refreshes a day');
select is(has_function_privilege('authenticated', 'public.close_gamification_days()', 'execute'), false, 'nor runs the close job');

-- ===== Canonical cases (section 3): [streak, freezes, perfectRun] =====
select pg_temp.days(pg_temp.u('201'), 'F F F');
select is(pg_temp.state(pg_temp.u('201')), array[3, 0, 0], 'F F F');
select pg_temp.days(pg_temp.u('202'), 'F 0 F');
select is(pg_temp.state(pg_temp.u('202')), array[2, 0, 0], 'F 0 F: an empty day does not break');
select pg_temp.days(pg_temp.u('203'), 'F F x F');
select is(pg_temp.state(pg_temp.u('203')), array[1, 0, 0], 'F F x F: no freeze');
select is((select best_streak from public.user_stats where user_id = pg_temp.u('203')), 2, 'and the best stays 2');
select pg_temp.days(pg_temp.u('204'), repeat('F ', 7));
select is(pg_temp.state(pg_temp.u('204')), array[7, 1, 0], 'F x7');
select pg_temp.days(pg_temp.u('205'), repeat('F ', 7) || 'x F');
select is(pg_temp.state(pg_temp.u('205')), array[8, 0, 0], 'F x7 x F');
select is((select freeze_used from public.user_day_stats where user_id = pg_temp.u('205') and local_date = pg_temp.today(pg_temp.u('205')) - 2),
  true, 'and the x records freezeUsed');
select pg_temp.days(pg_temp.u('206'), repeat('F ', 21));
select is(pg_temp.state(pg_temp.u('206')), array[21, 2, 0], 'F x21: the freezes stop at 2');
select pg_temp.days(pg_temp.u('207'), 'F F h-');
select is(pg_temp.state(pg_temp.u('207')), array[2, 0, 0], 'F F h-: today does not break yet');
select pg_temp.days(pg_temp.u('208'), 'F F h+');
select is(pg_temp.state(pg_temp.u('208')), array[3, 0, 0], 'F F h+: today counts once met');
select pg_temp.days(pg_temp.u('209'), 'P 0 P');
select is(pg_temp.state(pg_temp.u('209')), array[2, 0, 2], 'P 0 P');
select pg_temp.days(pg_temp.u('210'), 'P P F');
select is(pg_temp.state(pg_temp.u('210')), array[3, 0, 0], 'P P F: a met day that is not perfect ends the run');
select pg_temp.days(pg_temp.u('211'), 'F 0');
update public.app_settings set value = jsonb_set(value, '{streak,emptyDayKeepsStreak}', 'false') where key = 'gamification_rules';
select public.recompute_user_gamification(pg_temp.u('211'));
select is(pg_temp.state(pg_temp.u('211')), array[0, 0, 0], 'F 0 without emptyDayKeepsStreak: the empty day breaks');
update public.app_settings set value = jsonb_set(value, '{streak,emptyDayKeepsStreak}', 'true') where key = 'gamification_rules';
select pg_temp.days(pg_temp.u('212'), repeat('P ', 7));
select is(pg_temp.state(pg_temp.u('212')), array[7, 1, 7], 'P x7');

-- Achievements of the fold
select is((select string_agg(achievement_key, ',' order by achievement_key) from public.user_achievements where user_id = pg_temp.u('204')),
  'first_task,streak_7', 'F x7 grants first_task and streak_7');
select is((select string_agg(achievement_key, ',' order by achievement_key) from public.user_achievements where user_id = pg_temp.u('212')),
  'first_task,perfect_week,streak_7', 'P x7 grants perfect_week too');
select is((select count(*) from public.user_achievements where user_id = pg_temp.u('203') and achievement_key = 'streak_7'), 0::bigint,
  'a streak that never reached 7 grants nothing');

-- The goals of the end of section 3, on user 213
select pg_temp.day(pg_temp.u('213'), 1, 4, 0, 1);
select pg_temp.day(pg_temp.u('213'), 2, 3, 1, 1);
select pg_temp.day(pg_temp.u('213'), 3, 2, 0, 1);
select public.recompute_user_gamification(pg_temp.u('213'));
create function pg_temp.dayrow(p_user uuid, p_offset int) returns text language sql as $$
  select planned || '/' || done || '/' || partial || '/' || goal_met || '/' || perfect from public.user_day_stats
  where user_id = p_user and local_date = pg_temp.today(p_user) - p_offset;
$$;
select is(pg_temp.dayrow(pg_temp.u('213'), 1), '5/4/0/true/false', '4 of 5 meets the goal (400 >= 400)');
select is(pg_temp.dayrow(pg_temp.u('213'), 2), '5/3/1/true/false', '3 done and 1 partial of 5 meet it, with countPartial');
select is(pg_temp.dayrow(pg_temp.u('213'), 3), '3/2/0/false/false', '2 of 3 does not (200 < 240)');
select is(pg_temp.dayrow(pg_temp.u('213'), 4), null, 'a day with nothing planned has no row');
-- the pending ones of yesterday became nothing else: missed counts, pending is planned only
select is((select missed from public.user_day_stats where user_id = pg_temp.u('213') and local_date = pg_temp.today(pg_temp.u('213')) - 1), 0, 'pending is planned, not missed');

-- ===== The daily summary (section 9) =====
select pg_temp.day(pg_temp.u('307'), 0, 0, 0, 3);
select is(public.daily_summary_source(pg_temp.u('307'), 'America/Sao_Paulo', pg_temp.today(pg_temp.u('307'))) -> 'streak',
  '{"current": 0, "goalToday": 3}'::jsonb, 'the summary tells the streak and needed of 3 is 3');
select is(public.daily_summary_source(pg_temp.u('201'), 'America/Sao_Paulo', pg_temp.today(pg_temp.u('201'))) -> 'streak',
  '{"current": 3, "goalToday": null}'::jsonb, 'with the current streak, and null with nothing planned today');

-- ===== The daily cap (section 2) =====
create temp table cap_occ (n int, id uuid);
insert into cap_occ select i, pg_temp.mko(pg_temp.u('301'), pg_temp.noon(pg_temp.u('301'), i), 'hard') from generate_series(1, 11) i;
select pg_temp.st(id, 'done') from cap_occ order by n;
select is(pg_temp.capped_today(pg_temp.u('301')), 300::bigint, '11 hard tasks in one day give 300');
select is((select count(*) from public.xp_events where occurrence_id = (select id from cap_occ where n = 11)), 0::bigint, 'the 11th writes no event');
select ok(exists (
  select 1 from pg_locks l
  where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
    and ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended('xp_cap:' || pg_temp.u('301')::text, 0)
), 'the cap was read under the lock of the user');
select pg_temp.st(id, 'pending') from cap_occ where n = 1;
select is(pg_temp.capped_today(pg_temp.u('301')), 270::bigint, 'reopening one frees its value');
select pg_temp.st(id, 'pending') from cap_occ where n = 11;
select pg_temp.st(id, 'done') from cap_occ where n = 11;
select is(pg_temp.xp((select id from cap_occ where n = 11)), 30::bigint, 'which the 11th now takes');
select pg_temp.st(id, 'done') from cap_occ where n = 1;
select is(pg_temp.xp((select id from cap_occ where n = 1)), 0::bigint, 'and nothing more is left for the first');
select is(pg_temp.capped_today(pg_temp.u('301')), 300::bigint, 'the day stays at the cap');
select is((select coalesce(sum(amount), 0) from public.xp_events where user_id = pg_temp.u('301') and local_date is not null), 20::bigint,
  'the perfect day is outside the cap');

-- Reopening today 300 of yesterday does not turn into 600 of room today
create temp table old_occ (id uuid);
insert into old_occ select pg_temp.mko(pg_temp.u('302'), now() - interval '1 day' + make_interval(mins => i), 'hard') from generate_series(1, 10) i;
update public.task_occurrences set overdue_at = now() + interval '1 day' where id in (select id from old_occ);
select pg_temp.st(id, 'done') from old_occ;
update public.xp_events set created_at = now() - interval '1 day' where user_id = pg_temp.u('302');
select pg_temp.st(id, 'pending') from old_occ;
select is(pg_temp.capped_today(pg_temp.u('302')), -300::bigint, 'reopening yesterday''s 300 leaves today at -300');
select pg_temp.st(pg_temp.mko(pg_temp.u('302'), pg_temp.noon(pg_temp.u('302'), 100 + i), 'hard'), 'done') from generate_series(1, 21) i;
select is((select sum(amount) from public.xp_events where user_id = pg_temp.u('302') and created_at = now() and amount > 0
  and reason not in ('perfect_day', 'perfect_day_reverted')), 300::bigint, '21 hard tasks today still grant 300 at most, never 600');

-- ===== The loop (sections 2 and 5): done and reopen 20 times =====
create temp table loop_occ as select pg_temp.mko(pg_temp.u('303'), pg_temp.noon(pg_temp.u('303'), 1)) as id;
select pg_temp.st(id, 'done'), pg_temp.st(id, 'pending') from loop_occ, generate_series(1, 20);
select is(pg_temp.xp((select id from loop_occ)), 0::bigint, 'after 20 rounds the occurrence nets 0');
select is((select sum(amount) from public.xp_events where user_id = pg_temp.u('303') and local_date is not null), 0::bigint,
  'and the perfect day nets 0');
select is((select count(*) from public.user_achievements where user_id = pg_temp.u('303')), 1::bigint,
  'first_task was granted once, and reopening did not revoke it');
select pg_temp.st(id, 'done') from loop_occ;
select is(pg_temp.xp((select id from loop_occ)), 10::bigint, 'done once more: the value of the occurrence');
select is((select sum(amount) from public.xp_events where user_id = pg_temp.u('303') and local_date is not null), 20::bigint,
  'and one perfect day');
select is((select count(*) from public.user_achievements where user_id = pg_temp.u('303')), 1::bigint, 'still one achievement');
create temp table snap as select coalesce(sum(amount), 0) as xp from public.xp_events where user_id = pg_temp.u('303');
select public.recompute_user_gamification(pg_temp.u('303'));
select public.recompute_user_gamification(pg_temp.u('303'));
select is((select coalesce(sum(amount), 0) from public.xp_events where user_id = pg_temp.u('303')), (select xp from snap),
  'recomputing twice writes no event');
select is((select total_xp::bigint from public.user_stats where user_id = pg_temp.u('303')), (select xp from snap),
  'and total_xp is the sum');

-- ===== The zone of the profile: the same instant, 23:00 UTC, in Tokyo and in Sao Paulo =====
create temp table utc_day as select (now() at time zone 'UTC')::date - 2 as d;
update public.profiles set created_at = now() - interval '5 days' where id in (pg_temp.u('304'), pg_temp.u('305'));
select pg_temp.st(pg_temp.mko(pg_temp.u('304'), ((select d from utc_day) + time '23:00') at time zone 'UTC'), 'done');
select pg_temp.st(pg_temp.mko(pg_temp.u('305'), ((select d from utc_day) + time '23:00') at time zone 'UTC'), 'done');
select is((select local_date from public.user_day_stats where user_id = pg_temp.u('304')), (select d + 1 from utc_day),
  'in Tokyo the occurrence is on the next day');
select is((select local_date from public.user_day_stats where user_id = pg_temp.u('305')), (select d from utc_day),
  'in Sao Paulo on the same day');
select is((select local_date from public.xp_events where user_id = pg_temp.u('304') and reason = 'perfect_day'), (select d + 1 from utc_day),
  'and the perfect day follows each zone');
select is((select local_date from public.xp_events where user_id = pg_temp.u('305') and reason = 'perfect_day'), (select d from utc_day),
  'on both sides');

-- ===== The close job =====
update public.profiles set created_at = now() - interval '10 days' where id = pg_temp.u('306');
select pg_temp.day(pg_temp.u('306'), 3, 1);
select pg_temp.day(pg_temp.u('306'), 2, 0, 0, 1);
select is((select current_streak from public.user_stats where user_id = pg_temp.u('306')), 1, 'before the job, the untouched day is empty');
select ok(public.close_gamification_days() >= 1, 'the job closes profiles');
select is((select current_streak from public.user_stats where user_id = pg_temp.u('306')), 0, 'it counted the untouched day and broke the streak');
select is((select planned from public.user_day_stats where user_id = pg_temp.u('306') and local_date = pg_temp.today(pg_temp.u('306')) - 2), 1,
  'with its row');
select is((select last_closed_date from public.user_stats where user_id = pg_temp.u('306')), pg_temp.today(pg_temp.u('306')) - 1,
  'last_closed_date is yesterday');
create temp table snap_job as
  select (select string_agg(local_date || ':' || streak || ':' || freezes || ':' || perfect_run || ':' || planned, ',' order by local_date)
      from public.user_day_stats where user_id = pg_temp.u('306')) as days,
    (select sum(amount) from public.xp_events where user_id = pg_temp.u('306')) as xp;
select public.close_gamification_days();
select is((select string_agg(local_date || ':' || streak || ':' || freezes || ':' || perfect_run || ':' || planned, ',' order by local_date)
    from public.user_day_stats where user_id = pg_temp.u('306')),
  (select days from snap_job), 'a second run changes no day');
select is((select sum(amount) from public.xp_events where user_id = pg_temp.u('306')), (select xp from snap_job), 'and no XP');
select is((select last_closed_date from public.user_stats where user_id = pg_temp.u('307')), null, 'a profile created today is not closed yet');

-- ===== The ranking (section 6) =====
-- The current week of b, in b's zone (America/Sao_Paulo), starting on Monday.
create temp table week as select d - (extract(isodow from d)::int - 1) as ws from (select (now() at time zone 'America/Sao_Paulo')::date as d) x;
grant select on week to authenticated;
insert into public.xp_events (user_id, group_id, amount, reason, created_at) values
  (pg_temp.u('b'), '10000000-0000-0000-0000-00000000000a', 30, 'occurrence_done', now()),
  (pg_temp.u('c'), '10000000-0000-0000-0000-00000000000a', 30, 'occurrence_done', now()),
  (pg_temp.u('a'), '10000000-0000-0000-0000-00000000000a', 10, 'occurrence_done', now()),
  (pg_temp.u('a'), '10000000-0000-0000-0000-00000000000a', -10, 'occurrence_reverted', now()),
  (pg_temp.u('f'), '10000000-0000-0000-0000-00000000000a', 50, 'occurrence_done', now()),
  (pg_temp.u('b'), null, 100, 'occurrence_done', now()),
  (pg_temp.u('b'), '10000000-0000-0000-0000-00000000000a', 500, 'occurrence_done', now() - interval '10 days');
insert into public.xp_events (user_id, amount, reason, local_date) values (pg_temp.u('b'), 20, 'perfect_day', current_date);
delete from public.group_members where group_id = '10000000-0000-0000-0000-00000000000a' and user_id = pg_temp.u('f');
create function pg_temp.ranking(p_group uuid) returns text language sql as $$
  select string_agg(display_name || ':' || xp || ':' || rank, ',' order by rank, display_name)
  from public.group_ranking(p_group, (select ws from week));
$$;

select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.ranking('10000000-0000-0000-0000-00000000000a'), 'User b:30:1,User c:30:1',
  'family without the key: on; only group XP of the week, ties share the rank, zero and ex-members are out');
select throws_ok($$select * from public.group_ranking('10000000-0000-0000-0000-00000000000c', (select ws from week))$$,
  'P0001', 'ranking_disabled', 'company without the key: off');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$select * from public.group_ranking('10000000-0000-0000-0000-00000000000e', (select ws from week))$$,
  'P0001', 'ranking_disabled', 'other without the key: off');
select throws_ok($$update public.groups set settings = '{"rankingEnabled": "true"}' where id = '10000000-0000-0000-0000-00000000000c'$$,
  '23514', 'new row for relation "groups" violates check constraint "groups_settings_ranking_enabled_check"', 'rankingEnabled as text is refused');
select lives_ok($$update public.groups set settings = '{"rankingEnabled": true}' where id = '10000000-0000-0000-0000-00000000000c'$$,
  'the owner turns it on in a company');
select lives_ok($$update public.groups set settings = '{"rankingEnabled": false}' where id = '10000000-0000-0000-0000-00000000000a'$$,
  'and off in a family');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.ranking('10000000-0000-0000-0000-00000000000c'), null, 'company turned on: a member reads it, empty');
select throws_ok($$select * from public.group_ranking('10000000-0000-0000-0000-00000000000a', (select ws from week))$$,
  'P0001', 'ranking_disabled', 'family turned off');
select pg_temp.login(pg_temp.u('e'));
select throws_ok($$select * from public.group_ranking('10000000-0000-0000-0000-00000000000c', (select ws from week))$$,
  '42501', 'forbidden', 'someone outside the group is forbidden');
select pg_temp.login(pg_temp.u('f'));
select throws_ok($$select * from public.group_ranking('10000000-0000-0000-0000-00000000000a', (select ws from week))$$,
  '42501', 'forbidden', 'and so is someone who left');
select pg_temp.pg();

-- ===== The proof bonus (section 1), on b in Casa, reviewed by c =====
create function pg_temp.proof(p_occ uuid) returns uuid language sql as $$
  insert into public.task_proofs (occurrence_id, challenge_id, user_id, sha256, size_bytes, width_px, height_px,
    captured_at_device, received_at, clock_delta_seconds)
  values (p_occ, gen_random_uuid(), null, lpad(to_hex(nextval('gseq')), 64, '0'), 1, 1, 1, now(), now(), 0)
  returning id;
$$;
create temp table pb (n int, occ uuid, proof uuid);
insert into pb (n, occ) select i, pg_temp.mko(pg_temp.u('b'), now() + make_interval(hours => 2, mins => i), 'easy',
  '20000000-0000-0000-0000-00000000000a', 'group', true) from generate_series(1, 2) i;
update pb set proof = pg_temp.proof(occ);
grant select on pb to authenticated;
update public.task_proofs set review_status = 'in_review' where id = (select proof from pb where n = 2);
update public.task_occurrences o set status = 'done', current_proof_id = pb.proof, proof_review_status = 'unreviewed'
from pb where pb.n = 1 and o.id = pb.occ;
select is(pg_temp.xp((select occ from pb where n = 1)), 15::bigint, 'done with a proof: the base and the bonus at once');
select is((select amount from public.xp_events where occurrence_id = (select occ from pb where n = 1) and reason = 'proof_bonus'), 5,
  'the bonus is its own event');
update public.task_occurrences o set status = 'done', current_proof_id = pb.proof, proof_review_status = 'in_review'
from pb where pb.n = 2 and o.id = pb.occ;
select is(pg_temp.xp((select occ from pb where n = 2)), 0::bigint, 'in review: nothing yet');
select pg_temp.login(pg_temp.u('c'));
select public.review_proof((select proof from pb where n = 2), 'approve', null, null);
select public.review_proof((select proof from pb where n = 1), 'dispute', 'missed', 'blurry');
select pg_temp.pg();
select is(pg_temp.xp((select occ from pb where n = 2)), 15::bigint, 'the approval pays the base and the bonus');
select is(pg_temp.xp((select occ from pb where n = 1)), 0::bigint, 'the dispute compensates both');

-- ===== RLS (section 7) =====
select pg_temp.login(pg_temp.u('b'));
select is((select count(*) from public.user_stats), 1::bigint, 'b reads its own stats');
select ok((select count(*) from public.user_day_stats) > 0, 'its days');
select ok((select count(*) from public.user_achievements) > 0, 'its achievements');
select is((select count(*) from public.user_stats where user_id <> pg_temp.u('b'))
  + (select count(*) from public.user_day_stats where user_id <> pg_temp.u('b'))
  + (select count(*) from public.user_achievements where user_id <> pg_temp.u('b'))
  + (select count(*) from public.xp_events where user_id <> pg_temp.u('b')), 0::bigint, 'and nobody else''s');
select is((select count(*) from public.achievements), 5::bigint, 'every signed-in user reads the achievements');
select throws_ok($$insert into public.user_stats (user_id, total_xp) values (auth.uid(), 99999)$$, '42501', 'permission denied for table user_stats', 'the client writes no stats');
select throws_ok($$update public.user_day_stats set streak = 99$$, '42501', 'permission denied for table user_day_stats', 'no day');
select throws_ok($$delete from public.user_achievements$$, '42501', 'permission denied for table user_achievements', 'deletes no achievement');
select throws_ok($$insert into public.user_achievements (user_id, achievement_key) values (auth.uid(), 'streak_30')$$, '42501', 'permission denied for table user_achievements', 'grants none to itself');
select throws_ok($$insert into public.xp_events (user_id, amount, reason) values (auth.uid(), 1000, 'occurrence_done')$$, '42501', 'permission denied for table xp_events', 'and writes no XP');
select throws_ok($$update public.achievements set threshold = 1$$, '42501', 'permission denied for table achievements', 'nor edits the achievements');
select pg_temp.login(pg_temp.u('c'));
select is((select count(*) from public.user_stats where user_id = pg_temp.u('b'))
  + (select count(*) from public.user_day_stats where user_id = pg_temp.u('b'))
  + (select count(*) from public.user_achievements where user_id = pg_temp.u('b'))
  + (select count(*) from public.xp_events where user_id = pg_temp.u('b')), 0::bigint, 'the admin of b''s group reads none of b''s');
select pg_temp.pg();
set local role anon;
select throws_ok($$select * from public.user_stats$$, '42501', 'permission denied for table user_stats', 'anon reads no stats');
select throws_ok($$select * from public.achievements$$, '42501', 'permission denied for table achievements', 'nor the achievements');
reset role;

-- ===== total_xp is the sum of xp_events, for everyone =====
select is((select count(*) from public.user_stats s
  where s.total_xp <> (select coalesce(sum(e.amount), 0) from public.xp_events e where e.user_id = s.user_id)), 0::bigint,
  'every total_xp equals the sum of its events');

select * from finish();
rollback;

