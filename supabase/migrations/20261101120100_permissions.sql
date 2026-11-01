create type public.group_role as enum ('owner', 'admin', 'member');

create table public.permissions (
  key text primary key
);

create table public.role_permissions (
  role public.group_role not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role, permission_key)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy permissions_select on public.permissions
  for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

revoke all on public.permissions, public.role_permissions from anon, authenticated;
grant select on public.permissions, public.role_permissions to authenticated;

-- Lives in a migration, not a seed: production access rules depend on it.
-- Mirrored in packages/core/src/permissions/matrix.ts; `pnpm db:check-permissions` compares both.
insert into public.permissions (key) values
  ('group.update'),
  ('group.delete'),
  ('group.transfer'),
  ('member.invite'),
  ('member.remove'),
  ('member.change_role'),
  ('context.manage');

insert into public.role_permissions (role, permission_key) values
  ('owner', 'group.update'),
  ('owner', 'group.delete'),
  ('owner', 'group.transfer'),
  ('owner', 'member.invite'),
  ('owner', 'member.remove'),
  ('owner', 'member.change_role'),
  ('owner', 'context.manage'),
  ('admin', 'group.update'),
  ('admin', 'member.invite'),
  ('admin', 'member.remove'),
  ('admin', 'context.manage');
