-- ADR-0012, section 3. The database side of account-delete, all for the service role only. The Edge
-- Function runs, in order: begin_account_deletion, the Storage removal of the paths it returns,
-- finish_account_deletion, auth.admin.deleteUser (the cascade from auth.users takes the rest) and
-- complete_account_deletion. Every step skips what is already gone, so repeating after a failure is safe.
-- Errors carry the code in the message: account_not_found, owns_groups (with the preview as JSON in the
-- detail), deletion_not_started, account_still_exists, invalid_argument.

-- Owned groups: with other members they block, alone they go with the account (accountDeletePreviewSchema).
-- The owner is always a member (add_group_owner), so alone is one member.
create function public.account_deletion_preview(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with owned as (
    select g.id, g.name, (select count(*) from public.group_members m where m.group_id = g.id)::int as members
    from public.groups g
    where g.owner_id = p_user
  )
  select jsonb_build_object(
    'blockingGroups', coalesce(
      (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'memberCount', members) order by name, id)
       from owned where members > 1),
      '[]'::jsonb),
    'soloGroups', coalesce(
      (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name, id)
       from owned where members <= 1),
      '[]'::jsonb)
  );
$$;

-- Checks the blocks again, opens (or reuses) the audit row and returns the Storage paths of every proof
-- whose row goes away: the user's own, and those of occurrences that the cascade or a solo group takes.
create function public.begin_account_deletion(p_user uuid)
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
  on conflict (user_id) where completed_at is null do nothing;
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

-- In one transaction: deletes the user's proofs (a superseded one on someone else's occurrence would
-- survive the cascade with user_id null, ADR-0007 SEG-7) and the solo groups, and adds the counts.
-- p_objects_deleted is what the Storage removal answered. Counts add up, so a repeat does not erase them.
create function public.finish_account_deletion(p_user uuid, p_objects_deleted int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview jsonb;
  deletion uuid;
  proofs_n int;
  groups_n int;
begin
  if p_objects_deleted is null or p_objects_deleted < 0 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_user for no key update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  select id into deletion from public.account_deletions
  where user_id = p_user and completed_at is null
  for update;
  if not found then
    raise exception 'deletion_not_started' using errcode = 'P0001';
  end if;

  -- An accept_invite in flight holds a key share on the group: this waits for it, and the count below
  -- sees the new member. One that comes later fails, because the group is gone.
  perform 1 from public.groups where owner_id = p_user for update;
  preview := public.account_deletion_preview(p_user);
  if jsonb_array_length(preview -> 'blockingGroups') > 0 then
    raise exception 'owns_groups' using errcode = 'P0001', detail = preview::text;
  end if;

  delete from public.task_proofs where user_id = p_user;
  get diagnostics proofs_n = row_count;

  delete from public.groups where owner_id = p_user;
  get diagnostics groups_n = row_count;

  update public.account_deletions
  set groups_deleted = groups_deleted + groups_n,
    proofs_deleted = proofs_deleted + proofs_n,
    objects_deleted = objects_deleted + p_objects_deleted
  where id = deletion;

  return jsonb_build_object('groupsDeleted', groups_n, 'proofsDeleted', proofs_n);
end;
$$;

-- After auth.admin.deleteUser: marks the row done, prunes rows older than p_retention_days
-- (privacyDefaults.deletionLogRetentionDays) and deletes the user's lines of the GoTrue audit log, which
-- keep the e-mail (actor_username, traits.user_email) and the IP. auditEntriesDeleted is null where the
-- owner of this function cannot delete from auth (the policy then says so).
-- ponytail: the audit log has no index on the payload, so this scans it; fine at one deletion at a time.
create function public.complete_account_deletion(p_user uuid, p_retention_days int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_n int;
begin
  if p_retention_days is null or p_retention_days < 1 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  if exists (select 1 from auth.users where id = p_user) then
    raise exception 'account_still_exists' using errcode = 'P0001';
  end if;

  update public.account_deletions set completed_at = now()
  where user_id = p_user and completed_at is null;

  delete from public.account_deletions
  where requested_at < now() - make_interval(days => p_retention_days);

  begin
    delete from auth.audit_log_entries
    where payload ->> 'actor_id' = p_user::text or payload -> 'traits' ->> 'user_id' = p_user::text;
    get diagnostics audit_n = row_count;
  exception when insufficient_privilege then
    audit_n := null;
  end;

  return jsonb_build_object('auditEntriesDeleted', audit_n);
end;
$$;

revoke execute on function public.account_deletion_preview(uuid) from public, anon, authenticated;
revoke execute on function public.begin_account_deletion(uuid) from public, anon, authenticated;
revoke execute on function public.finish_account_deletion(uuid, int) from public, anon, authenticated;
revoke execute on function public.complete_account_deletion(uuid, int) from public, anon, authenticated;
grant execute on function public.account_deletion_preview(uuid) to service_role;
grant execute on function public.begin_account_deletion(uuid) to service_role;
grant execute on function public.finish_account_deletion(uuid, int) to service_role;
grant execute on function public.complete_account_deletion(uuid, int) to service_role;
