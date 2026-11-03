-- ADR-0012, section 3. The audit of account deletions: a UUID with no key to anything, the times and the
-- counts. Kept privacyDefaults.deletionLogRetentionDays (365), pruned by the next deletion. Only the
-- deletion functions touch it; no client grant.
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  groups_deleted int not null default 0 check (groups_deleted >= 0),
  proofs_deleted int not null default 0 check (proofs_deleted >= 0),
  objects_deleted int not null default 0 check (objects_deleted >= 0),
  check (completed_at >= requested_at)
);

-- One open deletion per account: a repeat reuses it.
create unique index account_deletions_open_idx on public.account_deletions (user_id)
  where completed_at is null;
create index account_deletions_requested_at_idx on public.account_deletions (requested_at);

alter table public.account_deletions enable row level security;

revoke all on public.account_deletions from anon, authenticated;
