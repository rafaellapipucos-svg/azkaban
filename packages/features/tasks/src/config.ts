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
  team: {
    /** Sunday, like the calendar. */
    weekStartsOn: 0,
    /**
     * Completion rate (done over everything due so far) at which a member is green or yellow;
     * below `yellow` is red. PROVISIONAL: section 7.1 asks for the three colors, not for the
     * cut-offs, so 80% and 50% are a guess until the human validates them (ADR-0006 section 3).
     */
    bands: { green: 0.8, yellow: 0.5 },
  },
  /** Where quick create remembers the last context. */
  lastContextKey: 'tasks.lastContextId',
  /** Start time of a new task opened for a day other than today, with no time chosen. */
  otherDayDefaultTime: '09:00',
  /** How long the "task created" message stays up, in ms. */
  noticeMs: 4000,
} as const;
