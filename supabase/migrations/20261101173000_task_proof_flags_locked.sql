-- ADR-0007, section 20 (SEG-1). On while an admin's requirement stands on someone's own task: the owner
-- loses the exception of a task of their own. A boolean and not the author of the requirement, so it does
-- not fall with that account or role. Old rows stay false. The insert grant of tasks is by column, so the
-- client cannot set it; only edit_task writes it.
alter table public.tasks add column proof_flags_locked boolean not null default false;
