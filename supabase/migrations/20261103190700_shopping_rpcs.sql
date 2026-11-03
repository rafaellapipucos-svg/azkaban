-- ADR-0011, sections 4 and 5. Definer functions with explicit checks. Each locks the list row first, in
-- the same order as the item trigger (list, then item), so writes on one list are serialized. Item writes
-- inside still pass through the triggers (list_completed, list_full, stamps, catalog scope).

-- p_id may come from the client (F8-5). With p_from_list_id, the source must be visible and in the same
-- scope, and its items are copied unchecked, with added_by = the caller.
create function public.create_shopping_list(
  p_id uuid,
  p_group_id uuid,
  p_name text,
  p_from_list_id uuid default null
)
returns public.shopping_lists
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  src public.shopping_lists;
  result public.shopping_lists;
begin
  if uid is null
    or (p_group_id is not null and not public.has_permission(p_group_id, 'shopping.create_list'))
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_from_list_id is not null then
    select * into src from public.shopping_lists where id = p_from_list_id for share;
    if not found
      or not public.can_view_shopping_list(src.id)
      or src.group_id is distinct from p_group_id
    then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  insert into public.shopping_lists (id, group_id, owner_user_id, name, created_by)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_group_id,
    case when p_group_id is null then uid end,
    p_name,
    uid
  )
  returning * into result;

  if p_from_list_id is not null then
    insert into public.shopping_list_items (list_id, catalog_item_id, name, category, quantity, unit, emoji, note)
    select result.id, i.catalog_item_id, i.name, i.category, i.quantity, i.unit, i.emoji, i.note
    from public.shopping_list_items i
    where i.list_id = p_from_list_id
    order by i.added_at, i.id;
  end if;

  return result;
end;
$$;

-- open -> completed, once. Unchecked items stay as they are: history shows what was not bought.
create function public.complete_shopping_list(p_list_id uuid)
returns public.shopping_lists
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.shopping_lists;
begin
  select * into l from public.shopping_lists where id = p_list_id for update;
  if not found
    or not public.can_view_shopping_list(p_list_id)
    or (l.group_id is not null and not public.has_permission(l.group_id, 'shopping.complete_list'))
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if l.status = 'completed' then
    raise exception 'list_completed' using errcode = 'P0001';
  end if;

  update public.shopping_lists
  set status = 'completed', completed_at = now(), completed_by = (select auth.uid())
  where id = p_list_id
  returning * into l;

  return l;
end;
$$;

-- The stepper: quantity + delta in one statement, so two people tapping at once both count. At or below
-- zero, the item goes. Null when the item is gone (removed by someone else, or by this delta).
create function public.adjust_shopping_item_quantity(p_item_id uuid, p_delta numeric)
returns public.shopping_list_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list uuid;
  r public.shopping_list_items;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  select list_id into v_list from public.shopping_list_items where id = p_item_id;
  if not found then
    return null;
  end if;
  if not public.can_view_shopping_list(v_list) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.shopping_lists where id = v_list for update;

  -- ponytail: clamps at shoppingQuantityMax instead of failing the check; the UI shows the result anyway.
  update public.shopping_list_items
  set quantity = least(quantity + p_delta, 9999)
  where id = p_item_id and quantity + p_delta > 0
  returning * into r;

  if not found then
    delete from public.shopping_list_items where id = p_item_id;
    return null;
  end if;
  return r;
end;
$$;

-- The stepper on a catalog entry in "build" mode. The first tap inserts the catalog snapshot with the
-- delta as quantity; later taps add to that row. Under the list lock, so two first taps at once make one
-- row with the sum: the second waits, then sees the first.
create function public.add_catalog_item_to_list(p_list_id uuid, p_catalog_item_id uuid, p_delta numeric)
returns public.shopping_list_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.shopping_catalog_items;
  v_item uuid;
  r public.shopping_list_items;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if not public.can_view_shopping_list(p_list_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.shopping_lists where id = p_list_id for update;

  select id into v_item from public.shopping_list_items
  where list_id = p_list_id and catalog_item_id = p_catalog_item_id;
  if found then
    return public.adjust_shopping_item_quantity(v_item, p_delta);
  end if;
  if p_delta <= 0 then
    return null;
  end if;

  -- The item trigger refuses a catalog row of another scope.
  select * into c from public.shopping_catalog_items where id = p_catalog_item_id;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.shopping_list_items (list_id, catalog_item_id, name, category, quantity, unit, emoji)
  values (p_list_id, c.id, c.name, c.category, least(p_delta, 9999), c.default_unit, c.emoji)
  returning * into r;
  return r;
end;
$$;

-- A value, not a toggle: checking a checked item keeps who checked it first and when.
create function public.set_shopping_item_checked(p_item_id uuid, p_checked boolean)
returns public.shopping_list_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list uuid;
  r public.shopping_list_items;
begin
  if p_checked is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  select list_id into v_list from public.shopping_list_items where id = p_item_id;
  if not found then
    return null;
  end if;
  if not public.can_view_shopping_list(v_list) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.shopping_lists where id = v_list for update;

  update public.shopping_list_items
  set checked_at = case when not p_checked then null else coalesce(checked_at, now()) end,
      checked_by = case when not p_checked then null when checked_at is null then (select auth.uid())
                   else checked_by end
  where id = p_item_id
  returning * into r;
  return r;
end;
$$;

revoke execute on function public.create_shopping_list(uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.complete_shopping_list(uuid) from public, anon;
revoke execute on function public.adjust_shopping_item_quantity(uuid, numeric) from public, anon;
revoke execute on function public.add_catalog_item_to_list(uuid, uuid, numeric) from public, anon;
revoke execute on function public.set_shopping_item_checked(uuid, boolean) from public, anon;
grant execute on function public.create_shopping_list(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.complete_shopping_list(uuid) to authenticated;
grant execute on function public.adjust_shopping_item_quantity(uuid, numeric) to authenticated;
grant execute on function public.add_catalog_item_to_list(uuid, uuid, numeric) to authenticated;
grant execute on function public.set_shopping_item_checked(uuid, boolean) to authenticated;
