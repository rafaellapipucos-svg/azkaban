-- ADR-0007, sections 8 and 10. The occurrence points at the proof that made it green, and carries the
-- review state so the lists need no join with task_proofs and the photo does not leak. Only commit_proof,
-- review_proof and the triggers write these two; the client has no write on task_occurrences at all.
-- Null in both means there is no current proof ('in analysis' is done with proof_review_status in_review).
alter table public.task_occurrences
  add column current_proof_id uuid,
  add column proof_review_status public.proof_review_status,
  -- The pair makes the proof belong to this occurrence for any writer. The trigger of the status adds
  -- the rest: not superseded, not disputed.
  add constraint task_occurrences_current_proof_fkey foreign key (current_proof_id, id)
    references public.task_proofs (id, occurrence_id) on delete set null (current_proof_id);

create index task_occurrences_current_proof_idx
  on public.task_occurrences (current_proof_id) where current_proof_id is not null;

-- One line per decision: approving does not change the status, so it writes from_status = to_status.
alter table public.task_status_history add column proof_review_status public.proof_review_status;
