-- ADR-0011, section 16, SEG7-6. NaN > 0 is true and least(NaN, 9999) is 9999, so a NaN delta set the
-- quantity to 9999. NaN and infinite deltas are invalid_argument, like zero.
create or replace function public.adjust_shopping_item_quantity(p_item_id uuid, p_delta numeric)
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

create or replace function public.add_catalog_item_to_list(p_list_id uuid, p_catalog_item_id uuid, p_delta numeric)
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
