-- ADR-0012, section 3. Deleting an account is leaving, and leaving does not cancel invites (ADR-0004).
-- In the cascade from auth.users the profile is already gone and auth.uid() is null, so the old check
-- read it as a removal by someone else and revoked every invite of every group of that person.
create or replace function public.revoke_invites_on_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is distinct from auth.uid()
    and exists (select 1 from public.profiles p where p.id = old.user_id) then
    update public.group_invites
    set revoked_at = now()
    where group_id = old.group_id and revoked_at is null;
  end if;
  return old;
end;
$$;

revoke execute on function public.revoke_invites_on_removal() from public, anon, authenticated;
