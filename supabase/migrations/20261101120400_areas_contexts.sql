create table public.areas (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  i18n_key text not null,
  icon text not null check (char_length(icon) <= 16),
  color_token text not null check (char_length(color_token) <= 32),
  sort_order int not null default 0
);

alter table public.areas enable row level security;

create policy areas_select on public.areas
  for select to authenticated using (true);

revoke all on public.areas from anon, authenticated;
grant select on public.areas to authenticated;

create table public.contexts (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id),
  group_id uuid references public.groups (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color_token text not null check (char_length(color_token) <= 32),
  icon text not null check (char_length(icon) <= 16),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A context belongs to a group or to one person, which is what decides who can see it.
  check ((group_id is null) <> (owner_user_id is null))
);

create index contexts_group_id_idx on public.contexts (group_id);
create index contexts_owner_user_id_idx on public.contexts (owner_user_id);

alter table public.contexts enable row level security;

create policy contexts_select on public.contexts
  for select to authenticated
  using (owner_user_id = (select auth.uid()) or public.is_group_member(group_id));

create policy contexts_insert on public.contexts
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_user_id = (select auth.uid()) or public.has_permission(group_id, 'context.manage'))
  );

create policy contexts_update on public.contexts
  for update to authenticated
  using (owner_user_id = (select auth.uid()) or public.has_permission(group_id, 'context.manage'))
  with check (owner_user_id = (select auth.uid()) or public.has_permission(group_id, 'context.manage'));

-- Contexts are archived, never deleted, and cannot move between owners.
revoke all on public.contexts from anon, authenticated;
grant select on public.contexts to authenticated;
grant insert (area_id, group_id, owner_user_id, name, color_token, icon) on public.contexts to authenticated;
grant update (area_id, name, color_token, icon, archived_at) on public.contexts to authenticated;
