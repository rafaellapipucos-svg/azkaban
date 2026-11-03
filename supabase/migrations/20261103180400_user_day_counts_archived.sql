-- ADR-0010, section 14 (informative note of the review). As before (20261103170500), without archived
-- tasks: archiving is how a task is deleted, its pending occurrence can never be done
-- (set_occurrence_status refuses it) and the auto-miss job skips it, so it kept the day from being perfect.
-- Hoje and daily_summary_source already leave archived tasks out. Archiving touches no occurrence, so the
-- day is recounted by its next change or by the close job, and days already closed keep their counts.
create or replace function public.user_day_counts(p_user uuid, p_tz text, p_date date)
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
    and t.archived_at is null
    and o.scheduled_start < (p_date + 1)::timestamp at time zone p_tz
    and o.scheduled_due >= p_date::timestamp at time zone p_tz
    and ((case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end)
      at time zone p_tz)::date = p_date
    and (t.group_id is null or exists (
      select 1 from public.group_members m where m.group_id = t.group_id and m.user_id = p_user
    ));
$$;
