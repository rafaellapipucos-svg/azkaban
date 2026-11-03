-- SEG8-4. The stepper had no limit, and each call with a new p_request_id writes a processed_requests
-- row kept idempotencyRetentionHours, so a script turning ids filled the table at PostgREST speed.
-- rateLimitRules.actions.shopping_item_adjust, generous: a call that adds, removes or creates an item
-- counts once, whichever function it entered by; a replayed id does not count. Over the limit it raises
-- rate_limited (PT429), which undoes the processed_requests row too. create or replace keeps the grants.
-- The rest is 20261104110100_stepper_request_id as it was.
update public.app_settings
set value = jsonb_set(value, '{actions,shopping_item_adjust}', '{"limit": 600, "windowSeconds": 3600}')
where key = 'rate_limit_rules';

create or replace function public.adjust_shopping_item_quantity(
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

  -- After the replay check: a repeated id writes nothing, so it does not count.
  perform public.consume_rate_limit(auth.uid(), 'shopping_item_adjust');

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

create or replace function public.add_catalog_item_to_list(
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
  -- Here, after the hand-off above: adjust_shopping_item_quantity counts that path itself.
  perform public.consume_rate_limit(auth.uid(), 'shopping_item_adjust');
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
