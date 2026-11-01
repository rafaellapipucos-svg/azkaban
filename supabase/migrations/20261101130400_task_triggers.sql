-- scheduled_start is never null, which keeps (task_id, scheduled_start) unique. For a timed task
-- the end is start + duration; an all_day task ends at the next local midnight of its day.
create function public.occurrence_window(
  p_schedule_type public.schedule_type,
  p_start_at timestamptz,
  p_due_at timestamptz,
  p_duration_min int,
  p_timezone text
)
returns table (scheduled_start timestamptz, scheduled_due timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(p_start_at, p_due_at),
    case p_schedule_type
      when 'deadline' then p_due_at
      when 'all_day' then ((p_start_at at time zone p_timezone)::date + 1)::timestamp at time zone p_timezone
      else p_start_at + make_interval(mins => coalesce(p_duration_min, 0))
    end;
$$;

revoke execute on function public.occurrence_window(public.schedule_type, timestamptz, timestamptz, int, text)
  from public, anon, authenticated;

-- Integrity rules always apply. Permission rules need a user, so postgres and the service role
-- (jobs, tests) skip them: auth.uid() is null there.
create function public.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx public.contexts;
  old_ctx public.contexts;
  uid uuid := auth.uid();
begin
  select * into ctx from public.contexts where id = new.context_id;
  if not found then
    raise exception 'context_not_found' using errcode = '23503';
  end if;

  -- Raises 22023 for an unknown zone.
  perform now() at time zone new.timezone;

  -- group_id never changes, so a task cannot escape its group by changing context.
  if tg_op = 'UPDATE' then
    select * into old_ctx from public.contexts where id = old.context_id;
    if ctx.group_id is distinct from old_ctx.group_id
      or ctx.owner_user_id is distinct from old_ctx.owner_user_id then
      raise exception 'context_change_not_allowed' using errcode = '23514';
    end if;
  end if;

  new.group_id := ctx.group_id;

  if ctx.group_id is null then
    -- A personal context holds only its owner's private tasks.
    if new.visibility <> 'private'
      or new.assignee_id <> ctx.owner_user_id
      or new.created_by <> ctx.owner_user_id then
      raise exception 'personal_context_requires_private_self' using errcode = '23514';
    end if;
    return new;
  end if;

  -- The caller comes first, so an outsider learns nothing about who is in the group.
  if uid is not null then
    if not public.is_group_member(ctx.group_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
      and new.assignee_id <> uid
      and not public.has_permission(ctx.group_id, 'task.create_for_others') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if not exists (
      select 1 from public.group_members
      where group_id = ctx.group_id and user_id = new.assignee_id
    ) then
      raise exception 'assignee_not_member' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.tasks_before_write() from public, anon, authenticated;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function public.tasks_before_write();

create trigger tasks_before_update
  before update of context_id, assignee_id, visibility, group_id, timezone on public.tasks
  for each row execute function public.tasks_before_write();

-- A one-off task has exactly one occurrence, made here. A task born with parent_task_id
-- (split or detached by edit_task) reuses an existing one. Recurring tasks are materialized by the
-- materialize-occurrences Edge Function.
create function public.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rrule is null and new.parent_task_id is null then
    insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due)
    select new.id, new.assignee_id, w.scheduled_start, w.scheduled_due
    from public.occurrence_window(
      new.schedule_type, new.start_at, new.due_at, new.duration_min, new.timezone
    ) w;
  end if;
  return new;
end;
$$;

-- Keeps the pending occurrence of a one-off task in step with its schedule and assignee.
create function public.tasks_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rrule is null and new.rrule is null then
    update public.task_occurrences o
    set assignee_id = new.assignee_id,
        scheduled_start = w.scheduled_start,
        scheduled_due = w.scheduled_due
    from public.occurrence_window(
      new.schedule_type, new.start_at, new.due_at, new.duration_min, new.timezone
    ) w
    where o.task_id = new.id and o.status = 'pending';
  end if;
  return new;
end;
$$;

revoke execute on function public.tasks_after_insert() from public, anon, authenticated;
revoke execute on function public.tasks_after_update() from public, anon, authenticated;

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function public.tasks_after_insert();

create trigger tasks_after_update
  after update of schedule_type, start_at, due_at, duration_min, timezone, assignee_id on public.tasks
  for each row execute function public.tasks_after_update();
