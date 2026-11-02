-- ADR-0007, section 20 (SEG-1). The path of a task of your own does not delete or cancel what an admin
-- required. set_occurrence_status and delete_task inherit this. can_edit_task stays: the owner still edits
-- the title and the time.
create or replace function public.can_delete_task(p_task_id uuid)
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
        (
          t.created_by = (select auth.uid()) and t.assignee_id = (select auth.uid())
          and not t.proof_flags_locked
        )
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
