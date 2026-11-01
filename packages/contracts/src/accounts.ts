import { z } from 'zod';
import { nameSchema, timezoneSchema } from './common';

export const emailSchema = z.email();
export const passwordSchema = z.string().min(8).max(72);

export const signInSchema = z.object({ email: emailSchema, password: passwordSchema });
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = signInSchema.extend({ displayName: nameSchema });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const magicLinkSchema = z.object({ email: emailSchema });
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const profileUpdateSchema = z.object({
  displayName: nameSchema,
  timezone: timezoneSchema,
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export type Profile = ProfileUpdateInput & { id: string; locale: string };
