import {
  recurrenceInputSchema,
  scheduleTypeSchema,
  taskDifficultySchema,
  taskPrioritySchema,
  taskVisibilitySchema,
} from '@azkaban/contracts';
import { z } from 'zod';

const dayText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeText = /^\d{2}:\d{2}$/;

/**
 * Checks what the form can say before it is turned into a `TaskInput`. The contract has the
 * last word, and the database the one after it.
 */
export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    notes: z.string().max(2000),
    contextId: z.string().min(1),
    assigneeIds: z.array(z.string().min(1)).min(1).max(100),
    scheduleType: scheduleTypeSchema,
    date: dayText,
    time: z.string(),
    startDate: z.union([dayText, z.literal('')]),
    hasDuration: z.boolean(),
    durationMin: z.int().min(1).max(1440),
    reminders: z.array(z.int().min(0).max(43200)).max(5),
    repeat: z.boolean(),
    recurrence: recurrenceInputSchema,
    requiresPhotoProof: z.boolean(),
    requiresAdminApproval: z.boolean(),
    requiresPartialReason: z.boolean(),
    difficulty: taskDifficultySchema,
    priority: taskPrioritySchema,
    visibility: taskVisibilitySchema,
  })
  .superRefine((values, ctx) => {
    if (values.scheduleType === 'timed' && !timeText.test(values.time)) {
      ctx.addIssue({ code: 'custom', path: ['time'], message: 'required' });
    }
    if (values.scheduleType === 'deadline' && values.startDate && values.startDate > values.date) {
      ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'after_due' });
    }
    const { end } = values.recurrence;
    if (values.repeat && end.type === 'on_date' && end.date < values.date) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'end', 'date'],
        message: 'before_start',
      });
    }
  });
