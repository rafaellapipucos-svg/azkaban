-- ADR-0012, section 3, SEG8-2P-3 (BL-12). As 20261104120400, except that reusing the open row sets its
-- requested_at to now(): every attempt starts the hold of accept_invite again
-- (privacyRules.openDeletionHoldMinutes). requested_at is the start of the last attempt.
create or replace function public.begin_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview jsonb;
  solo uuid[];
  deletion uuid;
begin
  -- The profile lock serializes two deletions of the same account.
  perform 1 from public.profiles where id = p_user for no key update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  preview := public.account_deletion_preview(p_user);
  if jsonb_array_length(preview -> 'blockingGroups') > 0 then
    raise exception 'owns_groups' using errcode = 'P0001', detail = preview::text;
  end if;
  solo := array(select (g ->> 'id')::uuid from jsonb_array_elements(preview -> 'soloGroups') g);

  insert into public.account_deletions (user_id) values (p_user)
  on conflict (user_id) where completed_at is null do update set requested_at = now();
  select id into deletion from public.account_deletions where user_id = p_user and completed_at is null;

  return jsonb_build_object(
    'deletionId', deletion,
    'preview', preview,
    'storagePaths', coalesce((
      select jsonb_agg(p.storage_path order by p.storage_path)
      from public.task_proofs p
      join public.task_occurrences o on o.id = p.occurrence_id
      join public.tasks t on t.id = o.task_id
      join public.contexts c on c.id = t.context_id
      where p.storage_path is not null
        and (p.user_id = p_user or o.assignee_id = p_user or t.assignee_id = p_user
          or c.owner_user_id = p_user or t.group_id = any (solo))
    ), '[]'::jsonb)
  );
end;
$$;

