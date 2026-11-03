-- ADR-0008, section 17, SEG4-3. proof_in_review asked only for proof.review, so a role with that key and
-- without task.view_group would get the title of a task it does not see, and of an archived one. It now
-- needs to see the task and the task to be live, as can_review_proof does. Checked when writing and
-- again when the dispatcher claims the row.
create or replace function public.can_receive_notification(
  p_user uuid,
  p_type public.notification_type,
  p_occurrence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when p_type = 'proof_in_review' then
          public.can_view_task_for(p_user, t)
          and t.archived_at is null
          and t.group_id is not null
          and t.visibility = 'group'
          and public.proof_user_can(p_user, t.group_id, 'proof.review')
        else public.can_view_task_for(p_user, t)
      end
      from public.task_occurrences o
      join public.tasks t on t.id = o.task_id
      where o.id = p_occurrence_id
    ),
    false
  );
$$;
