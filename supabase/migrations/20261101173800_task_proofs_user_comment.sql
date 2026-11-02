-- ADR-0007, section 20 (SEG-7). The comment of the first migration said the opposite.
comment on column public.task_proofs.user_id is
  'Deleting the account deletes the proof through the occurrence. The null only reaches a superseded proof of an occurrence that passed to someone else.';
