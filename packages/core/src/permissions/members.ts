import type { GroupRole } from '@azkaban/contracts';
import { can, type PermissionUser } from './can';

/** The member a control acts on. `self` is true when it is the viewer's own membership. */
export type MemberTarget = { role: GroupRole; self: boolean };

export type MemberActions = {
  /** Role the toggle button would set, or null when the viewer cannot change this member's role. */
  setRoleTo: 'admin' | 'member' | null;
  transfer: boolean;
  remove: boolean;
};

/**
 * Mirrors the group_members_delete policy: the owner can never be removed or leave; anyone can
 * leave; removing someone else needs member.remove, and removing an admin also member.change_role.
 */
export function canRemoveMember(user: PermissionUser, group: { id: string }, target: MemberTarget) {
  if (target.role === 'owner') return false;
  if (target.self) return true;
  return (
    can(user, 'member.remove', group) &&
    (target.role === 'member' || can(user, 'member.change_role', group))
  );
}

/** Buttons the viewer gets on another member's card. Nothing for the viewer's own card or the owner. */
export function memberActions(
  user: PermissionUser,
  group: { id: string },
  target: MemberTarget,
): MemberActions {
  if (target.self || target.role === 'owner') {
    return { setRoleTo: null, transfer: false, remove: false };
  }
  return {
    setRoleTo: can(user, 'member.change_role', group)
      ? target.role === 'admin'
        ? 'member'
        : 'admin'
      : null,
    transfer: can(user, 'group.transfer', group),
    remove: canRemoveMember(user, group, target),
  };
}
