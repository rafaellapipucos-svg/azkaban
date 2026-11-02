-- ADR-0008, sections 3 and 6. One row per notification and external channel, born in the same
-- transaction as the notification. Only the definer functions of the dispatcher touch it: RLS on and
-- no policy, and no grant to anon or authenticated.
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel public.delivery_channel not null,
  status public.notification_outbox_status not null default 'pending',
  -- When it was due. maxDelayHours past it, the row gives up as expired.
  scheduled_for timestamptz not null,
  -- Next time the claim may take it. A row in sending carries its lease end here as well, so one
  -- index serves both the queue and the leases that ran out.
  next_attempt_at timestamptz not null,
  attempts int not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  -- A short code, never a message of the provider, which may carry the endpoint.
  last_error text check (char_length(last_error) <= 64),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create index notification_outbox_queue_idx on public.notification_outbox (next_attempt_at)
  where status in ('pending', 'sending');
create index notification_outbox_user_idx on public.notification_outbox (user_id);

alter table public.notification_outbox enable row level security;

revoke all on public.notification_outbox from anon, authenticated;
