import { z } from 'zod';

export const occurrenceStatusSchema = z.enum(['pending', 'done', 'partial', 'missed', 'cancelled']);
export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;
