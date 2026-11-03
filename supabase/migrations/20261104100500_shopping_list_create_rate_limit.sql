-- ADR-0012, section 4 (SEG7-2). create_shopping_list counts shopping_list_create per caller, completed
-- lists included. A refused creation (forbidden, lists_full) undoes its own + 1. The rest is
-- 20261103200000_shopping_open_lists_cap as it was.
create or replace function public.create_shopping_list(
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
  perform public.consume_rate_limit(uid, 'shopping_list_create');

  if p_from_list_id is not null then
    if not public.can_view_shopping_list(p_from_list_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select * into src from public.shopping_lists where id = p_from_list_id for share;
    if not found or src.group_id is distinct from p_group_id then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('shopping_lists:' || coalesce(p_group_id, uid)::text));
  if (
    select count(*) from public.shopping_lists l
    where l.status = 'open'
      and case when p_group_id is null then l.owner_user_id = uid else l.group_id = p_group_id end
  ) >= (public.shopping_rules() ->> 'maxOpenListsPerScope')::int
  then
    raise exception 'lists_full' using errcode = '54000';
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
