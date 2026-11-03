-- ADR-0007, section 10. An approval needs a photo to review and a reviewer, and a private task has none.
-- Rows from Phase 2 saved the flag without either, so they are cleared before the check exists.
update public.tasks
set requires_admin_approval = false
where requires_admin_approval and not (requires_photo_proof and visibility = 'group');

alter table public.tasks
  add constraint tasks_admin_approval_check
  check (not requires_admin_approval or (requires_photo_proof and visibility = 'group'));
