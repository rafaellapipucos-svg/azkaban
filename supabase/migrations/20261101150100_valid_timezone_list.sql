-- 'Factory' is in pg_timezone_names but Intl rejects it, so taskSchema.parse would fail on a task the
-- database had accepted. The accepted zones are now one function, and `pnpm db:check-permissions` proves
-- that Intl reads every name it accepts. A name the two engines disagree on goes into the array below.
create function public.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_timezone is not null
    and p_timezone <> all (array['Factory'])
    and exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone);
$$;

revoke execute on function public.is_valid_timezone(text) from public, anon;
grant execute on function public.is_valid_timezone(text) to authenticated;

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx public.contexts;
  old_ctx public.contexts;
  uid uuid := auth.uid();
begin
  select * into ctx from public.contexts where id = new.context_id;
  if not found then
    raise exception 'context_not_found' using errcode = '23503';
  end if;

  -- An archived context is closed: it takes no new task, and no task moves into it. Tasks already
  -- there keep working, so editing one with its own context is fine.
  if ctx.archived_at is not null and (tg_op = 'INSERT' or new.context_id is distinct from old.context_id) then
    raise exception 'context_archived' using errcode = '23514';
  end if;

  -- Only a zone from the tz database that Intl also reads. Postgres alone also takes POSIX strings
  -- such as 'abc+3', and the name 'Factory'.
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  -- group_id never changes, so a task cannot escape its group by changing context.
  if tg_op = 'UPDATE' then
    select * into old_ctx from public.contexts where id = old.context_id;
    if ctx.group_id is distinct from old_ctx.group_id
      or ctx.owner_user_id is distinct from old_ctx.owner_user_id then
      raise exception 'context_change_not_allowed' using errcode = '23514';
    end if;
  end if;

  -- A task split or detached from another stays in the same group, or with the same owner. Without
  -- this, edit_task with this or this_and_following could carry an occurrence, its history and its
  -- reasons into a group the original never belonged to.
  if tg_op = 'INSERT' and new.parent_task_id is not null then
    select * into old_ctx
    from public.contexts c
    where c.id = (select p.context_id from public.tasks p where p.id = new.parent_task_id);
    if found and (
      ctx.group_id is distinct from old_ctx.group_id
      or ctx.owner_user_id is distinct from old_ctx.owner_user_id
    ) then
      raise exception 'context_change_not_allowed' using errcode = '23514';
    end if;
  end if;

  new.group_id := ctx.group_id;

  if ctx.group_id is null then
    -- A personal context holds only its owner's private tasks.
    if new.visibility <> 'private'
      or new.assignee_id <> ctx.owner_user_id
      or new.created_by <> ctx.owner_user_id then
      raise exception 'personal_context_requires_private_self' using errcode = '23514';
    end if;
    return new;
  end if;

  -- The caller comes first, so an outsider learns nothing about who is in the group.
  if uid is not null then
    if not public.is_group_member(ctx.group_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
      and new.assignee_id <> uid
      and not public.has_permission(ctx.group_id, 'task.create_for_others') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if not exists (
      select 1 from public.group_members
      where group_id = ctx.group_id and user_id = new.assignee_id
    ) then
      raise exception 'assignee_not_member' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;
