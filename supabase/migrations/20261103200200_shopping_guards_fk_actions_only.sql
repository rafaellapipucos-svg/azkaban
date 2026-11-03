-- ADR-0011, section 16, SEG7-4. Below another trigger, the guards used to pass anything. Now they pass only
-- what a foreign key action does, so a later trigger (F7-5) does not inherit the bypass: on a list,
-- linked_task_id, created_by or completed_by set to null and nothing else; on an item, added_by,
-- checked_by or catalog_item_id set to null and nothing else. Everything else, at any depth, goes through
-- the checks. The cascade delete of an item needs no bypass: its list is already gone, so there is no
-- list_completed to raise.

create or replace function public.shopping_lists_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  fk_cols constant text[] := array['linked_task_id', 'created_by', 'completed_by'];
begin
  if pg_trigger_depth() > 1
    and (to_jsonb(new) - fk_cols) = (to_jsonb(old) - fk_cols)
    and (new.linked_task_id is null or new.linked_task_id = old.linked_task_id)
    and (new.created_by is null or new.created_by = old.created_by)
    and (new.completed_by is null or new.completed_by = old.completed_by)
  then
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

create or replace function public.shopping_list_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.shopping_lists;
  item public.shopping_list_items := case when tg_op = 'DELETE' then old else new end;
  fk_cols constant text[] := array['added_by', 'checked_by', 'catalog_item_id'];
begin
  if pg_trigger_depth() > 1 and tg_op = 'UPDATE'
    and (to_jsonb(new) - fk_cols) = (to_jsonb(old) - fk_cols)
    and (new.added_by is null or new.added_by = old.added_by)
    and (new.checked_by is null or new.checked_by = old.checked_by)
    and (new.catalog_item_id is null or new.catalog_item_id = old.catalog_item_id)
  then
    return new;
  end if;

  -- Before triggers run ahead of the insert policy: without this, an insert into a list of another group
  -- would lock it and tell list_completed or list_full apart. Update and delete only reach visible rows.
  if tg_op = 'INSERT' and (select auth.uid()) is not null
    and not public.can_view_shopping_list(new.list_id)
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Not found (the list deleted, cascading here) leaves l.status null.
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
