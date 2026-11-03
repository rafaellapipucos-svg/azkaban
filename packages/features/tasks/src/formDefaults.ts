import { taskDefaults } from '@azkaban/config';
import { defaultRecurrence, type TaskFormValues } from '@azkaban/core';

const DEFAULT_DURATION_MIN = 30;

/** A new timed task with the defaults from config. The caller sets what the user chose. */
export function defaultFormValues({
  contextId,
  userId,
  date,
  time,
}: {
  contextId: string;
  userId: string;
  date: string;
  time: string;
}): TaskFormValues {
  return {
    title: '',
    notes: '',
    contextId,
    assigneeIds: [userId],
    scheduleType: 'timed',
    date,
    time,
    startDate: '',
    hasDuration: false,
    durationMin: DEFAULT_DURATION_MIN,
    reminders: [...taskDefaults.reminderLeadMinutes.timed],
    repeat: false,
    recurrence: defaultRecurrence(),
    requiresPhotoProof: taskDefaults.requiresPhotoProof,
    requiresAdminApproval: taskDefaults.requiresAdminApproval,
    requiresPartialReason: taskDefaults.requiresPartialReason,
    difficulty: taskDefaults.difficulty,
    priority: taskDefaults.priority,
    visibility: 'group',
  };
}
