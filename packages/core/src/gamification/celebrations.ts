import {
  celebrationKindSchema,
  type Achievement,
  type AchievementKind,
  type UserStats,
  type XpEvent,
} from '@azkaban/contracts';
import { levelForXp, type LevelCurve } from './level';

/**
 * Achievements whose measure has reached the threshold (ADR-0010 section 5). `progress` holds the
 * measure of each kind: distinct `done` occurrences, distinct proven ones, and the streak and the
 * perfect run after a folded day. The database grants; this is its specification.
 */
export function reachedAchievements(
  achievements: readonly Pick<Achievement, 'key' | 'kind' | 'threshold'>[],
  progress: Record<AchievementKind, number>,
): string[] {
  return achievements.filter((a) => progress[a.kind] >= a.threshold).map((a) => a.key);
}

type EventKind = 'occurrence_partial' | 'occurrence_done' | 'perfect_day';

export type Celebration =
  | { kind: EventKind }
  | { kind: 'streak_milestone'; days: number }
  | { kind: 'level_up'; level: number }
  | { kind: 'achievement'; key: string };

type Stats = Pick<UserStats, 'totalXp' | 'currentStreak'>;

const eventKinds: Partial<Record<XpEvent['reason'], EventKind>> = {
  occurrence_done: 'occurrence_done',
  occurrence_done_late: 'occurrence_done',
  occurrence_partial: 'occurrence_partial',
  perfect_day: 'perfect_day',
};

const rank = (kind: Celebration['kind']) => celebrationKindSchema.options.indexOf(kind);

/**
 * What to celebrate after a burst of new rows (ADR-0010 section 8), from `user_stats` before and
 * after it, the new `xp_events` and the keys of the new `user_achievements`. Largest first: the
 * screen shows the first and lists the rest. A level is celebrated once per device: it must be
 * above both the level before and `celebratedLevel`, and the returned `celebratedLevel` is what to
 * store. Compensations celebrate nothing.
 */
export function celebrationsFor(
  before: Stats,
  after: Stats,
  options: {
    events: readonly Pick<XpEvent, 'reason' | 'amount'>[];
    achievementKeys: readonly string[];
    streakMilestones: readonly number[];
    celebratedLevel: number;
    levelCurve: LevelCurve;
  },
): { celebrations: Celebration[]; celebratedLevel: number } {
  const found: Celebration[] = [];

  const kinds = new Set<EventKind>();
  for (const { reason, amount } of options.events) {
    const kind = eventKinds[reason];
    if (kind && amount > 0) kinds.add(kind);
  }
  for (const kind of kinds) found.push({ kind });

  const milestone = Math.max(
    0,
    ...options.streakMilestones.filter(
      (days) => before.currentStreak < days && days <= after.currentStreak,
    ),
  );
  if (milestone > 0) found.push({ kind: 'streak_milestone', days: milestone });

  const level = levelForXp(after.totalXp, options.levelCurve).level;
  const levelBefore = levelForXp(before.totalXp, options.levelCurve).level;
  if (level > levelBefore && level > options.celebratedLevel)
    found.push({ kind: 'level_up', level });

  for (const key of options.achievementKeys) found.push({ kind: 'achievement', key });

  return {
    // Stable sort: achievements keep their order.
    celebrations: found.sort((a, b) => rank(b.kind) - rank(a.kind)),
    celebratedLevel: Math.max(options.celebratedLevel, level),
  };
}
