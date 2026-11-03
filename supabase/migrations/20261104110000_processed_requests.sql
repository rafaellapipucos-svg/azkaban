-- ADR-0012, section 5. Request ids already applied, so a replayed request applies once. The primary
-- key serializes two concurrent repeats. Written only by security definer functions: RLS on and no
-- grant. Generic in name; today only the shopping stepper uses it.
create table public.processed_requests (
  request_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.processed_requests enable row level security;
revoke all on public.processed_requests from anon, authenticated;
