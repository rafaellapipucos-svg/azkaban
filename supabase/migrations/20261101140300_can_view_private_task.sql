-- A private task was visible to anyone who still held an occurrence of it: the branch for "assignee of
-- some occurrence" did not look at visibility. An admin who completed an occurrence while the task was a
-- group task kept seeing it, its notes and its history after the owner made it private. Only a group
-- task can be seen through an occurrence or through task.view_group; a private one belongs to its owner,
-- who is both creator and assignee (tasks_private_assignee_check).
-- set_occurrence_status, edit_task and the occurrence and history policies all start from this function,
-- so they close with it.
create or replace function public.can_view_task(p_task public.tasks)
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
          or (
            p_task.visibility = 'group'
            and (
              exists (
                select 1 from public.task_occurrences o
                where o.task_id = p_task.id and o.assignee_id = (select auth.uid())
              )
              or public.has_permission(p_task.group_id, 'task.view_group')
            )
          )
        )
    end,
    false
  );
$$;
