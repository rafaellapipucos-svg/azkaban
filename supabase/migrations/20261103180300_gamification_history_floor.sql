-- ADR-0010, section 14, SEG6-2. An occurrence in the distant past made the status trigger and the
-- auto-miss job fold thousands of days per row. Now:
--   - the floor: no day before greatest(local creation date - 1, local today - gamificationRules.historyDays)
--     is counted, folded or rewarded, here, in the fold, in the recount and in the trigger;
--   - perfect_day only from the local creation date (the "- 1" only keeps a move west from losing day one);
--   - one refresh per (user, day) and one fold per user per statement, from the least day touched, so a
--     batch of 500 rows of the auto-miss job folds each person at most once.

create function public.gamification_history_floor(p_created_at timestamptz, p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest(
    (p_created_at at time zone p_tz)::date - 1,
    (now() at time zone p_tz)::date - (public.gamification_rules() ->> 'historyDays')::int
  );
$$;

revoke execute on function public.gamification_history_floor(timestamptz, text) from public, anon, authenticated;

-- As before (20261103170500), with the floor and the perfect day only from the creation date.
create or replace function public.refresh_user_day_counts(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.gamification_rules();
  tz text;
  created timestamptz;
  today date;
  c record;
  met boolean;
  perfect boolean;
  due int;
  balance int;
begin
  select public.profile_timezone(p.timezone), p.created_at into tz, created from public.profiles p where p.id = p_user;
  if tz is null or p_date < public.gamification_history_floor(created, tz) then
    return;
  end if;
  today := (now() at time zone tz)::date;

  select * into c from public.user_day_counts(p_user, tz, p_date);
  met := c.planned > 0 and (c.done + case when (rules -> 'goal' ->> 'countPartial')::boolean then c.partial else 0 end)
    * 100 >= c.planned * (rules -> 'goal' ->> 'percent')::int;
  perfect := c.planned > 0 and c.done = c.planned;

  if c.planned > 0 or exists (
    select 1 from public.user_day_stats where user_id = p_user and local_date = p_date
  ) then
    insert into public.user_day_stats as s (user_id, local_date, planned, done, partial, missed, goal_met, perfect)
    values (p_user, p_date, c.planned, c.done, c.partial, c.missed, met, perfect)
    on conflict (user_id, local_date) do update
    set planned = excluded.planned, done = excluded.done, partial = excluded.partial, missed = excluded.missed,
      goal_met = excluded.goal_met, perfect = excluded.perfect;
  end if;

  due := case when perfect and p_date <= today and p_date >= (created at time zone tz)::date
    then (rules -> 'xp' ->> 'perfectDayBonus')::int else 0 end;
  select coalesce(sum(e.amount), 0) into balance
  from public.xp_events e where e.user_id = p_user and e.local_date = p_date;
  if due <> balance then
    insert into public.xp_events (user_id, amount, reason, local_date)
    values (p_user, due - balance, case when due > balance then 'perfect_day' else 'perfect_day_reverted' end, p_date);
  end if;
end;
$$;

-- As before (20261103170500), starting no earlier than the floor.
create or replace function public.refold_streak(p_user uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.gamification_rules() -> 'streak';
  keep_empty boolean := (rules ->> 'emptyDayKeepsStreak')::boolean;
  every int := (rules ->> 'freezeEveryDays')::int;
  max_freezes int := (rules ->> 'maxFreezes')::int;
  tz text;
  created timestamptz;
  today date;
  start date;
  s int := 0;
  best int := 0;
  fr int := 0;
  pr int := 0;
  used boolean;
  r record;
begin
  select public.profile_timezone(p.timezone), p.created_at, us.last_closed_date into tz, created, start
  from public.profiles p left join public.user_stats us on us.user_id = p.id
  where p.id = p_user;
  if tz is null or p_from is null then
    return;
  end if;
  today := (now() at time zone tz)::date;
  start := greatest(least(p_from, coalesce(start + 1, p_from)), public.gamification_history_floor(created, tz));
  if start > today then
    return;
  end if;

  select d.streak, d.freezes, d.perfect_run into s, fr, pr
  from public.user_day_stats d
  where d.user_id = p_user and d.local_date < start
  order by d.local_date desc limit 1;
  s := coalesce(s, 0);
  fr := coalesce(fr, 0);
  pr := coalesce(pr, 0);
  select coalesce(max(d.streak), 0) into best
  from public.user_day_stats d where d.user_id = p_user and d.local_date < start;

  for r in
    select g.day::date as day, d.user_id is not null as has_row,
      coalesce(d.planned, 0) as planned, coalesce(d.goal_met, false) as goal_met, coalesce(d.perfect, false) as perfect
    from generate_series(start, today, interval '1 day') g (day)
    left join public.user_day_stats d on d.user_id = p_user and d.local_date = g.day::date
    order by g.day
  loop
    used := false;
    if r.planned = 0 and keep_empty then
      null;
    elsif r.goal_met then
      s := s + 1;
      best := greatest(best, s);
      if s % every = 0 then
        fr := least(max_freezes, fr + 1);
      end if;
      pr := case when r.perfect then pr + 1 else 0 end;
    elsif r.day < today then
      if fr > 0 then
        fr := fr - 1;
        used := true;
      else
        s := 0;
      end if;
      -- A closed empty day, when it breaks, still does not end a run of perfect days.
      if r.planned > 0 then
        pr := 0;
      end if;
    end if;

    if r.has_row then
      update public.user_day_stats
      set freeze_used = used, streak = s, freezes = fr, perfect_run = pr
      where user_id = p_user and local_date = r.day;
    end if;
  end loop;

  insert into public.user_stats as us (user_id, current_streak, best_streak, streak_freezes, perfect_run)
  values (p_user, s, best, fr, pr)
  on conflict (user_id) do update
  set current_streak = excluded.current_streak, best_streak = excluded.best_streak,
    streak_freezes = excluded.streak_freezes, perfect_run = excluded.perfect_run, updated_at = now();
end;
$$;

-- As before (20261103171000), from the floor instead of 400 days back.
create or replace function public.recompute_user_gamification(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  created timestamptz;
  today date;
  first date;
  d date;
begin
  select public.profile_timezone(p.timezone), p.created_at into tz, created from public.profiles p where p.id = p_user;
  if tz is null then
    return;
  end if;
  today := (now() at time zone tz)::date;

  -- First, so the perfect-day events written below add to it through the trigger.
  insert into public.user_stats as s (user_id, total_xp)
  values (p_user, (select coalesce(sum(e.amount), 0) from public.xp_events e where e.user_id = p_user))
  on conflict (user_id) do update set total_xp = excluded.total_xp, updated_at = now();

  select min(public.occurrence_local_day(o, tz)) into first
  from public.task_occurrences o where o.assignee_id = p_user;
  if first is null or first > today then
    return;
  end if;
  first := greatest(first, public.gamification_history_floor(created, tz));

  for d in select g::date from generate_series(first, today, interval '1 day') g loop
    perform public.refresh_user_day_counts(p_user, d);
  end loop;
  perform public.refold_streak(p_user, first);
  perform public.grant_achievements(p_user);
end;
$$;

-- The rows whose status or review changed, grouped by assignee: each day at or after the floor refreshed
-- once, one fold from the least of them, and the achievements, which count occurrences of any day. Fires
-- after the row triggers of the same statement, so the XP comes first.
create function public.occurrences_after_gamification_statement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  d date;
begin
  for r in
    select x.uid, array_agg(distinct x.day order by x.day) filter (where x.day >= x.floor) as days
    from (
      select n.assignee_id as uid, public.occurrence_local_day(n, z.tz) as day,
        public.gamification_history_floor(p.created_at, z.tz) as floor
      from new_rows n
      join old_rows o on o.id = n.id
      join public.profiles p on p.id = n.assignee_id
      cross join lateral (select public.profile_timezone(p.timezone) as tz) z
      where o.status is distinct from n.status or o.proof_review_status is distinct from n.proof_review_status
    ) x
    group by x.uid
  loop
    if r.days is not null then
      foreach d in array r.days loop
        perform public.refresh_user_day_counts(r.uid, d);
      end loop;
      perform public.refold_streak(r.uid, r.days[1]);
    end if;
    perform public.grant_achievements(r.uid);
  end loop;
  return null;
end;
$$;

revoke execute on function public.occurrences_after_gamification_statement() from public, anon, authenticated;

drop trigger task_occurrences_after_status_gamification on public.task_occurrences;
drop function public.occurrences_after_gamification();

-- Transition tables take no column list, so it fires on every update and filters inside.
create trigger task_occurrences_after_status_gamification
  after update on public.task_occurrences
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.occurrences_after_gamification_statement();

-- Only the status trigger called it; the statement trigger does its parts per user.
drop function public.refresh_user_day(uuid, date);
