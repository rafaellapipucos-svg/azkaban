// No imports: `pnpm db:check-permissions` loads this file directly in Node.

/**
 * Rules the database enforces. Mirrored in public.app_settings under the key `task_rules`, so
 * changing a value here needs a migration too, and `pnpm db:check-permissions` compares both.
 */
export const taskRules = {
  /** Hours after `overdueAt` in which the assignee can still resolve. 72h covers a weekend. */
  lateCompletionWindowHours: 72,
  /**
   * `overdueAt` of each schedule type. `end_of_day` is the local midnight after the due moment,
   * `due` is the due moment itself. Both add `toleranceMinutes`. Section 15, question 7.
   */
  autoMiss: {
    timed: { anchor: 'end_of_day', toleranceMinutes: 0 },
    all_day: { anchor: 'end_of_day', toleranceMinutes: 0 },
    deadline: { anchor: 'due', toleranceMinutes: 0 },
  },
  /**
   * The red-by-default job (ADR-0008): at most `batchSize` occurrences per run, and none whose status
   * changed in the last `reopenGraceMinutes`, so a reopened occurrence can be rescheduled first.
   */
  autoMissJob: { batchSize: 500, reopenGraceMinutes: 60 },
  /** XP is `status × difficultyWeight`, where `done_late` applies to a late `done`. */
  xp: {
    status: { done: 10, done_late: 5, partial: 3, missed: 0 },
    difficultyWeight: { easy: 1, medium: 2, hard: 3 },
  },
} as const;

export const taskDefaults = {
  materializationWindowDays: 60,
  /**
   * No series is created further back than this. Older days are history nobody can act on: the
   * assignee resolves up to `lateCompletionWindowHours` late. ADR-0005, section 7.
   */
  materializationPastDays: 30,
  /** Extra calls the client makes while the function answers `deferred > 0`. ADR-0008. */
  materializeMaxFollowUps: 2,
  /** How far past today a user can ask for occurrences. */
  onDemandMaxDays: 366,
  /** Minutes before the task. all_day has none: midnight is no time to ring. */
  reminderLeadMinutes: { timed: [30, 0], all_day: [], deadline: [1440, 0] },
  requiresPhotoProof: false,
  requiresAdminApproval: false,
  requiresPartialReason: true,
  difficulty: 'easy',
  priority: 'normal',
} as const;
