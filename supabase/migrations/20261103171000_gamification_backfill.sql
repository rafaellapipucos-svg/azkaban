-- ADR-0010, section 11. Recomputes the totals of one user from the history: total_xp as the sum of
-- xp_events, the counts and the perfect-day bonus of every day since the first occurrence (at most 400
-- days back), the fold from that day, and the achievements. Events are never rewritten; only the bonus of
-- the perfect day is conciliated, which is idempotent. Service role only.
create function public.recompute_user_gamification(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  today date;
  first date;
  d date;
begin
  select public.profile_timezone(p.timezone) into tz from public.profiles p where p.id = p_user;
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
  first := greatest(first, today - 400);

  for d in select g::date from generate_series(first, today, interval '1 day') g loop
    perform public.refresh_user_day_counts(p_user, d);
  end loop;
  perform public.refold_streak(p_user, first);
  perform public.grant_achievements(p_user);
end;
$$;

revoke execute on function public.recompute_user_gamification(uuid) from public, anon, authenticated;
grant execute on function public.recompute_user_gamification(uuid) to service_role;

-- Backfill: every profile, then the close job starts from yesterday.
select public.recompute_user_gamification(p.id) from public.profiles p;

insert into public.user_stats as s (user_id, last_closed_date)
select p.id, (now() at time zone public.profile_timezone(p.timezone))::date - 1 from public.profiles p
on conflict (user_id) do update set last_closed_date = excluded.last_closed_date, updated_at = now();
