-- ADR-0005, section 11: rescheduling keeps the delay. overdue_at stays where it was once it has
-- passed, and the new auto_miss_at follows the schedule for the red-by-default job of F4-6, which
-- must not mark red an occurrence that was just moved to tomorrow.
alter table public.task_occurrences add column auto_miss_at timestamptz;
update public.task_occurrences set auto_miss_at = overdue_at;
alter table public.task_occurrences alter column auto_miss_at set not null;

create index task_occurrences_auto_miss_idx
  on public.task_occurrences (auto_miss_at) where status = 'pending';

-- Whoever answers for an occurrence does not forgive their own delay. Only someone with authority over
-- the group's tasks, who is neither the old nor the new assignee, grants a new deadline to another
-- person. No user, as in a job or the service role, forgives nothing. One function for the trigger
-- and for edit_task, which cannot rely on the trigger when it deletes and recreates rows.
create function public.occurrence_forgives_overdue(
  p_group_id uuid,
  p_visibility public.task_visibility,
  p_old_assignee uuid,
  p_new_assignee uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (select auth.uid()) is distinct from p_old_assignee
    and (select auth.uid()) is distinct from p_new_assignee
    and p_group_id is not null
    and p_visibility = 'group'
    and public.has_permission(p_group_id, 'task.manage_group'),
    false
  );
$$;

revoke execute on function public.occurrence_forgives_overdue(uuid, public.task_visibility, uuid, uuid)
  from public, anon, authenticated;

-- overdue_at: when the occurrence stops being on time (task_rules.autoMiss). end_of_day is the
-- local midnight after the due moment; the 1 second back-off keeps an exclusive end exactly at
-- midnight (all_day) in its own day, and a task at midnight with no duration after it.
create or replace function public.occurrences_before_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  rule jsonb;
  stamp timestamptz;
  computed timestamptz;
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then
    raise exception 'task_not_found' using errcode = '23503';
  end if;

  rule := public.task_rules() -> 'autoMiss' -> t.schedule_type::text;
  if rule ->> 'anchor' = 'due' then
    stamp := new.scheduled_due;
  else
    stamp := (
      (greatest(new.scheduled_start, new.scheduled_due - interval '1 second') at time zone t.timezone)::date + 1
    )::timestamp at time zone t.timezone;
  end if;

  computed := stamp + make_interval(mins => (rule ->> 'toleranceMinutes')::int);
  new.auto_miss_at := computed;

  -- Moving earlier only brings the delay forward, so it follows the schedule. Moving later after the
  -- deadline passed is the case the rule closes.
  if tg_op = 'UPDATE'
    and old.overdue_at < now()
    and computed > old.overdue_at
    and not public.occurrence_forgives_overdue(t.group_id, t.visibility, old.assignee_id, new.assignee_id) then
    new.overdue_at := old.overdue_at;
  else
    new.overdue_at := computed;
  end if;
  return new;
end;
$$;
