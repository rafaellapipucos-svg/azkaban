create table public.group_types (
  key text primary key,
  sort_order int not null default 0
);

alter table public.group_types enable row level security;

create policy group_types_select on public.group_types
  for select to authenticated using (true);

revoke all on public.group_types from anon, authenticated;
grant select on public.group_types to authenticated;

insert into public.group_types (key, sort_order) values
  ('family', 1),
  ('company', 2),
  ('other', 3);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  type text not null references public.group_types (key),
  owner_id uuid not null default auth.uid() references public.profiles (id),
  settings jsonb not null default '{}' check (pg_column_size(settings) <= 8192),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id);

create unique index group_members_one_owner_idx
  on public.group_members (group_id) where role = 'owner';

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Definer functions read group_members without re-entering its RLS policies.
create function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = target_group_id and user_id = (select auth.uid())
  );
$$;

create function public.has_permission(target_group_id uuid, permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    join public.role_permissions rp on rp.role = m.role
    where m.group_id = target_group_id
      and m.user_id = (select auth.uid())
      and rp.permission_key = permission
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- owner_id is checked too: RETURNING on insert runs before the membership trigger.
create policy groups_select on public.groups
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));

create policy groups_insert on public.groups
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy groups_update on public.groups
  for update to authenticated
  using (public.has_permission(id, 'group.update'))
  with check (public.has_permission(id, 'group.update'));

create policy groups_delete on public.groups
  for delete to authenticated
  using (public.has_permission(id, 'group.delete'));

revoke all on public.groups from anon, authenticated;
grant select, delete on public.groups to authenticated;
grant insert (name, type) on public.groups to authenticated;
grant update (name, settings) on public.groups to authenticated;

create policy group_members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

-- Members leave by deleting their own row; the owner has to transfer first.
-- Removing an admin is a role decision, so it also needs member.change_role.
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or (
        public.has_permission(group_id, 'member.remove')
        and (role = 'member' or public.has_permission(group_id, 'member.change_role'))
      )
    )
  );

-- Inserts and role changes only happen through the definer functions below.
revoke all on public.group_members from anon, authenticated;
grant select, delete on public.group_members to authenticated;

create function public.add_group_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

revoke execute on function public.add_group_owner() from public, anon, authenticated;

create trigger groups_add_owner
  after insert on public.groups
  for each row execute function public.add_group_owner();

-- Exposes only what co-members need; phone and preferences stay private.
create function public.group_member_profiles(target_group_id uuid)
returns table (user_id uuid, display_name text, role public.group_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.display_name, m.role, m.joined_at
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  where m.group_id = target_group_id and public.is_group_member(target_group_id)
  order by m.joined_at;
$$;

create function public.set_member_role(
  target_group_id uuid,
  target_user_id uuid,
  new_role public.group_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(target_group_id, 'member.change_role') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role = 'owner' then
    raise exception 'use transfer_group_ownership' using errcode = '22023';
  end if;

  update public.group_members
  set role = new_role
  where group_id = target_group_id and user_id = target_user_id and role <> 'owner';

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.transfer_group_ownership(target_group_id uuid, new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(target_group_id, 'group.transfer') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.group_members set role = 'admin'
  where group_id = target_group_id and role = 'owner';

  -- Raising here rolls the demotion back, so the group is never left without an owner.
  update public.group_members set role = 'owner'
  where group_id = target_group_id and user_id = new_owner_id;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  update public.groups set owner_id = new_owner_id where id = target_group_id;
end;
$$;

revoke execute on function public.group_member_profiles(uuid) from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, public.group_role) from public, anon;
revoke execute on function public.transfer_group_ownership(uuid, uuid) from public, anon;
grant execute on function public.group_member_profiles(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.group_role) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
