-- ADR-0012, section 4 (SEG4-1). set_occurrence_status counts occurrence_status per caller. Placed
-- first: a refused change raises and undoes its own + 1, so only applied changes count. The rest is
-- 20261101171500_set_occurrence_status_proof as it was.
create or replace function public.set_occurrence_status(
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
  perform public.consume_rate_limit(uid, 'occurrence_status');

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

  if occ.proof_review_status = 'disputed' and not public.can_review_proof(
    occ.id, (select p.user_id from public.task_proofs p where p.id = occ.current_proof_id)
  ) then
    raise exception 'proof_disputed' using errcode = 'P0001';
  end if;

  if p_to_status = 'done' and t.requires_photo_proof then
    raise exception 'proof_required' using errcode = 'P0001';
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
