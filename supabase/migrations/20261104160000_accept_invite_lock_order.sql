-- SEG8-2P-1. accept_invite locked the invite (for update) and then the owner's profile (for share);
-- finish_account_deletion locks the profile (for no key update) and then deletes the groups, which
-- deletes the invites in cascade. The opposite order gave a deadlock (40P01) on an accept to a solo
-- group during finish. Now the profile comes first: the group is read without a lock, the owner's
-- profile is locked, and only then the invite, whose conditions are checked again under the lock.
-- An accept that waited for finish finds no invite and answers null. If the ownership moved in between,
-- the locked profile is the wrong one and the answer is null too.
-- ponytail: that ownership race answers invite_invalid once; a retry with the new owner if it ever matters.
-- The rest is 20261104150200_accept_invite_account_deletion as it was (invite_lookup on every call,
-- null without raise, null with the owner's deletion open).
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
  if exists (select 1 from public.account_deletions d where d.user_id = v_owner and d.completed_at is null) then
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
