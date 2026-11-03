import { describe, expect, it } from 'vitest';
import { canRemoveMember, memberActions } from './members';

const group = { id: 'g' };
const as = (role: 'owner' | 'admin' | 'member') => ({ memberships: [{ groupId: 'g', role }] });
const other = (role: 'owner' | 'admin' | 'member') => ({ role, self: false });

describe('canRemoveMember', () => {
  it('never removes the owner, not even the owner leaving', () => {
    expect(canRemoveMember(as('owner'), group, { role: 'owner', self: true })).toBe(false);
    expect(canRemoveMember(as('admin'), group, other('owner'))).toBe(false);
  });

  it('lets anyone who is not the owner leave', () => {
    expect(canRemoveMember(as('member'), group, { role: 'member', self: true })).toBe(true);
    expect(canRemoveMember(as('admin'), group, { role: 'admin', self: true })).toBe(true);
  });

  it('lets an admin remove a member but not another admin', () => {
    expect(canRemoveMember(as('admin'), group, other('member'))).toBe(true);
    expect(canRemoveMember(as('admin'), group, other('admin'))).toBe(false);
  });

  it('lets the owner remove an admin', () => {
    expect(canRemoveMember(as('owner'), group, other('admin'))).toBe(true);
  });

  it('keeps a plain member from removing anyone', () => {
    expect(canRemoveMember(as('member'), group, other('member'))).toBe(false);
  });

  it('denies a group the viewer is not in', () => {
    expect(canRemoveMember({ memberships: [] }, group, other('member'))).toBe(false);
  });
});

describe('memberActions', () => {
  const none = { setRoleTo: null, transfer: false, remove: false };

  it('gives no buttons on the own card or the owner card', () => {
    expect(memberActions(as('owner'), group, { role: 'admin', self: true })).toEqual(none);
    expect(memberActions(as('owner'), group, other('owner'))).toEqual(none);
  });

  it('gives the owner every button, toggling the role', () => {
    expect(memberActions(as('owner'), group, other('member'))).toEqual({
      setRoleTo: 'admin',
      transfer: true,
      remove: true,
    });
    expect(memberActions(as('owner'), group, other('admin'))).toEqual({
      setRoleTo: 'member',
      transfer: true,
      remove: true,
    });
  });

  it('gives an admin only the removal of a member', () => {
    expect(memberActions(as('admin'), group, other('member'))).toEqual({
      setRoleTo: null,
      transfer: false,
      remove: true,
    });
    expect(memberActions(as('admin'), group, other('admin'))).toEqual(none);
  });

  it('gives a plain member nothing', () => {
    expect(memberActions(as('member'), group, other('member'))).toEqual(none);
  });
});
