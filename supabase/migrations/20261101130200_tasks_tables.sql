create type public.schedule_type as enum ('timed', 'all_day', 'deadline');
create type public.task_visibility as enum ('group', 'private');
create type public.task_difficulty as enum ('easy', 'medium', 'hard');
create type public.task_priority as enum ('low', 'normal', 'high');

-- Limits repeat packages/contracts/src/tasks.ts. group_id is copied from the context by trigger
-- and never changes, so RLS does not have to pass through contexts. See ADR-0005.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.contexts (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (char_length(notes) <= 2000),
  schedule_type public.schedule_type not null,
  start_at timestamptz,
  due_at timestamptz,
  duration_min int check (duration_min between 1 and 1440),
  timezone text not null check (char_length(timezone) between 1 and 64),
  -- Only the rule: the anchor is coalesce(start_at, due_at) and the zone is `timezone`.
  rrule text check (char_length(rrule) <= 500),
  -- Local days (in timezone) that are excluded from the series, not instants. See ADR-0005, section 8.
  exdates date[] not null default '{}',
  reminders jsonb not null
    check (
      jsonb_typeof(reminders) = 'array'
      and jsonb_array_length(reminders) <= 5
      and not jsonb_path_exists(
        reminders,
        'strict $[*] ? (@.type() != "number" || @ < 0 || @ > 43200 || @ != @.floor())',
        '{}',
        true
      )
    ),
  requires_photo_proof boolean not null,
  requires_admin_approval boolean not null,
  requires_partial_reason boolean not null,
  difficulty public.task_difficulty not null,
  priority public.task_priority not null,
  visibility public.task_visibility not null,
  parent_task_id uuid references public.tasks (id) on delete set null,
  materialized_until timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  -- Same rules as checkSchedule in the contract.
  constraint tasks_schedule_check check (
    (schedule_type = 'deadline' and due_at is not null and (start_at is null or start_at < due_at))
    or (schedule_type <> 'deadline' and start_at is not null and due_at is null)
  ),
  constraint tasks_duration_check check (schedule_type = 'timed' or duration_min is null),
  -- A private task belongs to its creator.
  constraint tasks_private_assignee_check check (visibility = 'group' or assignee_id = created_by)
);

create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_group_id_idx on public.tasks (group_id);
create index tasks_context_id_idx on public.tasks (context_id);
create index tasks_parent_task_id_idx on public.tasks (parent_task_id);
create index tasks_recurring_idx on public.tasks (materialized_until) where rrule is not null and archived_at is null;

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_start timestamptz not null,
  scheduled_due timestamptz not null,
  -- Filled by trigger from task_rules.autoMiss. Defines when the occurrence stops being on time.
  overdue_at timestamptz not null,
  status public.occurrence_status not null default 'pending',
  late boolean not null default false,
  status_reason text check (char_length(status_reason) <= 500),
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id) on delete set null,
  unique (task_id, scheduled_start),
  check (scheduled_due >= scheduled_start)
);

create index task_occurrences_assignee_start_idx
  on public.task_occurrences (assignee_id, scheduled_start);
create index task_occurrences_overdue_idx
  on public.task_occurrences (overdue_at) where status = 'pending';

create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.task_occurrences (id) on delete cascade,
  from_status public.occurrence_status not null,
  to_status public.occurrence_status not null,
  -- Null when a job made the change, or after the account was deleted.
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text
);

create index task_status_history_occurrence_idx on public.task_status_history (occurrence_id);

-- Append-only ledger: reverting writes a compensating event, nothing is edited.
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Null for private tasks, so a ranking never leaks them to the group.
  group_id uuid references public.groups (id) on delete set null,
  occurrence_id uuid references public.task_occurrences (id) on delete set null,
  amount int not null check (amount <> 0),
  reason text not null
    check (reason in ('occurrence_done', 'occurrence_done_late', 'occurrence_partial', 'occurrence_reverted')),
  created_at timestamptz not null default now()
);

create index xp_events_user_id_idx on public.xp_events (user_id);
create index xp_events_occurrence_id_idx on public.xp_events (occurrence_id);

alter table public.tasks enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.task_status_history enable row level security;
alter table public.xp_events enable row level security;

revoke all on public.tasks, public.task_occurrences, public.task_status_history, public.xp_events
  from anon, authenticated;
