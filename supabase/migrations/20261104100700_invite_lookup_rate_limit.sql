-- ADR-0012, section 4. get_invite_preview answers a group name for a code, so each lookup counts,
-- valid code or not. It becomes plpgsql and volatile to write the counter; the result is the same.
-- accept_invite has no limit of its own: it raises invite_invalid, which would undo the counter.
create or replace function public.get_invite_preview(invite_code text)
returns table (group_name text, group_type text, role public.group_role)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit(auth.uid(), 'invite_lookup');
  return query
  select g.name, g.type, i.role
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.code = upper(trim(invite_code))
    and i.revoked_at is null
    and i.expires_at > now()
    and (i.max_uses is null or i.use_count < i.max_uses);
end;
$$;
