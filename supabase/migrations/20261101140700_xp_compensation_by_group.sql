create or replace function public.occurrences_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  rules jsonb;
  base int := 0;
  earned int;
  group_for_xp uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  insert into public.task_status_history (occurrence_id, from_status, to_status, changed_by, reason)
  values (new.id, old.status, new.status, new.status_changed_by, new.status_reason);

  select * into t from public.tasks where id = new.task_id;
  rules := public.task_rules();
  group_for_xp := case when t.visibility = 'private' then null else t.group_id end;

  -- Each balance is reverted where it was earned, per user and per group. Using the task's group at
  -- reopen time instead let someone complete a group task, make it private, reopen it, and make it a
  -- group task again, leaving a surplus in the group's ranking every turn.
  insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
  select e.user_id, e.group_id, e.occurrence_id, -sum(e.amount), 'occurrence_reverted'
  from public.xp_events e
  where e.occurrence_id = new.id
  group by e.user_id, e.group_id, e.occurrence_id
  having sum(e.amount) <> 0;

  if new.status = 'done' then
    base := (rules -> 'xp' -> 'status' ->> (case when new.late then 'done_late' else 'done' end))::int;
  elsif new.status = 'partial' then
    base := (rules -> 'xp' -> 'status' ->> 'partial')::int;
  end if;

  earned := base * (rules -> 'xp' -> 'difficultyWeight' ->> t.difficulty::text)::int;
  if earned > 0 then
    insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
    values (
      new.assignee_id, group_for_xp, new.id, earned,
      case
        when new.status = 'partial' then 'occurrence_partial'
        when new.late then 'occurrence_done_late'
        else 'occurrence_done'
      end
    );
  end if;

  return new;
end;
$$;
