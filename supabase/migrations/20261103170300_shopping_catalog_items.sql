-- ADR-0011, sections 1, 2 and 4. One catalog per group and one per person: exactly one of group_id and
-- owner_user_id. No delete for clients: archiving is archived_at.
create table public.shopping_catalog_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  category public.shopping_category not null,
  default_unit public.shopping_unit not null,
  emoji text check (char_length(emoji) between 1 and 16),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shopping_catalog_items_scope_check check ((group_id is null) <> (owner_user_id is null))
);

-- Also the indexes of the two scopes. The trigger below raises catalog_item_exists first; these hold
-- against a race.
create unique index shopping_catalog_items_group_name_idx
  on public.shopping_catalog_items (group_id, lower(name))
  where group_id is not null and archived_at is null;
create unique index shopping_catalog_items_owner_name_idx
  on public.shopping_catalog_items (owner_user_id, lower(name))
  where owner_user_id is not null and archived_at is null;
create index shopping_catalog_items_group_idx
  on public.shopping_catalog_items (group_id) where group_id is not null;
create index shopping_catalog_items_owner_idx
  on public.shopping_catalog_items (owner_user_id) where owner_user_id is not null;

-- Scope never changes; maxCatalogItemsPerScope counts rows not archived, under a lock per scope so two
-- inserts cannot both take the last place; same name in the same scope is catalog_item_exists.
create function public.shopping_catalog_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope uuid := coalesce(new.group_id, new.owner_user_id);
begin
  -- Before triggers run ahead of the insert policy: without this, probing the catalog of another group
  -- would tell catalog_item_exists from forbidden. The seed copy runs one trigger level down.
  if tg_op = 'INSERT' and pg_trigger_depth() = 1 and (select auth.uid()) is not null
    and not coalesce(
      (case when new.group_id is null then new.owner_user_id = (select auth.uid())
       else public.has_permission(new.group_id, 'shopping.manage_catalog') end),
      false)
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.group_id is distinct from old.group_id or new.owner_user_id is distinct from old.owner_user_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if new.archived_at is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('shopping_catalog:' || scope::text));

  if (tg_op = 'INSERT' or old.archived_at is not null)
    and (
      select count(*) from public.shopping_catalog_items c
      where (c.group_id = new.group_id or c.owner_user_id = new.owner_user_id)
        and c.archived_at is null and c.id <> new.id
    ) >= (public.shopping_rules() ->> 'maxCatalogItemsPerScope')::int
  then
    raise exception 'catalog_full' using errcode = '54000';
  end if;

  if exists (
    select 1 from public.shopping_catalog_items c
    where (c.group_id = new.group_id or c.owner_user_id = new.owner_user_id)
      and c.archived_at is null and c.id <> new.id and lower(c.name) = lower(new.name)
  ) then
    raise exception 'catalog_item_exists' using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke execute on function public.shopping_catalog_items_guard() from public, anon, authenticated;

create trigger shopping_catalog_items_guard
  before insert or update on public.shopping_catalog_items
  for each row execute function public.shopping_catalog_items_guard();

alter table public.shopping_catalog_items enable row level security;

-- A group catalog to its members; a personal one only to its owner, never to an admin.
create policy shopping_catalog_items_select on public.shopping_catalog_items
  for select to authenticated
  using (
    case when group_id is null then owner_user_id = (select auth.uid())
    else public.is_group_member(group_id) end
  );

create policy shopping_catalog_items_insert on public.shopping_catalog_items
  for insert to authenticated
  with check (
    case when group_id is null then owner_user_id = (select auth.uid())
    else public.has_permission(group_id, 'shopping.manage_catalog') end
  );

create policy shopping_catalog_items_update on public.shopping_catalog_items
  for update to authenticated
  using (
    case when group_id is null then owner_user_id = (select auth.uid())
    else public.has_permission(group_id, 'shopping.manage_catalog') end
  )
  with check (
    case when group_id is null then owner_user_id = (select auth.uid())
    else public.has_permission(group_id, 'shopping.manage_catalog') end
  );

revoke all on public.shopping_catalog_items from anon, authenticated;
grant select on public.shopping_catalog_items to authenticated;
grant insert (group_id, owner_user_id, name, category, default_unit, emoji, sort_order)
  on public.shopping_catalog_items to authenticated;
grant update (name, category, default_unit, emoji, sort_order, archived_at)
  on public.shopping_catalog_items to authenticated;
