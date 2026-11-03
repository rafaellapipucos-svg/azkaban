-- Mirrored in packages/core/src/permissions/matrix.ts; `pnpm db:check-permissions` compares both.
-- ADR-0005, section 3: member gets none of these, so colleagues' tasks stay private by default.
insert into public.permissions (key) values
  ('task.create_for_others'),
  ('task.view_group'),
  ('task.manage_group'),
  ('task.edit_assigned'),
  ('task.delete_assigned');

insert into public.role_permissions (role, permission_key) values
  ('owner', 'task.create_for_others'),
  ('owner', 'task.view_group'),
  ('owner', 'task.manage_group'),
  ('owner', 'task.edit_assigned'),
  ('owner', 'task.delete_assigned'),
  ('admin', 'task.create_for_others'),
  ('admin', 'task.view_group'),
  ('admin', 'task.manage_group'),
  ('admin', 'task.edit_assigned'),
  ('admin', 'task.delete_assigned');
