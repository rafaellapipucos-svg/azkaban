-- The only way a client changes a status (ADR-0005, section 5). Errors carry the code in the message,
-- and the UI maps it to i18n: forbidden, status_conflict, invalid_transition, reason_required,
-- late_window_expired. History and XP come from the triggers.
create function public.set_occurrence_status(
  p_occurrence_id uuid,
  p_to_status public.occurrence_status,
  p_expected_status public.occurrence_status,
  p_reason text
)
returns public.task_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  occ public.task_occurrences;
  t public.tasks;
  actors public.occurrence_actor[] := '{}';
  reason text := nullif(btrim(p_reason), '');
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Not found and not visible look the same, and only a visible row gets locked.
  select task_id into t.id from public.task_occurrences where id = p_occurrence_id;
  if t.id is null or not public.can_view_task(t.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into occ from public.task_occurrences where id = p_occurrence_id for update;
  select * into t from public.tasks where id = occ.task_id;

  if occ.status <> p_expected_status then
    raise exception 'status_conflict' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.occurrence_transitions
    where from_status = occ.status and to_status = p_to_status
  ) then
    raise exception 'invalid_transition' using errcode = '23514',
      detail = format('%s -> %s', occ.status, p_to_status);
  end if;

  if t.archived_at is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if occ.assignee_id = uid and (t.group_id is null or public.is_group_member(t.group_id)) then
    actors := actors || 'assignee'::public.occurrence_actor;
  end if;
  if public.can_edit_task(t.id) then
    actors := actors || 'editor'::public.occurrence_actor;
  end if;
  if public.can_delete_task(t.id) then
    actors := actors || 'deleter'::public.occurrence_actor;
  end if;

  if not exists (
    select 1 from public.occurrence_transitions
    where from_status = occ.status and to_status = p_to_status and actor = any (actors)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_to_status = 'partial' and t.requires_partial_reason and reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- Whoever manages the group's tasks corrects the past without a window.
  if p_to_status in ('done', 'partial')
    and now() > occ.overdue_at
      + make_interval(hours => (public.task_rules() ->> 'lateCompletionWindowHours')::int)
    and not (t.group_id is not null and public.has_permission(t.group_id, 'task.manage_group')) then
    raise exception 'late_window_expired' using errcode = 'P0001';
  end if;

  update public.task_occurrences
  set status = p_to_status, status_reason = reason
  where id = occ.id
  returning * into occ;

  -- A cancelled day of a series stays cancelled: its local day goes to exdates so the materialization
  -- never recreates it, even after the time or the zone of the series changes (ADR-0005, section 8).
  if p_to_status = 'cancelled' and t.rrule is not null then
    update public.tasks
    set exdates = array_append(exdates, (occ.scheduled_start at time zone t.timezone)::date)
    where id = t.id
      and not (occ.scheduled_start at time zone t.timezone)::date = any (exdates);
  end if;

  return occ;
end;
$$;

revoke execute on function public.set_occurrence_status(uuid, public.occurrence_status, public.occurrence_status, text)
  from public, anon;
grant execute on function public.set_occurrence_status(uuid, public.occurrence_status, public.occurrence_status, text)
  to authenticated;
