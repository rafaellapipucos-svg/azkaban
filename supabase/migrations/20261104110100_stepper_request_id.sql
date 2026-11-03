-- ADR-0012, section 5. The stepper takes p_request_id uuid default null. With it, the id goes into
-- processed_requests in the same transaction, after the checks; an id already there answers the
-- current row without adding. Without it, nothing changes. A new parameter is a new signature, so
-- the two-argument and three-argument versions are replaced, and their grants redone.
-- The rest is 20261103200300_shopping_delta_finite as it was.
drop function public.add_catalog_item_to_list(uuid, uuid, numeric);
drop function public.adjust_shopping_item_quantity(uuid, numeric);

create function public.adjust_shopping_item_quantity(
  p_item_id uuid,
  p_delta numeric,
  p_request_id uuid default null
)
returns public.shopping_list_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list uuid;
  r public.shopping_list_items;
begin
  if p_delta is null or p_delta = 0 or p_delta = 'NaN' or abs(p_delta) = 'Infinity' then
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

  if p_request_id is not null then
    insert into public.processed_requests (request_id, user_id)
    values (p_request_id, auth.uid())
    on conflict (request_id) do nothing;
    if not found then
      select * into r from public.shopping_list_items where id = p_item_id;
      return r;
    end if;
  end if;

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

create function public.add_catalog_item_to_list(
  p_list_id uuid,
  p_catalog_item_id uuid,
  p_delta numeric,
  p_request_id uuid default null
)
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
  if p_delta is null or p_delta = 0 or p_delta = 'NaN' or abs(p_delta) = 'Infinity' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if not public.can_view_shopping_list(p_list_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.shopping_lists where id = p_list_id for update;

  if p_request_id is not null then
    insert into public.processed_requests (request_id, user_id)
    values (p_request_id, auth.uid())
    on conflict (request_id) do nothing;
    if not found then
      select * into r from public.shopping_list_items
      where list_id = p_list_id and catalog_item_id = p_catalog_item_id;
      return r;
    end if;
  end if;

  -- The id is already recorded above, so the adjustment goes without it.
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

revoke execute on function public.adjust_shopping_item_quantity(uuid, numeric, uuid) from public, anon;
revoke execute on function public.add_catalog_item_to_list(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.adjust_shopping_item_quantity(uuid, numeric, uuid) to authenticated;
grant execute on function public.add_catalog_item_to_list(uuid, uuid, numeric, uuid) to authenticated;
