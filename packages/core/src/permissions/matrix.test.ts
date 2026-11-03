import type { GroupRole } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { can, type Permission } from './can';
import { rolePermissions } from './matrix';

const roles: GroupRole[] = ['owner', 'admin', 'member'];

// ADR-0005 section 3 and ADR-0007 section 10.
const taskKeys: { key: Permission; owner: boolean; admin: boolean; member: boolean }[] = [
  { key: 'task.create_for_others', owner: true, admin: true, member: false },
  { key: 'task.view_group', owner: true, admin: true, member: false },
  { key: 'task.manage_group', owner: true, admin: true, member: false },
  { key: 'task.edit_assigned', owner: true, admin: true, member: false },
  { key: 'task.delete_assigned', owner: true, admin: true, member: false },
  { key: 'proof.review', owner: true, admin: true, member: false },
];

const cases = taskKeys.flatMap(({ key, ...allowed }) =>
  roles.map((role) => ({ key, role, allowed: allowed[role] })),
);

describe('task permissions (ADR-0005 section 3)', () => {
  it.each(cases)('$key for $role: $allowed', ({ key, role, allowed }) => {
    const user = { memberships: [{ groupId: 'g', role }] };
    expect(can(user, key, { id: 'g' })).toBe(allowed);
  });

  it('has no duplicate keys in any role', () => {
    for (const keys of Object.values(rolePermissions)) {
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps ownership actions with the owner only', () => {
    expect(rolePermissions.admin).not.toContain('group.transfer');
    expect(rolePermissions.admin).not.toContain('group.delete');
  });
});
