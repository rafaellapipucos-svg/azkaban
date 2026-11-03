import { z } from 'zod';
import { idSchema, instantSchema, localDateSchema } from './common';

// Gamification (ADR-0010). `xp_events` is the source; everything here is a cache the database derives
// from it and from the occurrences, and only the owner reads it. Level is not stored: core derives it
// from `totalXp` and the curve in config.

const count = z.int().min(0);

/** `user_stats`: one row per user, written only by the database. Missing row means all zero. */
export const userStatsSchema = z.object({
  userId: idSchema,
  /** Sum of the user's `xp_events`. */
  totalXp: z.int(),
  /** Days in a row meeting the goal, today included once it is met (section 3). */
  currentStreak: count,
  bestStreak: count,
  streakFreezes: count,
  /** Perfect days in a row, days without tasks skipped. Feeds "semana perfeita". */
  perfectRun: count,
  /** Last local day the close job counted. Null before the first close. */
  lastClosedDate: localDateSchema.nullable(),
  updatedAt: instantSchema,
});
export type UserStats = z.infer<typeof userStatsSchema>;

/**
 * `user_day_stats`: one local day of the profile, with the counts of that day and the streak state
 * after it. A day without a row had nothing planned.
 */
export const userDayStatsSchema = z.object({
  userId: idSchema,
  localDate: localDateSchema,
  /** Non-cancelled occurrences of the day; `in_review` counts as `done`. */
  planned: count,
  done: count,
  partial: count,
  missed: count,
  goalMet: z.boolean(),
  perfect: z.boolean(),
  freezeUsed: z.boolean(),
  streak: count,
  freezes: count,
  perfectRun: count,
});
export type UserDayStats = z.infer<typeof userDayStatsSchema>;

/**
 * How the database measures an achievement. A new achievement of a known kind is a seed row; a new
 * kind is code in the database and here.
 */
export const achievementKindSchema = z.enum([
  /** Distinct occurrences in `done`, `in_review` excluded. */
  'occurrences_done',
  /** `currentStreak` reached. */
  'streak_days',
  /** Distinct occurrences in `done` with a current proof that is `unreviewed` or `approved`. */
  'proofs',
  /** `perfectRun` reached. */
  'perfect_run',
]);
export type AchievementKind = z.infer<typeof achievementKindSchema>;

/** Text lives in i18n under `gamification:achievements.<key>.title` and `.description`. */
export const achievementKeySchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

/** `achievements`: seeded, readable by any signed-in user. */
export const achievementSchema = z.object({
  key: achievementKeySchema,
  kind: achievementKindSchema,
  threshold: z.int().min(1),
  /** An emoji, shown with the text, never alone. */
  icon: z.string().min(1).max(16),
  sortOrder: z.int(),
});
export type Achievement = z.infer<typeof achievementSchema>;

/** `user_achievements`: granted once, never revoked. */
export const userAchievementSchema = z.object({
  userId: idSchema,
  achievementKey: achievementKeySchema,
  grantedAt: instantSchema,
});
export type UserAchievement = z.infer<typeof userAchievementSchema>;

/**
 * Arguments of the RPC `group_ranking`. The week is `[weekStart, weekStart + 7 days)` in the caller's
 * profile zone, read by the server. `weekStart` falls on `gamificationRules.ranking.weekStartsOn` and
 * is one of the last `ranking.maxWeeks` weeks (ADR-0010, SEG6-4).
 */
export const groupRankingInputSchema = z.object({
  groupId: idSchema,
  weekStart: localDateSchema,
});
export type GroupRankingInput = z.infer<typeof groupRankingInputSchema>;

/**
 * One row per current member with positive XP that week from tasks of that group. Nothing else about
 * the member: no level, no streak, no total (section 7).
 */
export const groupRankingRowSchema = z.object({
  userId: idSchema,
  displayName: z.string(),
  xp: z.int().min(1),
  /** Ties share a rank, as `rank()` does. */
  rank: z.int().min(1),
});
export type GroupRankingRow = z.infer<typeof groupRankingRowSchema>;

/** Raised by `group_ranking`. `ranking_disabled` is the toggle off, a normal state the UI explains. */
export const rankingErrorCodeSchema = z.enum(['forbidden', 'ranking_disabled']);
export type RankingErrorCode = z.infer<typeof rankingErrorCodeSchema>;

/**
 * What the client celebrates, decided in core from the state before and after (section 8). Ordered
 * from the smallest; when several happen at once the screen shows the largest and lists the rest.
 */
export const celebrationKindSchema = z.enum([
  'occurrence_partial',
  'occurrence_done',
  'streak_milestone',
  'perfect_day',
  'level_up',
  'achievement',
]);
export type CelebrationKind = z.infer<typeof celebrationKindSchema>;
