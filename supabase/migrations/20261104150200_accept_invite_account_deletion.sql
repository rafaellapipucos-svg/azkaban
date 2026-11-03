-- SEG8-3. account-delete removes the photos of the owner's solo groups between begin_account_deletion
-- and finish_account_deletion; someone joining such a group in between made finish answer owns_groups,
-- leaving that group's proof rows without their objects. With an open row in account_deletions for the
-- group's owner, accept_invite now answers null (invite_invalid). The share lock on the owner's profile
-- conflicts with the no key update lock of begin: an accept in flight makes begin wait and count the new
-- member (owns_groups, before any photo goes), and a begin in flight makes the accept wait and see the row.
-- The rest is 20261104150100_accept_invite_lookup_limit as it was.
create or replace function public.accept_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.group_invites;
  v_owner uuid;
  inserted int;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.consume_rate_limit(auth.uid(), 'invite_lookup');

  -- The row lock keeps concurrent accepts from exceeding max_uses.
  select * into invite
  from public.group_invites i
  where i.code = upper(trim(invite_code))
    and i.revoked_at is null
    and i.expires_at > now()
    and (i.max_uses is null or i.use_count < i.max_uses)
  for update;

  if not found then
    return null;
  end if;

  select g.owner_id into v_owner from public.groups g where g.id = invite.group_id;
  perform 1 from public.profiles p where p.id = v_owner for share;
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
