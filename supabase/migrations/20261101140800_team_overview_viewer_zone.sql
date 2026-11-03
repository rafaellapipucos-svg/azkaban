-- The team view counts days in the viewer's zone (ADR-0006, section 1), not in each task's own zone: the
-- admin looks at one calendar, and a 23:30 task of someone in another zone belongs to the day the admin
-- sees. A deadline counts on the day it is due, not on the day it was opened. One row per current member
-- and day with something to count (teamOverviewRowSchema). Only the group's `group` tasks count: private
-- ones never reach an admin. cancelled is ignored.
drop function public.team_overview(uuid, date, date);

create function public.team_overview(p_group_id uuid, p_from date, p_to date, p_timezone text)
returns table (
  user_id uuid,
  display_name text,
  date date,
  pending int,
  done int,
  partial int,
  missed int,
  late int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.has_permission(p_group_id, 'task.view_group') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_timezone is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  -- An unknown zone fails here with Postgres' own 22023.
  return query
  select
    o.assignee_id,
    p.display_name,
    d.day,
    (count(*) filter (where o.status = 'pending'))::int,
    (count(*) filter (where o.status = 'done'))::int,
    (count(*) filter (where o.status = 'partial'))::int,
    (count(*) filter (where o.status = 'missed'))::int,
    (count(*) filter (where o.late))::int
  from public.task_occurrences o
  join public.tasks t on t.id = o.task_id
  join public.group_members m on m.group_id = p_group_id and m.user_id = o.assignee_id
  join public.profiles p on p.id = o.assignee_id
  cross join lateral (
    select (
      (case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end)
      at time zone p_timezone
    )::date as day
  ) d
  where t.group_id = p_group_id
    and t.visibility = 'group'
    and o.status <> 'cancelled'
    and d.day between p_from and p_to
  group by o.assignee_id, p.display_name, d.day
  order by 3, p.display_name;
end;
$$;

revoke execute on function public.team_overview(uuid, date, date, text) from public, anon;
grant execute on function public.team_overview(uuid, date, date, text) to authenticated;
