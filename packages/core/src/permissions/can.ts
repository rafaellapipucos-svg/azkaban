import type { GroupRole } from '@azkaban/contracts';
import { rolePermissions } from './matrix';

export type Permission = (typeof rolePermissions)[GroupRole][number];

export type PermissionUser = { memberships: { groupId: string; role: GroupRole }[] };

export function can(user: PermissionUser, permission: Permission, group: { id: string }) {
  const membership = user.memberships.find(({ groupId }) => groupId === group.id);
  if (!membership) return false;
  return (rolePermissions[membership.role] as readonly Permission[]).includes(permission);
}
