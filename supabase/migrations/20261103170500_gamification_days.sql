-- ADR-0010, sections 3, 4 and 5: the counts of a local day, the perfect-day bonus, the streak and the
-- achievements, all derived, all idempotent. The status trigger refreshes the day of the occurrence; the
-- close job (next migration) the days nobody touched. Same rules as dailyGoal and foldStreak in core.

-- The day of an occurrence in p_tz: the due day of a deadline, the start day otherwise (occurrenceDay).
create function public.occurrence_local_day(p_occ public.task_occurrences, p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select ((case when t.schedule_type = 'deadline' then p_occ.scheduled_due else p_occ.scheduled_start end)
    at time zone p_tz)::date
  from public.tasks t where t.id = p_occ.task_id;
$$;

-- Counts of p_date in p_tz for p_user: occurrences not cancelled, of personal tasks or of groups the user
-- is still a member of; in_review counts as done. The range on the timestamps only narrows the scan.
create function public.user_day_counts(p_user uuid, p_tz text, p_date date)
returns table (planned int, done int, partial int, missed int)
language sql
stable
set search_path = ''
as $$
  select count(*)::int,
    (count(*) filter (where o.status = 'done'))::int,
    (count(*) filter (where o.status = 'partial'))::int,
    (count(*) filter (where o.status = 'missed'))::int
  from public.task_occurrences o
  join public.tasks t on t.id = o.task_id
  where o.assignee_id = p_user
    and o.status <> 'cancelled'
    and o.scheduled_start < (p_date + 1)::timestamp at time zone p_tz
    and o.scheduled_due >= p_date::timestamp at time zone p_tz
    and ((case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end)
      at time zone p_tz)::date = p_date
    and (t.group_id is null or exists (
      select 1 from public.group_members m where m.group_id = t.group_id and m.user_id = p_user
    ));
$$;

-- The counts of one day and the conciliation of its bonus, without the fold. A day with nothing planned
-- and no row stays without a row. The bonus due is perfectDayBonus on a perfect day that is not in the
-- future, else 0; only the difference to the balance of that local_date is written.
create function public.refresh_user_day_counts(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.gamification_rules();
  tz text;
  c record;
  met boolean;
  perfect boolean;
  due int;
  balance int;
begin
  select public.profile_timezone(p.timezone) into tz from public.profiles p where p.id = p_user;
  if tz is null then
    return;
  end if;

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

  due := case when perfect and p_date <= (now() at time zone tz)::date
    then (rules -> 'xp' ->> 'perfectDayBonus')::int else 0 end;
  select coalesce(sum(e.amount), 0) into balance
  from public.xp_events e where e.user_id = p_user and e.local_date = p_date;
  if due <> balance then
    insert into public.xp_events (user_id, amount, reason, local_date)
    values (p_user, due - balance, case when due > balance then 'perfect_day' else 'perfect_day_reverted' end, p_date);
  end if;
end;
$$;

-- Folds the streak from p_from to today (section 3), starting from the state of the last row before it,
-- and copies the final state to user_stats. Days without a row are empty. It starts earlier when a day
-- after last_closed_date was folded while it was still open. best is the highest streak of any row, which
-- is where a streak peaks.
create function public.refold_streak(p_user uuid, p_from date)
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
  today date;
  start date;
  s int := 0;
  best int := 0;
  fr int := 0;
  pr int := 0;
  used boolean;
  r record;
begin
  select public.profile_timezone(p.timezone), us.last_closed_date into tz, start
  from public.profiles p left join public.user_stats us on us.user_id = p.id
  where p.id = p_user;
  if tz is null or p_from is null then
    return;
  end if;
  today := (now() at time zone tz)::date;
  start := least(p_from, coalesce(start + 1, p_from));
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

-- Section 5. Only the achievements not granted yet, never revoked. Counts are of distinct occurrences in
-- their current state, never of events, stopping at the threshold.
create function public.grant_achievements(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_achievements (user_id, achievement_key)
  select p_user, a.key
  from public.achievements a
  where not exists (
      select 1 from public.user_achievements ua where ua.user_id = p_user and ua.achievement_key = a.key
    )
    and case a.kind
      when 'occurrences_done' then (
        select count(*) from (
          select 1 from public.task_occurrences o
          where o.assignee_id = p_user and o.status = 'done'
            and o.proof_review_status is distinct from 'in_review'
          limit a.threshold
        ) x
      ) >= a.threshold
      when 'proofs' then (
        select count(*) from (
          select 1 from public.task_occurrences o
          where o.assignee_id = p_user and o.status = 'done' and o.current_proof_id is not null
            and o.proof_review_status in ('unreviewed', 'approved')
          limit a.threshold
        ) x
      ) >= a.threshold
      when 'streak_days' then exists (
        select 1 from public.user_day_stats d where d.user_id = p_user and d.streak >= a.threshold
      )
      when 'perfect_run' then exists (
        select 1 from public.user_day_stats d where d.user_id = p_user and d.perfect_run >= a.threshold
      )
      else false
    end
  on conflict do nothing;
end;
$$;

-- Section 4: counts and bonus of the day, the fold from that day to today, and the achievements.
create function public.refresh_user_day(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_user_day_counts(p_user, p_date);
  perform public.refold_streak(p_user, p_date);
  perform public.grant_achievements(p_user);
end;
$$;

-- Any change of status or of the proof's review, from any writer, refreshes the day of the occurrence for
-- its assignee. The review counts for the proofs achievement, not for the day.
create function public.occurrences_after_gamification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
begin
  select public.profile_timezone(p.timezone) into tz from public.profiles p where p.id = new.assignee_id;
  perform public.refresh_user_day(new.assignee_id, public.occurrence_local_day(new, tz));
  return new;
end;
$$;

revoke execute on function public.occurrence_local_day(public.task_occurrences, text) from public, anon, authenticated;
revoke execute on function public.user_day_counts(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.refresh_user_day_counts(uuid, date) from public, anon, authenticated;
revoke execute on function public.refold_streak(uuid, date) from public, anon, authenticated;
revoke execute on function public.grant_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_user_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.occurrences_after_gamification() from public, anon, authenticated;

-- Named to fire after task_occurrences_after_status (same event, alphabetical), so the XP comes first.
create trigger task_occurrences_after_status_gamification
  after update of status, proof_review_status on public.task_occurrences
  for each row
  when (old.status is distinct from new.status or old.proof_review_status is distinct from new.proof_review_status)
  execute function public.occurrences_after_gamification();
