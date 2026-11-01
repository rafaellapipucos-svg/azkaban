-- ADR-0007, sections 3 and 8: the two steps of proof-validate that touch the database. Both are for the
-- service role only; the client reaches neither. Errors carry the code in the message, as in the other
-- RPCs: challenge_invalid, challenge_expired, challenge_used, forbidden, proof_not_required,
-- occurrence_not_open, proof_disputed, late_window_expired, proof_too_large, proof_bad_dimensions,
-- proof_duplicate.

-- Permission of a given user, for the functions that run without a session. has_permission reads
-- auth.uid(), which is empty for the service role.
create function public.proof_user_can(p_user uuid, p_group uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    join public.role_permissions rp on rp.role = m.role
    where m.group_id = p_group and m.user_id = p_user and rp.permission_key = p_key
  );
$$;

-- What claim and commit both confirm, because something may change while the photo is on its way:
-- the occurrence is still the user's, still open, not contested and inside the window, and was not
-- reopened since the challenge was issued. p_at is the time of receipt, so a slow upload does not count
-- against the user.
create function public.proof_assert_open(
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

-- Marks the nonce used, in one statement: with two at once, one wins and the other reads it as used.
-- used_at is the official time of receipt. Failing after the mark in the same call undoes it, but then
-- no body was read either. Returns what the function needs to judge the photo.
create function public.claim_proof_challenge(p_nonce uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.proof_challenges;
  occ public.task_occurrences;
  ctx public.contexts;
  received timestamptz := now();
begin
  -- Another user's nonce looks like one that does not exist.
  select * into ch from public.proof_challenges where id = p_nonce and user_id = p_user_id;
  if not found then
    raise exception 'challenge_invalid' using errcode = 'P0001';
  end if;

  update public.proof_challenges
  set used_at = received
  where id = p_nonce and user_id = p_user_id and used_at is null and expires_at > received
  returning * into ch;

  if not found then
    select * into ch from public.proof_challenges where id = p_nonce;
    if ch.used_at is not null then
      raise exception 'challenge_used' using errcode = 'P0001';
    end if;
    raise exception 'challenge_expired' using errcode = 'P0001';
  end if;

  select * into occ from public.task_occurrences where id = ch.occurrence_id;
  perform public.proof_assert_open(occ, p_user_id, ch.created_at, received);

  select c.* into ctx
  from public.tasks t join public.contexts c on c.id = t.context_id
  where t.id = occ.task_id;

  return jsonb_build_object(
    'occurrenceId', occ.id,
    'challengeCreatedAt', ch.created_at,
    'receivedAt', received,
    'location', case
      when ctx.location_lat is null then null
      else jsonb_build_object('lat', ctx.location_lat, 'lng', ctx.location_lng, 'radiusM', ctx.location_radius_m)
    end
  );
end;
$$;

-- Creates the proof and takes the occurrence to done, in one transaction. It acts as the author: the
-- claims are set for this transaction only, so auth.uid(), has_permission and status_changed_by work as
-- in a call of the user, and the history shows who did it. They go back to what they were before the
-- function returns, so nothing leaks to the next statement of the same transaction. The foreign key of
-- task_proofs refuses a proof whose challenge is not of this occurrence and this author.
create function public.commit_proof(
  p_nonce uuid,
  p_user_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes int,
  p_width_px int,
  p_height_px int,
  p_captured_at_device timestamptz,
  p_distance_m int,
  p_accuracy_m int,
  p_flags text[],
  p_platform text,
  p_app_version text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims_before text := current_setting('request.jwt.claims', true);
  rules jsonb := public.proof_rules();
  ch public.proof_challenges;
  occ public.task_occurrences;
  t public.tasks;
  new_id uuid;
  review public.proof_review_status;
  flags_clean text[] := array(select distinct f from unnest(coalesce(p_flags, '{}')) f order by f);
  delta bigint;
  constraint_hit text;
begin
  -- A proof is committed after its challenge was claimed, and only by the user it was issued to.
  select * into ch from public.proof_challenges where id = p_nonce and user_id = p_user_id for update;
  if not found or ch.used_at is null then
    raise exception 'challenge_invalid' using errcode = 'P0001';
  end if;

  if p_size_bytes > (rules ->> 'maxBytes')::int then
    raise exception 'proof_too_large' using errcode = 'P0001';
  end if;
  if p_width_px not between (rules ->> 'minEdgePx')::int and (rules ->> 'maxEdgePx')::int
    or p_height_px not between (rules ->> 'minEdgePx')::int and (rules ->> 'maxEdgePx')::int then
    raise exception 'proof_bad_dimensions' using errcode = 'P0001';
  end if;

  -- Nothing in the path comes from the client, and the table repeats this check.
  if p_storage_path is distinct from ch.occurrence_id::text || '/' || ch.id::text || '.jpg' then
    raise exception 'invalid_storage_path' using errcode = '22023';
  end if;

  select * into occ from public.task_occurrences where id = ch.occurrence_id for update;
  select * into t from public.tasks where id = occ.task_id;
  perform public.proof_assert_open(occ, p_user_id, ch.created_at, ch.used_at);

  delta := greatest(
    least(round(extract(epoch from ch.used_at - p_captured_at_device)), 2147483647),
    -2147483648
  );

  -- A proof nobody has to approve is 'unreviewed', and the admin may still approve or dispute it later.
  review := case when t.requires_admin_approval then 'in_review' else 'unreviewed' end;

  begin
    insert into public.task_proofs (
      occurrence_id, challenge_id, user_id, storage_path, sha256, size_bytes, width_px, height_px,
      captured_at_device, received_at, clock_delta_seconds, distance_m, accuracy_m, flags, platform,
      app_version, user_agent, review_status
    ) values (
      occ.id, ch.id, p_user_id, p_storage_path, p_sha256, p_size_bytes, p_width_px, p_height_px,
      p_captured_at_device, ch.used_at, delta, p_distance_m, p_accuracy_m, flags_clean, p_platform,
      p_app_version, p_user_agent, review
    ) returning id into new_id;
  exception when unique_violation then
    get stacked diagnostics constraint_hit = constraint_name;
    if constraint_hit = 'task_proofs_sha256_key' then
      raise exception 'proof_duplicate' using errcode = '23505';
    end if;
    raise exception 'challenge_used' using errcode = 'P0001';
  end;

  -- From here on the author is the user of the transaction.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  -- The trigger checks that the proof is current, takes lateness from received_at, writes the history
  -- and, with no approval to wait for, the XP.
  update public.task_occurrences
  set status = 'done', status_reason = null, current_proof_id = new_id, proof_review_status = review
  where id = occ.id
  returning * into occ;

  perform set_config('request.jwt.claims', coalesce(claims_before, ''), true);

  return jsonb_build_object(
    'proofId', new_id,
    'occurrenceId', occ.id,
    'status', 'done',
    'reviewStatus', review,
    'receivedAt', ch.used_at,
    'late', occ.late,
    'flags', to_jsonb(flags_clean)
  );
end;
$$;

revoke execute on function public.proof_user_can(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.proof_assert_open(public.task_occurrences, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_proof_challenge(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.commit_proof(
  uuid, uuid, text, text, int, int, int, timestamptz, int, int, text[], text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_proof_challenge(uuid, uuid) to service_role;
grant execute on function public.commit_proof(
  uuid, uuid, text, text, int, int, int, timestamptz, int, int, text[], text, text, text
) to service_role;
