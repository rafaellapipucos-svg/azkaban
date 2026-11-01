import { z } from 'zod';

export const occurrenceStatusSchema = z.enum(['pending', 'done', 'partial', 'missed', 'cancelled']);
export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;

export const groupRoleSchema = z.enum(['owner', 'admin', 'member']);
export type GroupRole = z.infer<typeof groupRoleSchema>;

const nameSchema = z.string().trim().min(1).max(80);

export const emailSchema = z.email();
export const passwordSchema = z.string().min(8).max(72);

export const signInSchema = z.object({ email: emailSchema, password: passwordSchema });
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = signInSchema.extend({ displayName: nameSchema });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const magicLinkSchema = z.object({ email: emailSchema });
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

const isTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const profileUpdateSchema = z.object({
  displayName: nameSchema,
  timezone: z.string().refine(isTimezone),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export type Profile = ProfileUpdateInput & { id: string; locale: string };

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

export type Area = {
  id: string;
  key: string;
  i18nKey: string;
  icon: string;
  colorToken: string;
};

export const contextInputSchema = z.object({
  areaId: z.string().min(1),
  groupId: z.string().nullable(),
  name: nameSchema,
  colorToken: z.string().min(1),
  icon: z.string().trim().min(1).max(8),
});
export type ContextInput = z.infer<typeof contextInputSchema>;

export type Context = ContextInput & { id: string };
