-- ADR-0007, section 20 (SEG-3). Deleting a group no longer resets the limits. The challenges outlive their
-- occurrence until the 24-hour cleanup: `on delete set null` is not an option, because occurrence_id is
-- part of the composite key of task_proofs. The daily limit counts what costs, the bodies read, so a
-- failed upload counts too. delete_stale_proof_challenges stays: the limit may lose at most the 5 minutes
-- of the nonce at the edges of the 24 hours. With the key gone, proof_assert_open is what stops the nonce
-- of an occurrence that no longer exists.
alter table public.proof_challenges drop constraint proof_challenges_occurrence_id_fkey;

create index proof_challenges_user_used_idx on public.proof_challenges (user_id, used_at)
  where used_at is not null;

create or replace function public.issue_proof_challenge(p_occurrence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  occ public.task_occurrences;
  t public.tasks;
  ctx public.contexts;
  rules jsonb := public.proof_rules();
  consent int;
  ttl int := (public.proof_rules() ->> 'challengeTtlSeconds')::int;
  new_id uuid;
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Not found and not visible look the same.
  select task_id into t.id from public.task_occurrences where id = p_occurrence_id;
  if t.id is null or not public.can_view_task(t.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into occ from public.task_occurrences where id = p_occurrence_id;
  select * into t from public.tasks where id = occ.task_id;
  select * into ctx from public.contexts where id = t.context_id;

  -- Only the assignee sends a proof, even when an admin could resolve for them: the photo is of who did
  -- it. On a task of your own they are the same person.
  if t.archived_at is not null
    or occ.assignee_id <> uid
    or (t.group_id is not null and not public.is_group_member(t.group_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not t.requires_photo_proof then
    raise exception 'proof_not_required' using errcode = 'P0001';
  end if;

  if occ.status not in ('pending', 'missed') then
    raise exception 'occurrence_not_open' using errcode = 'P0001';
  end if;

  if occ.proof_review_status = 'disputed' then
    raise exception 'proof_disputed' using errcode = 'P0001';
  end if;

  if now() > occ.overdue_at
      + make_interval(hours => (public.task_rules() ->> 'lateCompletionWindowHours')::int)
    and not (t.group_id is not null and public.has_permission(t.group_id, 'task.manage_group')) then
    raise exception 'late_window_expired' using errcode = 'P0001';
  end if;

  select p.proof_consent_version into consent from public.profiles p where p.id = uid;
  if consent is null or consent < (rules ->> 'consentVersion')::int then
    raise exception 'proof_consent_required' using errcode = 'P0001';
  end if;

  -- The limits count rows, so two calls at once could both read 29 and both pass. The lock per user
  -- makes the count and the insert one step. It is released with the transaction.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  if (
    select count(*) from public.proof_challenges c
    where c.user_id = uid and c.created_at > now() - interval '1 hour'
  ) >= (rules ->> 'challengeMaxPerUserPerHour')::int
  or (
    select count(*) from public.proof_challenges c
    where c.occurrence_id = occ.id and c.created_at > now() - interval '1 hour'
  ) >= (rules ->> 'challengeMaxPerOccurrencePerHour')::int
  or (
    select count(*) from public.proof_challenges c
    where c.user_id = uid and c.used_at > now() - interval '1 day'
  ) >= (rules ->> 'maxProofsPerUserPerDay')::int then
    raise exception 'challenge_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.proof_challenges (occurrence_id, user_id, expires_at)
  values (occ.id, uid, now() + make_interval(secs => ttl))
  returning id into new_id;

  return jsonb_build_object(
    'nonce', new_id,
    'expiresInSeconds', ttl,
    'checkLocation', ctx.location_lat is not null
  );
end;
$$;

create or replace function public.proof_assert_open(
  p_occ public.task_occurrences,
  p_user uuid,
  p_issued_at timestamptz,
  p_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.tasks;
begin
  -- A missing occurrence would pass null through every test below.
  if p_occ.id is null then
    raise exception 'challenge_invalid' using errcode = 'P0001';
  end if;

  select * into t from public.tasks where id = p_occ.task_id;

  if t.archived_at is not null
    or p_occ.assignee_id <> p_user
    or (
      t.group_id is not null
      and not exists (
        select 1 from public.group_members m where m.group_id = t.group_id and m.user_id = p_user
      )
    ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not t.requires_photo_proof then
    raise exception 'proof_not_required' using errcode = 'P0001';
  end if;

  if p_occ.status not in ('pending', 'missed') then
    raise exception 'occurrence_not_open' using errcode = 'P0001';
  end if;

  if p_occ.proof_review_status = 'disputed' then
    raise exception 'proof_disputed' using errcode = 'P0001';
  end if;

  if p_at > p_occ.overdue_at
      + make_interval(hours => (public.task_rules() ->> 'lateCompletionWindowHours')::int)
    and not (t.group_id is not null and public.proof_user_can(p_user, t.group_id, 'task.manage_group')) then
    raise exception 'late_window_expired' using errcode = 'P0001';
  end if;

  -- A reopen discards what came before it, and so the photo taken for an earlier challenge.
  if exists (
    select 1 from public.task_status_history h
    where h.occurrence_id = p_occ.id and h.to_status = 'pending' and h.changed_at > p_issued_at
  ) then
    raise exception 'challenge_invalid' using errcode = 'P0001';
  end if;
end;
$$;
