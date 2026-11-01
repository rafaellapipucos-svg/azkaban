create type public.occurrence_status as enum ('pending', 'done', 'partial', 'missed', 'cancelled');
create type public.occurrence_actor as enum ('assignee', 'editor', 'deleter', 'system');

-- Rules the triggers read. Not writable by clients: changing one is a migration.
create table public.app_settings (
  key text primary key,
  value jsonb not null
);

alter table public.app_settings enable row level security;

create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

-- Mirrored in packages/config/src/tasks.ts (taskRules); `pnpm db:check-permissions` compares both.
insert into public.app_settings (key, value) values
  ('task_rules', '{
    "lateCompletionWindowHours": 72,
    "autoMiss": {
      "timed": {"anchor": "end_of_day", "toleranceMinutes": 0},
      "all_day": {"anchor": "end_of_day", "toleranceMinutes": 0},
      "deadline": {"anchor": "due", "toleranceMinutes": 0}
    },
    "xp": {
      "status": {"done": 10, "done_late": 5, "partial": 3, "missed": 0},
      "difficultyWeight": {"easy": 1, "medium": 2, "hard": 3}
    }
  }');

create table public.occurrence_transitions (
  from_status public.occurrence_status not null,
  to_status public.occurrence_status not null,
  actor public.occurrence_actor not null,
  primary key (from_status, to_status, actor)
);

alter table public.occurrence_transitions enable row level security;

create policy occurrence_transitions_select on public.occurrence_transitions
  for select to authenticated using (true);

revoke all on public.occurrence_transitions from anon, authenticated;
grant select on public.occurrence_transitions to authenticated;

-- Mirrored in packages/contracts/src/occurrence-transitions.ts.
insert into public.occurrence_transitions (from_status, to_status, actor) values
  ('pending', 'done', 'assignee'),
  ('pending', 'done', 'editor'),
  ('pending', 'partial', 'assignee'),
  ('pending', 'partial', 'editor'),
  ('pending', 'missed', 'assignee'),
  ('pending', 'missed', 'editor'),
  ('pending', 'missed', 'system'),
  ('pending', 'cancelled', 'deleter'),
  ('missed', 'done', 'assignee'),
  ('missed', 'done', 'editor'),
  ('missed', 'partial', 'assignee'),
  ('missed', 'partial', 'editor'),
  ('missed', 'pending', 'editor'),
  ('missed', 'cancelled', 'deleter'),
  ('done', 'pending', 'assignee'),
  ('done', 'pending', 'editor'),
  ('partial', 'pending', 'assignee'),
  ('partial', 'pending', 'editor'),
  ('cancelled', 'pending', 'deleter');

-- Used by triggers and RPCs only. A missing row would silently disable the rules, so it fails loudly.
create function public.task_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'task_rules';
  if rules is null then
    raise exception 'task_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.task_rules() from public, anon, authenticated;
