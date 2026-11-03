-- edit_task for ADR-0007, section 20. Everything else is the version of 20261101172000.
-- 1. proof_flags_locked (SEG-1). Whoever has task.manage_group and is not the owner, changing a flag, sets
--    it: on while a group task keeps a flag, off when both are off. With it on, the owner does not change
--    the flags and nobody takes the task to private, where no one could unlock it. Both splits copy it.
-- 2. proof_visibility_locked (SEG-2, SEG-9). A row with any proof, superseded or not, does not change
--    visibility, in either direction, among the rows the scope would move.
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
  new_window record;
  own boolean;
  manager boolean;
  flags_changed boolean;
  locked boolean;
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

  own := t.created_by = uid and t.assignee_id = uid;
  manager := t.group_id is not null and t.visibility = 'group'
    and public.has_permission(t.group_id, 'task.manage_group');
  flags_changed := f."requiresPhotoProof" is distinct from t.requires_photo_proof
    or f."requiresAdminApproval" is distinct from t.requires_admin_approval;

  if (flags_changed and not (manager or (own and not t.proof_flags_locked)))
    or (f.visibility = 'private' and t.proof_flags_locked) then
    raise exception 'proof_flags_locked' using errcode = '42501';
  end if;

  locked := case
    when flags_changed and not own
      then f.visibility = 'group' and (f."requiresPhotoProof" or f."requiresAdminApproval")
    else t.proof_flags_locked
  end;

  -- A one-off task has no series to split, and the first occurrence has nothing before it.
  if t.rrule is null or (scope = 'this_and_following' and p_head_rrule is null) then
    scope := 'all';
  end if;

  -- A private task belongs to its owner alone. Rows of someone else that would move into it, or stay
  -- under it, would vanish for that person and for the group, together with their reasons. Pending rows
  -- with no history are just replaced or reassigned by the edit, so they do not count. In a split only
  -- the rows from the pivot on that are resolved move; the ones before it stay in the original.
  if f.visibility = 'private' and scope in ('this_and_following', 'all') and exists (
    select 1 from public.task_occurrences o
    where o.task_id = t.id
      and o.assignee_id <> f."assigneeId"
      and (scope = 'all' or o.scheduled_start >= occ.scheduled_start)
      and (
        o.status <> 'pending'
        or (scope = 'all' and exists (select 1 from public.task_status_history h where h.occurrence_id = o.id))
      )
  ) then
    raise exception 'private_with_other_assignee' using errcode = '23514';
  end if;

  -- In a split only the resolved rows from the pivot on go to the new task.
  if f.visibility is distinct from t.visibility and exists (
    select 1
    from public.task_occurrences o
    join public.task_proofs p on p.occurrence_id = o.id
    where o.task_id = t.id
      and case scope
        when 'all' then true
        when 'this' then o.id = occ.id
        else o.status <> 'pending' and o.scheduled_start >= occ.scheduled_start
      end
  ) then
    raise exception 'proof_visibility_locked' using errcode = '23514';
  end if;

  if scope in ('this', 'this_and_following') then
    if scope = 'this' and occ.status <> 'pending' then
      raise exception 'occurrence_not_pending' using errcode = 'P0001';
    end if;
    pivot := occ.scheduled_start;

    if scope = 'this_and_following' then
      -- The form of a split carries the start of the pivot, so the schedule is compared with the pivot
      -- occurrence, and not with the anchor of the series. COUNT is left out: the tail of a counted
      -- series gets a smaller one without the user having changed anything.
      select * into new_window
      from public.occurrence_window(f."scheduleType", f."startAt", f."dueAt", f."durationMin", f.timezone);

      if (
        f."scheduleType", f.timezone, new_window.scheduled_start, new_window.scheduled_due,
        regexp_replace(coalesce(p_rrule, ''), ';COUNT=[0-9]+', '')
      ) is distinct from (
        t.schedule_type, t.timezone, occ.scheduled_start, occ.scheduled_due,
        regexp_replace(coalesce(t.rrule, ''), ';COUNT=[0-9]+', '')
      ) and exists (
        select 1 from public.task_occurrences o
        where o.task_id = t.id and o.status = 'pending' and o.scheduled_start >= pivot
          and o.overdue_at < now()
          and not public.occurrence_forgives_overdue(t.group_id, f.visibility, o.assignee_id, f."assigneeId")
      ) then
        raise exception 'overdue_occurrence_blocks_edit' using errcode = 'P0001';
      end if;
    end if;

    insert into public.tasks (
      context_id, assignee_id, created_by, title, notes, schedule_type, start_at, due_at, duration_min,
      timezone, rrule, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason,
      difficulty, priority, visibility, parent_task_id, proof_flags_locked
    ) values (
      f."contextId", f."assigneeId", t.created_by, btrim(f.title), f.notes, f."scheduleType", f."startAt",
      f."dueAt", f."durationMin", f.timezone, case when scope = 'this' then null else p_rrule end,
      f.reminders, f."requiresPhotoProof", f."requiresAdminApproval", f."requiresPartialReason",
      f.difficulty, f.priority, f.visibility, t.id, locked
    ) returning id into new_id;

    if scope = 'this' then
      -- The same row, with its id, history and XP, becomes the one occurrence of a new one-off task.
      -- The excluded unit is the local day, so later edits to the time or the zone cannot revive it.
      -- The trigger on the schedule keeps overdue_at when the row was already overdue.
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

  -- The rows below are deleted or cancelled and recreated with a deadline of their own. A one-off task
  -- that stays one-off is not: its row is updated, and the trigger keeps the delay.
  if changed and not (t.rrule is null and p_rrule is null) and exists (
    select 1 from public.task_occurrences o
    where o.task_id = t.id and o.status = 'pending' and o.overdue_at < now()
      and (p_rrule is null or o.scheduled_start >= now())
      and not public.occurrence_forgives_overdue(t.group_id, f.visibility, o.assignee_id, f."assigneeId")
  ) then
    raise exception 'overdue_occurrence_blocks_edit' using errcode = 'P0001';
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
      proof_flags_locked = locked,
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
    -- Every pending occurrence still to be marked red changes hands, started ones included: a deadline
    -- that began on Monday and ends on Friday has to move too. auto_miss_at follows the schedule, so a
    -- row moved to tomorrow still changes hands although its overdue_at has passed.
    update public.task_occurrences
    set assignee_id = f."assigneeId"
    where task_id = t.id and status = 'pending' and auto_miss_at > now()
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
