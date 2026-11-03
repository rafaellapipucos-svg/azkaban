import { z } from 'zod';
import { nameSchema } from './common';

export const groupRoleSchema = z.enum(['owner', 'admin', 'member']);
export type GroupRole = z.infer<typeof groupRoleSchema>;

export const groupInputSchema = z.object({ name: nameSchema, type: z.string().min(1) });
export type GroupInput = z.infer<typeof groupInputSchema>;

export type Group = GroupInput & { id: string; ownerId: string; role: GroupRole };

export type GroupMember = {
  userId: string;
  displayName: string;
  role: GroupRole;
  joinedAt: string;
};

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{10}$/);

export type GroupInvite = {
  id: string;
  code: string;
  role: GroupRole;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
};

export type InvitePreview = { groupName: string; groupType: string; role: GroupRole };
