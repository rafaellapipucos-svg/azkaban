-- ADR-0011, sections 1, 4, 6 and 8. A list belongs to a group or, with no group, to one person. Created
-- only by create_shopping_list; completed only by complete_shopping_list, once, with no reopen.
create type public.shopping_list_status as enum ('open', 'completed');

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  status public.shopping_list_status not null default 'open',
  -- Navigation only: completing the list never touches the task.
  linked_task_id uuid references public.tasks (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  constraint shopping_lists_scope_check check ((group_id is null) <> (owner_user_id is null)),
  constraint shopping_lists_completed_check check ((status = 'completed') = (completed_at is not null))
);

create index shopping_lists_group_idx on public.shopping_lists (group_id) where group_id is not null;
create index shopping_lists_owner_idx on public.shopping_lists (owner_user_id) where owner_user_id is not null;
create index shopping_lists_linked_task_idx on public.shopping_lists (linked_task_id)
  where linked_task_id is not null;

-- Who sees a list sees its items: the owner of a personal list, or a member of the list's group.
-- Realtime checks the select policies of both tables through this function, as each subscriber.
create function public.can_view_shopping_list(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shopping_lists l
    where l.id = p_list_id
      and case when l.group_id is null then l.owner_user_id = (select auth.uid())
          else public.is_group_member(l.group_id) end
  );
$$;

-- Rename, link a task, delete: the owner of a personal list; in a group, its creator while a member,
-- or shopping.manage_lists.
create function public.can_manage_shopping_list(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shopping_lists l
    where l.id = p_list_id
      and case when l.group_id is null then l.owner_user_id = (select auth.uid())
          else public.is_group_member(l.group_id)
            and (
              l.created_by = (select auth.uid())
              or public.has_permission(l.group_id, 'shopping.manage_lists')
            ) end
  );
$$;

revoke execute on function public.can_view_shopping_list(uuid) from public, anon;
revoke execute on function public.can_manage_shopping_list(uuid) from public, anon;
grant execute on function public.can_view_shopping_list(uuid) to authenticated;
grant execute on function public.can_manage_shopping_list(uuid) to authenticated;

-- Any path: scope never changes; a completed list takes no update; a linked task is visible to whoever
-- links it and, on a group list, a group task of the same group, so every member who sees the list
-- sees the task. A foreign key action (set null when a task or an account goes) runs one trigger level
-- down and passes, or deleting a task or an account would fail on a completed list.
create function public.shopping_lists_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.group_id is distinct from old.group_id or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if old.status = 'completed' then
    raise exception 'list_completed' using errcode = 'P0001';
  end if;

  if new.linked_task_id is not null and new.linked_task_id is distinct from old.linked_task_id then
    select * into t from public.tasks where id = new.linked_task_id;
    if not found
      or not public.can_view_task(t)
      or (new.group_id is not null and (t.group_id is distinct from new.group_id or t.visibility <> 'group'))
    then
      raise exception 'task_link_invalid' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.shopping_lists_guard() from public, anon, authenticated;

create trigger shopping_lists_guard
  before update on public.shopping_lists
  for each row execute function public.shopping_lists_guard();

alter table public.shopping_lists enable row level security;

create policy shopping_lists_select on public.shopping_lists
  for select to authenticated
  using (public.can_view_shopping_list(id));

create policy shopping_lists_update on public.shopping_lists
  for update to authenticated
  using (public.can_manage_shopping_list(id))
  with check (public.can_manage_shopping_list(id));

create policy shopping_lists_delete on public.shopping_lists
  for delete to authenticated
  using (public.can_manage_shopping_list(id));

-- No insert: only create_shopping_list. status and completed_* only through complete_shopping_list.
revoke all on public.shopping_lists from anon, authenticated;
grant select, delete on public.shopping_lists to authenticated;
grant update (name, linked_task_id) on public.shopping_lists to authenticated;
