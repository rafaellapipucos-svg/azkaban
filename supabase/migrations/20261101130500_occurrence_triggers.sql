-- overdue_at: when the occurrence stops being on time (task_rules.autoMiss). end_of_day is the
-- local midnight after the due moment; the 1 second back-off keeps an exclusive end exactly at
-- midnight (all_day) in its own day, and a task at midnight with no duration after it.
create function public.occurrences_before_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  rule jsonb;
  stamp timestamptz;
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

  new.overdue_at := stamp + make_interval(mins => (rule ->> 'toleranceMinutes')::int);
  return new;
end;
$$;

revoke execute on function public.occurrences_before_schedule() from public, anon, authenticated;

create trigger task_occurrences_before_schedule
  before insert or update of scheduled_start, scheduled_due on public.task_occurrences
  for each row execute function public.occurrences_before_schedule();

-- Valid for every path, service role included. Who may make the change is the RPC's job.
-- The reason belongs to one transition, so reopening clears it; direct updates pass it themselves.
create function public.occurrences_before_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not exists (
    select 1 from public.occurrence_transitions
    where from_status = old.status and to_status = new.status
  ) then
    raise exception 'invalid_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;

  -- The clock decides, not the previous status, so it does not depend on the missed job.
  new.late := new.status in ('done', 'partial') and now() > new.overdue_at;
  if new.status = 'pending' then
    new.status_reason := null;
  end if;
  new.status_changed_at := now();
  new.status_changed_by := auth.uid();
  return new;
end;
$$;

-- Writes history and XP. Leaving done or partial adds a compensating event for the whole balance of
-- the occurrence, so a complete-and-reopen cycle sums to zero and events are never edited.
create function public.occurrences_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  rules jsonb;
  base int := 0;
  earned int;
  balance int;
  group_for_xp uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  insert into public.task_status_history (occurrence_id, from_status, to_status, changed_by, reason)
  values (new.id, old.status, new.status, new.status_changed_by, new.status_reason);

  select * into t from public.tasks where id = new.task_id;
  rules := public.task_rules();
  group_for_xp := case when t.visibility = 'private' then null else t.group_id end;

  select coalesce(sum(amount), 0) into balance from public.xp_events where occurrence_id = new.id;
  if balance <> 0 then
    insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
    values (new.assignee_id, group_for_xp, new.id, -balance, 'occurrence_reverted');
  end if;

  if new.status = 'done' then
    base := (rules -> 'xp' -> 'status' ->> (case when new.late then 'done_late' else 'done' end))::int;
  elsif new.status = 'partial' then
    base := (rules -> 'xp' -> 'status' ->> 'partial')::int;
  end if;

  earned := base * (rules -> 'xp' -> 'difficultyWeight' ->> t.difficulty::text)::int;
  if earned > 0 then
    insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
    values (
      new.assignee_id, group_for_xp, new.id, earned,
      case
        when new.status = 'partial' then 'occurrence_partial'
        when new.late then 'occurrence_done_late'
        else 'occurrence_done'
      end
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.occurrences_before_status() from public, anon, authenticated;
revoke execute on function public.occurrences_after_status() from public, anon, authenticated;

create trigger task_occurrences_before_status
  before update of status on public.task_occurrences
  for each row execute function public.occurrences_before_status();

create trigger task_occurrences_after_status
  after update of status on public.task_occurrences
  for each row execute function public.occurrences_after_status();
