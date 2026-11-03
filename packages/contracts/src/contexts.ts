import { z } from 'zod';
import { nameSchema } from './common';

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
