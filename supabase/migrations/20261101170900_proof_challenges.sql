-- ADR-0007, section 2. The id is the nonce: gen_random_uuid() has 122 random bits, and one more
-- column would add nothing. The client never reads or writes this table. issue_proof_challenge
-- creates the rows, and claim_proof_challenge (service role) marks them used.
create table public.proof_challenges (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.task_occurrences (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- The official time of receipt of the photo, set by the Postgres in claim_proof_challenge.
  used_at timestamptz,
  check (expires_at > created_at),
  -- The target of the composite key of task_proofs: a proof can only name a challenge of its own
  -- occurrence and author.
  unique (id, occurrence_id, user_id)
);

-- The rate limits count these two ranges.
create index proof_challenges_user_created_idx on public.proof_challenges (user_id, created_at);
create index proof_challenges_occurrence_created_idx on public.proof_challenges (occurrence_id, created_at);

alter table public.proof_challenges enable row level security;

-- No policy and no grant: not even to read. Only the definer functions touch it.
revoke all on public.proof_challenges from anon, authenticated;
