-- edit_task refuses a rule outside the grammar of is_valid_rrule (20261101140000) before touching
-- anything. delete_task gets the same guard in the migration that changes its tree.
create or replace function public.edit_task(
  p_occurrence_id uuid,
  p_scope public.task_edit_scope,
  p_task jsonb,
  p_rrule text,
  p_head_rrule text
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  scope public.task_edit_scope := p_scope;
  occ public.task_occurrences;
  t public.tasks;
  f record;
  task_id_of uuid;
  new_id uuid;
  pivot timestamptz;
  changed boolean;
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select task_id into task_id_of from public.task_occurrences where id = p_occurrence_id;
  if task_id_of is null or not public.can_view_task(task_id_of) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = task_id_of for update;
  select * into occ from public.task_occurrences where id = p_occurrence_id for update;
  if t.archived_at is not null or not public.can_edit_task(t.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only the rules the app writes reach the table; the CHECK would say the same, later and less clearly.
  if (p_rrule is not null and not public.is_valid_rrule(p_rrule))
    or (p_head_rrule is not null and not public.is_valid_rrule(p_head_rrule)) then
    raise exception 'invalid_rrule' using errcode = '22023';
  end if;

  if p_task is null or jsonb_typeof(p_task) <> 'object' then
    raise exception 'invalid_task' using errcode = '22023';
  end if;

  select * into f from jsonb_to_record(p_task) as x(
    "contextId" uuid, "assigneeId" uuid, title text, notes text,
    "scheduleType" public.schedule_type, "startAt" timestamptz, "dueAt" timestamptz,
    "durationMin" int, timezone text, reminders jsonb,
    "requiresPhotoProof" boolean, "requiresAdminApproval" boolean, "requiresPartialReason" boolean,
    difficulty public.task_difficulty, priority public.task_priority, visibility public.task_visibility
  );

  -- A one-off task has no series to split, and the first occurrence has nothing before it.
  if t.rrule is null or (scope = 'this_and_following' and p_head_rrule is null) then
    scope := 'all';
  end if;

  if scope in ('this', 'this_and_following') then
    if scope = 'this' and occ.status <> 'pending' then
      raise exception 'occurrence_not_pending' using errcode = 'P0001';
    end if;
    pivot := occ.scheduled_start;

    insert into public.tasks (
      context_id, assignee_id, created_by, title, notes, schedule_type, start_at, due_at, duration_min,
      timezone, rrule, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason,
      difficulty, priority, visibility, parent_task_id
    ) values (
      f."contextId", f."assigneeId", t.created_by, btrim(f.title), f.notes, f."scheduleType", f."startAt",
      f."dueAt", f."durationMin", f.timezone, case when scope = 'this' then null else p_rrule end,
      f.reminders, f."requiresPhotoProof", f."requiresAdminApproval", f."requiresPartialReason",
      f.difficulty, f.priority, f.visibility, t.id
    ) returning id into new_id;

    if scope = 'this' then
      -- The same row, with its id, history and XP, becomes the one occurrence of a new one-off task.
      -- The excluded unit is the local day, so later edits to the time or the zone cannot revive it.
      update public.tasks
      set exdates = case
        when (occ.scheduled_start at time zone t.timezone)::date = any (exdates) then exdates
        else array_append(exdates, (occ.scheduled_start at time zone t.timezone)::date)
      end
      where id = t.id;

      update public.task_occurrences o
      set task_id = new_id,
          assignee_id = f."assigneeId",
          scheduled_start = w.scheduled_start,
          scheduled_due = w.scheduled_due
      from public.occurrence_window(f."scheduleType", f."startAt", f."dueAt", f."durationMin", f.timezone) w
      where o.id = occ.id;

      return '{}';
    end if;

    -- this_and_following: the original ends before the pivot, the new task takes over from it,
    -- including the excluded days from the pivot on.
    update public.tasks
    set exdates = (
      select coalesce(array_agg(d), '{}')
      from unnest(t.exdates) d
      where d >= (pivot at time zone t.timezone)::date
    )
    where id = new_id;
    update public.tasks set rrule = p_head_rrule where id = t.id;

    update public.task_occurrences
    set task_id = new_id
    where task_id = t.id and scheduled_start >= pivot and status <> 'pending';

    delete from public.task_occurrences o
    where o.task_id = t.id and o.status = 'pending' and o.scheduled_start >= pivot
      and not exists (select 1 from public.task_status_history h where h.occurrence_id = o.id);

    update public.task_occurrences
    set status = 'cancelled'
    where task_id = t.id and status = 'pending' and scheduled_start >= pivot;

    if p_rrule is null then
      insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due)
      select new_id, f."assigneeId", w.scheduled_start, w.scheduled_due
      from public.occurrence_window(f."scheduleType", f."startAt", f."dueAt", f."durationMin", f.timezone) w
      on conflict (task_id, scheduled_start) do nothing;
      return '{}';
    end if;

    -- The resolved rows that moved keep their days: the new hour starts tomorrow.
    perform public.exclude_kept_days(new_id);
    return array[new_id];
  end if;

  -- scope = all
  changed := (t.schedule_type, t.start_at, t.due_at, t.duration_min, t.timezone, t.rrule)
    is distinct from (f."scheduleType", f."startAt", f."dueAt", f."durationMin", f.timezone, p_rrule);

  if t.rrule is null and changed and occ.status <> 'pending' then
    raise exception 'occurrence_not_pending' using errcode = 'P0001';
  end if;

  update public.tasks
  set context_id = f."contextId",
      assignee_id = f."assigneeId",
      title = btrim(f.title),
      notes = f.notes,
      schedule_type = f."scheduleType",
      start_at = f."startAt",
      due_at = f."dueAt",
      duration_min = f."durationMin",
      timezone = f.timezone,
      rrule = p_rrule,
      reminders = f.reminders,
      requires_photo_proof = f."requiresPhotoProof",
      requires_admin_approval = f."requiresAdminApproval",
      requires_partial_reason = f."requiresPartialReason",
      difficulty = f.difficulty,
      priority = f.priority,
      visibility = f.visibility,
      materialized_until = case when changed and p_rrule is not null then now() else materialized_until end
  where id = t.id;

  -- A one-off task that stays one-off was fully handled by the tasks_after_update trigger.
  if t.rrule is null and p_rrule is null then
    return '{}';
  end if;

  if not changed then
    -- Every pending occurrence still on time changes hands, started ones included: a deadline that
    -- began on Monday and ends on Friday has to move too.
    update public.task_occurrences
    set assignee_id = f."assigneeId"
    where task_id = t.id and status = 'pending' and overdue_at > now()
      and assignee_id is distinct from f."assigneeId";
    return '{}';
  end if;

  -- The schedule changed: future pending occurrences no longer match it. Resolved and past ones are
  -- history. Those with history keep their row as cancelled, which also stops them being recreated.
  -- A series that stops repeating has one pending occurrence at most, so all of them go.
  delete from public.task_occurrences o
  where o.task_id = t.id and o.status = 'pending' and (p_rrule is null or o.scheduled_start >= now())
    and not exists (select 1 from public.task_status_history h where h.occurrence_id = o.id);

  update public.task_occurrences
  set status = 'cancelled'
  where task_id = t.id and status = 'pending' and (p_rrule is null or scheduled_start >= now());

  if p_rrule is null then
    insert into public.task_occurrences (task_id, assignee_id, scheduled_start, scheduled_due)
    select t.id, f."assigneeId", w.scheduled_start, w.scheduled_due
    from public.occurrence_window(f."scheduleType", f."startAt", f."dueAt", f."durationMin", f.timezone) w
    on conflict (task_id, scheduled_start) do nothing;
    return '{}';
  end if;

  -- One day, one occurrence: the rows that stayed keep their days, the new hour starts tomorrow.
  perform public.exclude_kept_days(t.id);
  return array[t.id];
end;
$$;
