-- SEG8-2. accept_invite answered invite_invalid for a wrong code with a raise, which would undo any
-- counter, so it was a way to try codes past the invite_lookup limit of get_invite_preview. It now
-- spends invite_lookup on every call, valid code or not, and answers a code it cannot use with null
-- instead of raising, so the counter stays. Over the limit it raises rate_limited (PT429).
-- Contract: null means invite_invalid; forbidden (no user) still raises.
create or replace function public.accept_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.group_invites;
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
