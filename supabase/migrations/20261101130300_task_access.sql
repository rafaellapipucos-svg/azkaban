-- Who sees a task (ADR-0005, section 4). Group tasks need current membership, so leaving a
-- group cuts access. A private task is only ever visible to its owner, never through task.view_group.
-- The row overload exists for the policy: RETURNING after an insert has to read the new row, which a
-- by-id lookup inside a STABLE function cannot see.
create function public.can_view_task(p_task public.tasks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when p_task.group_id is null then p_task.assignee_id = (select auth.uid())
      else public.is_group_member(p_task.group_id)
        and (
          p_task.assignee_id = (select auth.uid())
          or p_task.created_by = (select auth.uid())
          or exists (
            select 1 from public.task_occurrences o
            where o.task_id = p_task.id and o.assignee_id = (select auth.uid())
          )
          or (p_task.visibility = 'group' and public.has_permission(p_task.group_id, 'task.view_group'))
        )
    end,
    false
  );
$$;

create function public.can_view_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t where t.id = p_task_id and public.can_view_task(t)
  );
$$;

-- editor: own task, or a group task with task.manage_group, or the assignee with task.edit_assigned.
create function public.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (t.group_id is null or public.is_group_member(t.group_id))
      and (
        (t.created_by = (select auth.uid()) and t.assignee_id = (select auth.uid()))
        or (
          t.group_id is not null and t.visibility = 'group'
          and public.has_permission(t.group_id, 'task.manage_group')
        )
        or (
          t.group_id is not null and t.assignee_id = (select auth.uid())
          and public.has_permission(t.group_id, 'task.edit_assigned')
        )
      )
  );
$$;

-- deleter: the same shape with task.delete_assigned.
create function public.can_delete_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (t.group_id is null or public.is_group_member(t.group_id))
      and (
        (t.created_by = (select auth.uid()) and t.assignee_id = (select auth.uid()))
        or (
          t.group_id is not null and t.visibility = 'group'
          and public.has_permission(t.group_id, 'task.manage_group')
        )
        or (
          t.group_id is not null and t.assignee_id = (select auth.uid())
          and public.has_permission(t.group_id, 'task.delete_assigned')
        )
      )
  );
$$;

revoke execute on function public.can_view_task(public.tasks) from public, anon;
revoke execute on function public.can_view_task(uuid) from public, anon;
revoke execute on function public.can_edit_task(uuid) from public, anon;
revoke execute on function public.can_delete_task(uuid) from public, anon;
grant execute on function public.can_view_task(public.tasks) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;
grant execute on function public.can_edit_task(uuid) to authenticated;
grant execute on function public.can_delete_task(uuid) to authenticated;

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.can_view_task(tasks));

-- Everything else about a new task (context, assignee, who may assign) is checked by the trigger.
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy task_occurrences_select on public.task_occurrences
  for select to authenticated
  using (public.can_view_task(task_id));

create policy task_status_history_select on public.task_status_history
  for select to authenticated
  using (exists (select 1 from public.task_occurrences o where o.id = occurrence_id));

create policy xp_events_select on public.xp_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No update or delete on tasks for the client, and no write at all on the three tables below:
-- changes go through the RPCs, and history and XP are written by triggers. Deleting is archiving.
grant select on public.tasks, public.task_occurrences, public.task_status_history, public.xp_events
  to authenticated;
grant insert (
  context_id, assignee_id, title, notes, schedule_type, start_at, due_at, duration_min, timezone,
  rrule, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason,
  difficulty, priority, visibility
) on public.tasks to authenticated;
