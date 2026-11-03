import { z } from 'zod';
import { localDateSchema } from './common';

export const weekdaySchema = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
export type Weekday = z.infer<typeof weekdaySchema>;

export const recurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

export const recurrenceEndSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('never') }),
  z.object({ type: z.literal('on_date'), date: localDateSchema }),
  z.object({ type: z.literal('after_count'), count: z.int().min(1).max(730) }),
]);
export type RecurrenceEnd = z.infer<typeof recurrenceEndSchema>;

/** What the UI edits. The RRULE string is derived from this in core and never reaches the user. */
export const recurrenceInputSchema = z
  .object({
    frequency: recurrenceFrequencySchema,
    interval: z.int().min(1).max(99),
    weekdays: z.array(weekdaySchema).max(7),
    monthDay: z.int().min(1).max(31).nullable(),
    end: recurrenceEndSchema,
  })
  .superRefine(({ frequency, weekdays, monthDay }, ctx) => {
    if ((frequency === 'weekly') !== weekdays.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'weekly_only' });
    }
    if ((frequency === 'monthly') !== (monthDay !== null)) {
      ctx.addIssue({ code: 'custom', path: ['monthDay'], message: 'monthly_only' });
    }
  });
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;
