/** Tunables of this module (PROMPT_MESTRE 5.1: each module has its own config). */
export const tasksConfig = {
  /** Section 5.2: the window of "prazos próximos", in days. */
  dueSoonDays: 7,
  /** How far ahead an area tab lists. */
  areaWindowDays: 14,
  /** Lead times the reminder chips offer, in minutes. Saved values outside the list still show. */
  reminderOptions: [0, 10, 30, 60, 1440],
  durationStepMin: 15,
  maxDurationMin: 1440,
  maxCount: 730,
  /** Where quick create remembers the last context. */
  lastContextKey: 'tasks.lastContextId',
  /** How long the "task created" message stays up, in ms. */
  noticeMs: 4000,
} as const;
