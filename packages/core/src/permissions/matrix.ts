// Client mirror of public.role_permissions, used only to hide controls. RLS is the real check.
export const rolePermissions = {
  owner: [
    'group.update',
    'group.delete',
    'group.transfer',
    'member.invite',
    'member.remove',
    'member.change_role',
    'context.manage',
  ],
  admin: ['group.update', 'member.invite', 'member.remove', 'context.manage'],
  member: [],
} as const;
