-- Alphabet skips look-alikes (0/O, 1/I/L) so codes survive being read aloud.
create function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea := extensions.gen_random_bytes(10);
  code text := '';
begin
  for i in 0..9 loop
    code := code || substr(alphabet, 1 + get_byte(bytes, i) % length(alphabet), 1);
  end loop;
  return code;
end;
$$;

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique default public.generate_invite_code(),
  role public.group_role not null default 'member' check (role <> 'owner'),
  expires_at timestamptz not null,
  max_uses int check (max_uses > 0),
  use_count int not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index group_invites_group_id_idx on public.group_invites (group_id);

alter table public.group_invites enable row level security;

-- An admin invite grants a role, so reading its code needs the same right as granting that role.
create policy group_invites_select on public.group_invites
  for select to authenticated
  using (
    public.has_permission(group_id, 'member.invite')
    and (role = 'member' or public.has_permission(group_id, 'member.change_role'))
  );

create policy group_invites_insert on public.group_invites
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission(group_id, 'member.invite')
    and (role = 'member' or public.has_permission(group_id, 'member.change_role'))
    and expires_at <= now() + interval '30 days'
  );

-- Revoking is one-way: a revoked invite cannot be brought back.
create policy group_invites_revoke on public.group_invites
  for update to authenticated
  using (
    public.has_permission(group_id, 'member.invite')
    and (role = 'member' or public.has_permission(group_id, 'member.change_role'))
  )
  with check (revoked_at is not null);

-- Someone removed from a group must not walk back in through a link they still hold.
create function public.revoke_invites_on_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is distinct from auth.uid() then
    update public.group_invites
    set revoked_at = now()
    where group_id = old.group_id and revoked_at is null;
  end if;
  return old;
end;
$$;

revoke execute on function public.revoke_invites_on_removal() from public, anon, authenticated;

create trigger group_members_revoke_invites
  after delete on public.group_members
  for each row execute function public.revoke_invites_on_removal();

revoke all on public.group_invites from anon, authenticated;
grant select on public.group_invites to authenticated;
grant insert (group_id, role, expires_at, max_uses) on public.group_invites to authenticated;
grant update (revoked_at) on public.group_invites to authenticated;

-- A valid code is the credential: it lets a non-member see only what they are joining.
create function public.get_invite_preview(invite_code text)
returns table (group_name text, group_type text, role public.group_role)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name, g.type, i.role
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.code = upper(trim(invite_code))
    and i.revoked_at is null
    and i.expires_at > now()
    and (i.max_uses is null or i.use_count < i.max_uses);
$$;

create function public.accept_invite(invite_code text)
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

  -- The row lock keeps concurrent accepts from exceeding max_uses.
  select * into invite
  from public.group_invites i
  where i.code = upper(trim(invite_code))
    and i.revoked_at is null
    and i.expires_at > now()
    and (i.max_uses is null or i.use_count < i.max_uses)
  for update;

  if not found then
    raise exception 'invite_invalid' using errcode = 'P0002';
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

-- Column defaults run as the caller, so inserting an invite needs execute on the generator.
revoke execute on function public.generate_invite_code() from public, anon;
grant execute on function public.generate_invite_code() to authenticated;
revoke execute on function public.get_invite_preview(text) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.get_invite_preview(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
