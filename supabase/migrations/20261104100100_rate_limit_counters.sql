-- ADR-0012, section 4. One row per user, action and fixed window. Written only by consume_rate_limit
-- (security definer): RLS on and no grant, so no client reads or writes it.
create table public.rate_limit_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits int not null,
  primary key (user_id, action, window_start)
);

alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;
