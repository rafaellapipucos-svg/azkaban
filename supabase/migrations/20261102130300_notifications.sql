-- ADR-0008, sections 3 and 7: the bell. One row per notification, written only by the database
-- (triggers and the reminder scan), never by the client. data carries references and the facts of the
-- moment (notificationItemSchema), never a title, a note or a reason: the bell reads the title by an
-- embed that follows the task's RLS, so whoever left the group sees a generic line.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  occurrence_id uuid references public.task_occurrences (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  data jsonb not null default '{}'
    check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 1024),
  -- <type>:<key of the event>. Unique per user, so writing the same event twice is a no-op.
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- The unread counter.
create index notifications_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_occurrence_idx on public.notifications (occurrence_id)
  where occurrence_id is not null;
create index notifications_group_idx on public.notifications (group_id) where group_id is not null;
-- The retention job.
create index notifications_created_idx on public.notifications (created_at);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
-- Marking as read is the only write of the client. No insert, no delete.
grant update (read_at) on public.notifications to authenticated;

-- Realtime checks the select policy for each subscriber, so a user only gets their own rows.
alter publication supabase_realtime add table public.notifications;
