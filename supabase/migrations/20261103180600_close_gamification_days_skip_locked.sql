-- ADR-0010, section 14, SEG6-5. As before (20261103170600), with:
--   - for no key update instead of for update, which no longer waits for nor blocks the for key share of
--     the foreign keys, so a completion, an occurrence or a notification of a profile in the batch goes on;
--   - one subtransaction per profile: an error is a warning, that profile's last_closed_date does not
--     move, and the rest of the batch still closes. It comes back first in the next pass, and fails alone.
create or replace function public.close_gamification_days()
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
    for no key update of p skip locked
  loop
    begin
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
    exception when others then
      raise warning 'close_gamification_days: profile % failed: % (%)', r.id, sqlerrm, sqlstate;
    end;
  end loop;

  return closed;
end;
$$;
