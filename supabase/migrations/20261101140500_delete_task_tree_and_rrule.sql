-- delete_task all archives the series and its descendants, but only those the caller may delete (a
-- private child of the member was archived by the admin before). The head rule is checked against the
-- same grammar as edit_task.
create or replace function public.delete_task(
  p_occurrence_id uuid,
  p_scope public.task_edit_scope,
  p_head_rrule text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  scope public.task_edit_scope := p_scope;
  occ public.task_occurrences;
  t public.tasks;
  task_id_of uuid;
  ids uuid[];
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
  if t.archived_at is not null or not public.can_delete_task(t.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_head_rrule is not null and not public.is_valid_rrule(p_head_rrule) then
    raise exception 'invalid_rrule' using errcode = '22023';
  end if;

  if scope = 'this_and_following' and (t.rrule is null or p_head_rrule is null) then
    scope := 'all';
  end if;

  if scope = 'this' then
    -- Goes through the RPC, which also records the excluded day of a recurring task.
    perform public.set_occurrence_status(occ.id, 'cancelled', occ.status, null);

  elsif scope = 'this_and_following' then
    update public.tasks set rrule = p_head_rrule where id = t.id;
    update public.task_occurrences
    set status = 'cancelled'
    where task_id = t.id and status = 'pending' and scheduled_start >= occ.scheduled_start;

  else
    -- The series and every task split or detached from it.
    with recursive tree as (
      select id from public.tasks where id = t.id
      union
      select c.id from public.tasks c join tree on c.parent_task_id = tree.id
    )
    -- Only what the caller may delete: a private child of the member, or a child that ended up in
    -- another group, is not the admin's to archive. The task being deleted passed can_delete_task above.
    select array_agg(id) into ids from tree where public.can_delete_task(tree.id);

    update public.task_occurrences
    set status = 'cancelled'
    where task_id = any (ids) and status = 'pending';

    update public.tasks set archived_at = coalesce(archived_at, now()) where id = any (ids);
  end if;
end;
$$;
