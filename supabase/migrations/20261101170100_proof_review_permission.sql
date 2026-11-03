-- Mirrored in packages/core/src/permissions/matrix.ts; `pnpm db:check-permissions` compares both.
-- ADR-0007, section 10: one key, for who sees and reviews the proofs of the group's tasks.
insert into public.permissions (key) values ('proof.review');

insert into public.role_permissions (role, permission_key) values
  ('owner', 'proof.review'),
  ('admin', 'proof.review');
