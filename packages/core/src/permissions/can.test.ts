import { describe, expect, it } from 'vitest';
import { can } from './can';

const user = {
  memberships: [
    { groupId: 'a', role: 'admin' as const },
    { groupId: 'b', role: 'member' as const },
    { groupId: 'c', role: 'owner' as const },
  ],
};

describe('can', () => {
  it('follows the role of the group in question', () => {
    expect(can(user, 'context.manage', { id: 'a' })).toBe(true);
    expect(can(user, 'context.manage', { id: 'b' })).toBe(false);
  });

  it('keeps ownership actions with the owner', () => {
    expect(can(user, 'group.transfer', { id: 'a' })).toBe(false);
    expect(can(user, 'group.transfer', { id: 'c' })).toBe(true);
  });

  it('denies a group the user is not in', () => {
    expect(can(user, 'member.invite', { id: 'z' })).toBe(false);
  });
});
