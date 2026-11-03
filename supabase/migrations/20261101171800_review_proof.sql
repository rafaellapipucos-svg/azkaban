-- ADR-0007, section 10. The review of a proof: approve it, or dispute it with a reason, which takes the
-- occurrence to partial or missed. The reviewer is another person with proof.review on a group task
-- (can_review_proof), and the proof has to be the current one. Errors carry the code in the message:
-- forbidden, proof_superseded, proof_already_reviewed, reason_required, invalid_transition.
-- A dispute and its undoing change the status through the trigger, which writes the history and the XP.
-- Approving changes no status, so it writes its own history line (from_status = to_status), and grants
-- the XP that was held back when the proof was waiting for an admin.
create function public.review_proof(
  p_proof_id uuid,
  p_decision text,
  p_to_status public.occurrence_status,
  p_note text
)
returns public.task_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  proof public.task_proofs;
  occ public.task_occurrences;
  note text := nullif(btrim(p_note), '');
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Not found and not allowed look the same, and only a reviewable proof gets locked.
  select * into proof from public.task_proofs where id = p_proof_id;
  if not found or not public.can_review_proof(proof.occurrence_id, proof.user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into occ from public.task_occurrences where id = proof.occurrence_id for update;
  select * into proof from public.task_proofs where id = p_proof_id for update;

  if occ.current_proof_id is distinct from proof.id or proof.superseded_at is not null then
    raise exception 'proof_superseded' using errcode = 'P0001';
  end if;

  if p_decision = 'approve' then
    if proof.review_status = 'approved' then
      raise exception 'proof_already_reviewed' using errcode = 'P0001';
    end if;

    if proof.review_status = 'disputed' then
      -- Undoing a dispute: back to green. The trigger compensates the yellow or red and grants the
      -- XP of done, with lateness read again from the time the proof was received.
      update public.task_occurrences
      set status = 'done', status_reason = note, proof_review_status = 'approved'
      where id = occ.id
      returning * into occ;
    else
      update public.task_occurrences
      set proof_review_status = 'approved'
      where id = occ.id
      returning * into occ;

      insert into public.task_status_history
        (occurrence_id, from_status, to_status, changed_by, reason, proof_review_status)
      values (occ.id, occ.status, occ.status, uid, note, 'approved');

      -- An 'unreviewed' proof already granted its XP when it was committed.
      if proof.review_status = 'in_review' then
        perform public.occurrence_award_xp(occ);
      end if;
    end if;

    update public.task_proofs
    set review_status = 'approved', reviewed_by = uid, reviewed_at = now(), review_note = note
    where id = proof.id;

  elsif p_decision = 'dispute' then
    if p_to_status not in ('partial', 'missed') then
      raise exception 'invalid_transition' using errcode = '23514';
    end if;
    if note is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    -- Going from yellow to red needs an approval first: one more pair in the table for a rare case.
    if proof.review_status = 'disputed' then
      raise exception 'proof_already_reviewed' using errcode = 'P0001';
    end if;

    update public.task_occurrences
    set status = p_to_status, status_reason = note, proof_review_status = 'disputed'
    where id = occ.id
    returning * into occ;

    update public.task_proofs
    set review_status = 'disputed', reviewed_by = uid, reviewed_at = now(), review_note = note
    where id = proof.id;

  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  return occ;
end;
$$;

revoke execute on function public.review_proof(uuid, text, public.occurrence_status, text) from public, anon;
grant execute on function public.review_proof(uuid, text, public.occurrence_status, text) to authenticated;
