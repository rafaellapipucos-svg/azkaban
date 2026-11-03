-- ADR-0010, section 4. Every 15 minutes: up to closeJob.batchSize profiles whose last closed day is before
-- yesterday in their own zone. Each gets the counts and the bonus of every day from last_closed_date + 1
-- (the day before the profile was created, if never closed) to yesterday, at most maxCatchUpDays back,
-- then one fold and the achievements, and last_closed_date only moves forward. This closes the days nobody
-- touched, counts occurrences deleted, reassigned or created later, and breaks the streak of whoever did
-- not meet the goal. A pass with nothing to do reads the list. Returns the profiles closed.
create function public.close_gamification_days()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.gamification_rules() -> 'closeJob';
  max_back int := (rules ->> 'maxCatchUpDays')::int;
  r record;
  first date;
  d date;
  closed int := 0;
begin
  for r in
    select p.id, y.yesterday,
      coalesce(us.last_closed_date, (p.created_at at time zone z.tz)::date - 1) as last_closed
    from public.profiles p
    cross join lateral (select public.profile_timezone(p.timezone) as tz) z
    cross join lateral (select (now() at time zone z.tz)::date - 1 as yesterday) y
    left join public.user_stats us on us.user_id = p.id
    where coalesce(us.last_closed_date, (p.created_at at time zone z.tz)::date - 1) < y.yesterday
    order by p.id
    limit (rules ->> 'batchSize')::int
    for update of p skip locked
  loop
    first := greatest(r.last_closed + 1, r.yesterday - max_back + 1);
    for d in select g::date from generate_series(first, r.yesterday, interval '1 day') g loop
      perform public.refresh_user_day_counts(r.id, d);
    end loop;
    perform public.refold_streak(r.id, first);
    perform public.grant_achievements(r.id);

    insert into public.user_stats as us (user_id, last_closed_date)
    values (r.id, r.yesterday)
    on conflict (user_id) do update
    set last_closed_date = greatest(us.last_closed_date, excluded.last_closed_date), updated_at = now();
    closed := closed + 1;
  end loop;

  return closed;
end;
$$;

revoke execute on function public.close_gamification_days() from public, anon, authenticated;

select cron.schedule('close-gamification-days', '*/15 * * * *', 'select public.close_gamification_days()');
