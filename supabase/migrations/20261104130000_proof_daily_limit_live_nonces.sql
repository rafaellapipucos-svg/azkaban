-- ADR-0012, section 13, item 3. The daily limit counted only the bodies read (used_at), so 29 used plus
-- 30 issued together could reach 59 in a day. It now counts the used in the last 24 hours plus the issued
-- that are still alive and unused: each nonce is counted once, as alive and then as used, and the lock per
-- user keeps the sum at maxProofsPerUserPerDay. Same body as migration 173500, but that count.
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
    where c.user_id = uid
      and (c.used_at > now() - interval '1 day' or (c.used_at is null and c.expires_at > now()))
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
