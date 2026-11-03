-- ADR-0011, section 3. Mirrored in packages/core/src/permissions/matrix.ts; `pnpm db:check-permissions`
-- compares both. The first keys a member holds: whoever goes to the market creates and completes lists.
insert into public.permissions (key) values
  ('shopping.create_list'),
  ('shopping.complete_list'),
  ('shopping.manage_catalog'),
  ('shopping.manage_lists');

insert into public.role_permissions (role, permission_key) values
  ('owner', 'shopping.create_list'),
  ('owner', 'shopping.complete_list'),
  ('owner', 'shopping.manage_catalog'),
  ('owner', 'shopping.manage_lists'),
  ('admin', 'shopping.create_list'),
  ('admin', 'shopping.complete_list'),
  ('admin', 'shopping.manage_catalog'),
  ('admin', 'shopping.manage_lists'),
  ('member', 'shopping.create_list'),
  ('member', 'shopping.complete_list');
