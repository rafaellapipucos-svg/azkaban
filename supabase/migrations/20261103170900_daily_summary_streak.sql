-- ADR-0010, section 9, and ADR-0009, section 5. As before (20261103120700), with streak filled:
--   current    user_stats.current_streak, 0 without a row. At 8h it is almost always the streak up to
--              yesterday;
--   goalToday  completed occurrences that meet the goal of p_local_date (needed, section 3), null when
--              nothing is planned that day. The counts of the streak (user_day_counts), not the lists.
-- The emptiness of the summary still reads the totals only.
create or replace function public.daily_summary_source(p_user uuid, p_timezone text, p_local_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with prefs as (
    select p.daily_summary_include_overdue as include_overdue, p.daily_summary_deadline_days as days,
      public.whatsapp_rules() -> 'dailySummary' -> 'maxItems' as max_items,
      make_interval(hours => (public.task_rules() ->> 'lateCompletionWindowHours')::int) as late_window
    from public.profiles p
    where p.id = p_user
  ),
  base as (
    select o.id, o.status, o.scheduled_start, o.scheduled_due, t.schedule_type,
      jsonb_build_object(
        'occurrenceId', o.id,
        'title', t.title,
        'areaI18nKey', a.i18n_key,
        'contextName', c.name,
        'scheduleType', t.schedule_type,
        'startAt', o.scheduled_start,
        'dueAt', case when t.schedule_type = 'deadline' then o.scheduled_due end
      ) as item,
      ((case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end)
        at time zone p_timezone)::date as day,
      o.overdue_at < now()
        and (o.status = 'pending' or now() <= o.overdue_at + prefs.late_window) as overdue
    from prefs
    cross join public.task_occurrences o
    join public.tasks t on t.id = o.task_id
    join public.contexts c on c.id = t.context_id
    join public.areas a on a.id = c.area_id
    where o.assignee_id = p_user
      and o.status in ('pending', 'missed')
      and t.archived_at is null
      and public.can_view_task_for(p_user, t)
  ),
  lists as (
    select 'today' as list, b.item, row_number() over (order by b.scheduled_start, b.id) as n
    from base b
    where b.status = 'pending' and not b.overdue and b.day = p_local_date
    union all
    select 'overdue', b.item, row_number() over (order by b.scheduled_start, b.id)
    from base b, prefs
    where b.overdue and prefs.include_overdue
    union all
    select 'deadlines', b.item, row_number() over (order by b.scheduled_due, b.id)
    from base b, prefs
    where b.schedule_type = 'deadline' and b.status = 'pending' and not b.overdue
      and b.day > p_local_date and b.day <= p_local_date + prefs.days
  ),
  goal as (
    select case when c.planned > 0
      then (c.planned * (public.gamification_rules() -> 'goal' ->> 'percent')::int + 99) / 100 end as needed
    from public.user_day_counts(p_user, p_timezone, p_local_date) c
  )
  select jsonb_build_object(
    'localDate', p_local_date,
    'timezone', p_timezone,
    'today', (select coalesce(jsonb_agg(l.item order by l.n), '[]') from lists l
      where l.list = 'today' and l.n <= (prefs.max_items ->> 'today')::int),
    'overdue', case when prefs.include_overdue then (select coalesce(jsonb_agg(l.item order by l.n), '[]') from lists l
      where l.list = 'overdue' and l.n <= (prefs.max_items ->> 'overdue')::int) end,
    'deadlines', (select coalesce(jsonb_agg(l.item order by l.n), '[]') from lists l
      where l.list = 'deadlines' and l.n <= (prefs.max_items ->> 'deadlines')::int),
    'deadlineDays', prefs.days,
    'totals', jsonb_build_object(
      'today', (select count(*) from lists l where l.list = 'today'),
      'overdue', (select count(*) from lists l where l.list = 'overdue'),
      'deadlines', (select count(*) from lists l where l.list = 'deadlines')
    ),
    'streak', jsonb_build_object(
      'current', coalesce((select s.current_streak from public.user_stats s where s.user_id = p_user), 0),
      'goalToday', (select goal.needed from goal)
    )
  )
  from prefs;
$$;
