-- ADR-0011, sections 1, 4 and 5. An item is a snapshot of name, category, unit and emoji; catalog_item_id
-- is only the link, unique per list, so the stepper of "build" mode finds the row. Every member who sees
-- the list touches its items, with no permission key.
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  catalog_item_id uuid references public.shopping_catalog_items (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  category public.shopping_category not null,
  quantity numeric(10, 3) not null check (quantity > 0 and quantity <= 9999),
  unit public.shopping_unit not null,
  emoji text check (char_length(emoji) between 1 and 16),
  note text check (char_length(note) between 1 and 200),
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  checked_at timestamptz,
  checked_by uuid references public.profiles (id) on delete set null,
  -- Leads with list_id, so it is also the index of the items of a list.
  constraint shopping_list_items_catalog_key unique (list_id, catalog_item_id)
);

-- The set null when a catalog goes with its group or its owner.
create index shopping_list_items_catalog_idx on public.shopping_list_items (catalog_item_id)
  where catalog_item_id is not null;

-- Any path, with the list locked, so a write and complete_shopping_list are ordered: a completed list
-- takes no write (list_completed); maxItemsPerList (list_full); the database stamps who added and when,
-- and an item starts unchecked; a catalog link comes from the list's own catalog. Foreign key actions
-- (the list or an account deleted) run one trigger level down and pass.
create function public.shopping_list_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.shopping_lists;
  item public.shopping_list_items := case when tg_op = 'DELETE' then old else new end;
begin
  if pg_trigger_depth() > 1 then
    return item;
  end if;

  -- Before triggers run ahead of the insert policy: without this, an insert into a list of another group
  -- would lock it and tell list_completed or list_full apart. Update and delete only reach visible rows.
  if tg_op = 'INSERT' and (select auth.uid()) is not null
    and not public.can_view_shopping_list(new.list_id)
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into l from public.shopping_lists where id = item.list_id for update;
  if l.status = 'completed' then
    raise exception 'list_completed' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.shopping_list_items i where i.list_id = new.list_id)
      >= (public.shopping_rules() ->> 'maxItemsPerList')::int
    then
      raise exception 'list_full' using errcode = '54000';
    end if;
    new.added_by := (select auth.uid());
    new.added_at := now();
    new.checked_at := null;
    new.checked_by := null;
  end if;

  if new.catalog_item_id is not null
    and (tg_op = 'INSERT' or new.catalog_item_id is distinct from old.catalog_item_id)
    and not exists (
      select 1 from public.shopping_catalog_items c
      where c.id = new.catalog_item_id
        and c.group_id is not distinct from l.group_id
        and c.owner_user_id is not distinct from l.owner_user_id
    )
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.shopping_list_items_guard() from public, anon, authenticated;

create trigger shopping_list_items_guard
  before insert or update or delete on public.shopping_list_items
  for each row execute function public.shopping_list_items_guard();

alter table public.shopping_list_items enable row level security;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.can_view_shopping_list(list_id));

create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (public.can_view_shopping_list(list_id));

create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (public.can_view_shopping_list(list_id))
  with check (public.can_view_shopping_list(list_id));

create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (public.can_view_shopping_list(list_id));

-- added_*, checked_* and list_id are never the client's: the trigger stamps, set_shopping_item_checked
-- checks, and an item does not move between lists.
revoke all on public.shopping_list_items from anon, authenticated;
grant select, delete on public.shopping_list_items to authenticated;
grant insert (id, list_id, catalog_item_id, name, category, quantity, unit, emoji, note)
  on public.shopping_list_items to authenticated;
grant update (name, category, quantity, unit, emoji, note, catalog_item_id)
  on public.shopping_list_items to authenticated;
