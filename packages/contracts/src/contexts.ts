import { z } from 'zod';
import { nameSchema } from './common';

export type Area = {
  id: string;
  key: string;
  i18nKey: string;
  icon: string;
  colorToken: string;
};

/** All or nothing: a context with this checks the distance of its photo proofs (ADR-0007). */
export const contextLocationSchema = z.object({
  /** Free text for people. There is no geocoding: the point comes from the device. */
  address: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.int().min(20).max(5000),
});
export type ContextLocation = z.infer<typeof contextLocationSchema>;

export const contextInputSchema = z.object({
  areaId: z.string().min(1),
  groupId: z.string().nullable(),
  name: nameSchema,
  colorToken: z.string().min(1),
  icon: z.string().trim().min(1).max(8),
  /** Optional until the context form and repository handle it (handoff to tarefas-calendario). */
  location: contextLocationSchema.nullable().optional(),
});
export type ContextInput = z.infer<typeof contextInputSchema>;

export type Context = ContextInput & { id: string };
