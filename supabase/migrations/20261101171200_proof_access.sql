-- Who sees and who reviews a proof (ADR-0007, section 10). Stricter than can_view_task: a photo is
-- more sensitive than a status, and a colleague who answered for another day of the series sees
-- the task, not the picture.

-- The author, while they still see the task, and whoever has proof.review on a group task. A private
-- task has no reviewer, so an admin sees nothing of it. A row overload, like can_view_task.
create function public.can_view_proof(p_proof public.task_proofs)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select public.can_view_task(t)
        and (
          p_proof.user_id = (select auth.uid())
          or (
            t.group_id is not null and t.visibility = 'group'
            and public.has_permission(t.group_id, 'proof.review')
          )
        )
      from public.task_occurrences o
      join public.tasks t on t.id = o.task_id
      where o.id = p_proof.occurrence_id
    ),
    false
  );
$$;

-- A current member with proof.review on a group task that is not archived, who is not the author:
-- nobody approves their own photo. A null author, after the account was deleted, blocks nobody.
create function public.can_review_proof(p_occurrence_id uuid, p_author_id uuid)
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
        and t.archived_at is null
        and public.is_group_member(t.group_id)
        and public.has_permission(t.group_id, 'proof.review')
    ),
    false
  );
$$;

revoke execute on function public.can_view_proof(public.task_proofs) from public, anon;
revoke execute on function public.can_review_proof(uuid, uuid) from public, anon;
grant execute on function public.can_view_proof(public.task_proofs) to authenticated;
grant execute on function public.can_review_proof(uuid, uuid) to authenticated;

create policy task_proofs_select on public.task_proofs
  for select to authenticated
  using (public.can_view_proof(task_proofs));
