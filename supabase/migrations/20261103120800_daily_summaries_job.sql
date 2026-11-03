-- ADR-0009, section 5. Every minute, like the reminder scan: up to whatsappRules.dailySummary.batchSize
-- profiles with the summary on and WhatsApp ready, whose local time is in
-- [local date + daily_summary_time, + catchUpMinutes) and whose last summary is from an earlier local
-- date. Each one gets daily_summary_last_date = local date and, unless the day is empty and
-- daily_summary_skip_empty is on, one daily_summary notification keyed by that date. Idempotent per user
-- and local date at both ends: the column keeps the profile from being taken again, and the key keeps the
-- row from being written twice. Changing the time after the summary went out sends nothing more that day.
-- A cron stopped for longer than catchUpMinutes loses that day's summary. Returns the summaries written.
create function public.enqueue_daily_summaries()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.whatsapp_rules() -> 'dailySummary';
  catch_up interval := make_interval(mins => (rules ->> 'catchUpMinutes')::int);
  r record;
  written int := 0;
begin
  for r in
    select p.id, p.daily_summary_skip_empty, z.tz, d.local_date, d.local_date + p.daily_summary_time as local_at
    from public.profiles p
    cross join lateral (select public.profile_timezone(p.timezone) as tz) z
    cross join lateral (select (now() at time zone z.tz)::date as local_date) d
    where p.daily_summary_enabled
      and public.is_whatsapp_ready(p)
      and (p.daily_summary_last_date is null or p.daily_summary_last_date < d.local_date)
      and now() at time zone z.tz >= d.local_date + p.daily_summary_time
      and now() at time zone z.tz < d.local_date + p.daily_summary_time + catch_up
    order by p.id
    limit (rules ->> 'batchSize')::int
    for update of p skip locked
  loop
    update public.profiles set daily_summary_last_date = r.local_date where id = r.id;

    if (not r.daily_summary_skip_empty
        or not public.daily_summary_is_empty(public.daily_summary_source(r.id, r.tz, r.local_date)))
      and public.enqueue_notification(
        r.id, 'daily_summary', null, null,
        jsonb_build_object('localDate', r.local_date),
        r.local_date::text,
        r.local_at at time zone r.tz
      ) is not null then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

-- Only the summaries' candidates, so the scan every minute reads the few ready profiles.
create index profiles_daily_summary_idx on public.profiles (id)
  where daily_summary_enabled and whatsapp_opt_in_at is not null;

revoke execute on function public.enqueue_daily_summaries() from public, anon, authenticated;

select cron.schedule('enqueue-daily-summaries', '* * * * *', 'select public.enqueue_daily_summaries()');
