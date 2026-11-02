-- ADR-0007, section 20 (SEG-2). Deleting a task no longer takes its proofs from the reviewer.
-- set_occurrence_status tests archived_at before this, so only review_proof acts on an archived task.
-- A current member with proof.review on a group task, who is not the author: nobody approves their own
-- photo. A null author blocks nobody.
create or replace function public.can_review_proof(p_occurrence_id uuid, p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (select auth.uid()) is distinct from p_author_id
    and exists (
      select 1
      from public.task_occurrences o
      join public.tasks t on t.id = o.task_id
      where o.id = p_occurrence_id
        and t.group_id is not null
        and t.visibility = 'group'
        and public.is_group_member(t.group_id)
        and public.has_permission(t.group_id, 'proof.review')
    ),
    false
  );
$$;
