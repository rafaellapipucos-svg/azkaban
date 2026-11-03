-- ADR-0007, section 20. One row per rule changed, written by a trigger so it holds for any path. A task
-- born from edit_task with parent_task_id is compared with the task it came from. Whoever sees the task
-- reads the trail; nobody writes it.
create table public.task_rule_changes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  field text not null
    check (field in ('requires_photo_proof', 'requires_admin_approval', 'visibility')),
  from_value text not null,
  to_value text not null,
  -- Null for a job, or after the account is deleted.
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index task_rule_changes_task_idx on public.task_rule_changes (task_id, changed_at);

alter table public.task_rule_changes enable row level security;

revoke all on public.task_rule_changes from anon, authenticated;
grant select on public.task_rule_changes to authenticated;

create policy task_rule_changes_select on public.task_rule_changes
  for select to authenticated
  using (public.can_view_task(task_id));

create function public.tasks_log_rule_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev public.tasks;
begin
  if tg_op = 'UPDATE' then
    prev := old;
  else
    select * into prev from public.tasks where id = new.parent_task_id;
    if not found then
      return new;
    end if;
  end if;

  insert into public.task_rule_changes (task_id, field, from_value, to_value, changed_by)
  select new.id, c.field, c.before, c.after, auth.uid()
  from (values
    ('requires_photo_proof', prev.requires_photo_proof::text, new.requires_photo_proof::text),
    ('requires_admin_approval', prev.requires_admin_approval::text, new.requires_admin_approval::text),
    ('visibility', prev.visibility::text, new.visibility::text)
  ) as c (field, before, after)
  where c.before is distinct from c.after;

  return new;
end;
$$;

revoke execute on function public.tasks_log_rule_changes() from public, anon, authenticated;

create trigger tasks_log_rule_changes
  after insert or update of requires_photo_proof, requires_admin_approval, visibility on public.tasks
  for each row execute function public.tasks_log_rule_changes();
