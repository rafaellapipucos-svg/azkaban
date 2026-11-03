-- ADR-0012, section 4 (SEG6-2). Every insert in tasks by a user counts, edit_task splits included.
create trigger tasks_rate_limit
  before insert on public.tasks
  for each row execute function public.consume_rate_limit_on_insert('task_create');
