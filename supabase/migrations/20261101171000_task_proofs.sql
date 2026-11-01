-- ADR-0007, sections 8, 10 and 13. One row per photo accepted by the server, written only by
-- commit_proof. The photo itself is in the task-proofs bucket; this row is what survives retention.
-- 'unreviewed' is a proof nobody has to approve, 'in_review' waits for an admin, and 'disputed' is
-- a decision against it.
create type public.proof_review_status as enum ('unreviewed', 'in_review', 'approved', 'disputed');

create table public.task_proofs (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.task_occurrences (id) on delete cascade,
  challenge_id uuid not null unique,
  -- Null after the account is deleted: the record stays as the audit trail.
  user_id uuid references public.profiles (id) on delete set null,
  -- <occurrence_id>/<challenge_id>.jpg. Nothing in it comes from the client. Null once retention
  -- removes the photo.
  storage_path text,
  -- Computed by the function from the bytes it stored. A second photo cannot reuse the same bytes.
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes int not null check (size_bytes > 0),
  width_px int not null check (width_px > 0),
  height_px int not null check (height_px > 0),
  captured_at_device timestamptz not null,
  -- The official time: the instant the challenge was used, not when the transfer ended.
  received_at timestamptz not null,
  clock_delta_seconds int not null,
  -- The server keeps the distance and the precision, and drops the coordinates.
  distance_m int check (distance_m >= 0),
  accuracy_m int check (accuracy_m >= 0),
  -- Same names as proofFlagSchema.
  flags text[] not null default '{}'
    check (flags <@ array['out_of_radius', 'location_missing', 'clock_mismatch']::text[]),
  platform text check (platform in ('web', 'ios', 'android')),
  app_version text check (char_length(app_version) <= 40),
  user_agent text check (char_length(user_agent) <= 256),
  review_status public.proof_review_status not null default 'unreviewed',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 500),
  -- Set when the occurrence is reopened. The photo stays until retention, and counts for nothing.
  superseded_at timestamptz,
  photo_deleted_at timestamptz,
  constraint task_proofs_storage_path_check
    check (storage_path is null or storage_path = occurrence_id::text || '/' || challenge_id::text || '.jpg'),
  -- A proof can only name a challenge of its own occurrence and author. MATCH SIMPLE skips the check
  -- once user_id is null, and deleting the challenge of a deleted account clears user_id, so the
  -- account deletion does not fail on either side.
  constraint task_proofs_challenge_fkey foreign key (challenge_id, occurrence_id, user_id)
    references public.proof_challenges (id, occurrence_id, user_id) match simple
    on delete set null (user_id),
  -- The target of task_occurrences.current_proof_id.
  unique (id, occurrence_id)
);

create index task_proofs_occurrence_idx on public.task_proofs (occurrence_id);
create index task_proofs_user_received_idx on public.task_proofs (user_id, received_at);
-- The reviewers' queue and the retention job.
create index task_proofs_review_queue_idx on public.task_proofs (received_at)
  where review_status = 'in_review' and superseded_at is null;
create index task_proofs_retention_idx on public.task_proofs (received_at) where photo_deleted_at is null;

-- What identifies the proof cannot change, service role included. The account may go to null, never to
-- another value. Retention clears storage_path and the device fields, which are not in this list.
create function public.task_proofs_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.occurrence_id is distinct from old.occurrence_id
    or new.challenge_id is distinct from old.challenge_id
    or new.sha256 is distinct from old.sha256
    or new.received_at is distinct from old.received_at
    or new.captured_at_device is distinct from old.captured_at_device
    or (new.user_id is not null and new.user_id is distinct from old.user_id) then
    raise exception 'proof_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.task_proofs_before_update() from public, anon, authenticated;

create trigger task_proofs_before_update
  before update on public.task_proofs
  for each row execute function public.task_proofs_before_update();

alter table public.task_proofs enable row level security;

-- No write for the client, ever. It reads by column, without storage_path (photos only leave through
-- the short signed URL of proof-url) and without challenge_id (the nonce). The policy comes with
-- can_view_proof.
revoke all on public.task_proofs from anon, authenticated;
grant select (
  id, occurrence_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at,
  clock_delta_seconds, distance_m, accuracy_m, flags, platform, app_version, user_agent, review_status,
  reviewed_by, reviewed_at, review_note, superseded_at, photo_deleted_at
) on public.task_proofs to authenticated;
