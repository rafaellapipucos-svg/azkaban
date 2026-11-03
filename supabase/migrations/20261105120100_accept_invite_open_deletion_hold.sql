-- ADR-0012, section 3, SEG8-2P-3 (BL-12). The open account_deletions row of the owner refuses the invite
-- only within privacyRules.openDeletionHoldMinutes of its requested_at, which begin_account_deletion sets
-- again on every attempt. An older row is a run that died: the invite goes the normal way, and the next
-- attempt meets owns_groups in begin or finish. The rest, the lock order of SEG8-2P-1 included, is
-- 20261104160000_accept_invite_lock_order as it was.
create or replace function public.accept_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.group_invites;
  v_group uuid;
  v_owner uuid;
  inserted int;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.consume_rate_limit(auth.uid(), 'invite_lookup');

  select i.group_id, g.owner_id into v_group, v_owner
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.code = upper(trim(invite_code));
  if not found then
    return null;
  end if;

  perform 1 from public.profiles p where p.id = v_owner for share;

  -- The row lock keeps concurrent accepts from exceeding max_uses.
  select * into invite
  from public.group_invites i
  where i.code = upper(trim(invite_code))
    and i.group_id = v_group
    and i.revoked_at is null
    and i.expires_at > now()
    and (i.max_uses is null or i.use_count < i.max_uses)
  for update;
  if not found then
    return null;
  end if;

  if not exists (select 1 from public.groups g where g.id = v_group and g.owner_id = v_owner) then
    return null;
  end if;
  if exists (
    select 1 from public.account_deletions d
    where d.user_id = v_owner and d.completed_at is null
      and d.requested_at > now() - make_interval(
        mins => (public.privacy_rules() ->> 'openDeletionHoldMinutes')::int)
  ) then
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role, invited_by)
  values (invite.group_id, auth.uid(), invite.role, invite.created_by)
  on conflict (group_id, user_id) do nothing;

  -- Existing members keep their role and do not consume a use.
  get diagnostics inserted = row_count;
  if inserted > 0 then
    update public.group_invites set use_count = use_count + 1 where id = invite.id;
  end if;

  return invite.group_id;
end;
$$;
