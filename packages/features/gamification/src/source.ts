import type {
  Achievement,
  GroupRankingInput,
  GroupRankingRow,
  GroupSettings,
  RankingErrorCode,
  UserAchievement,
  UserDayStats,
  UserStats,
  XpEvent,
} from '@azkaban/contracts';
import { addDays } from '@azkaban/core';

/** A new row the user may read, as the Realtime delivers it (ADR-0010, section 8). */
export type GamificationRow =
  | { table: 'xp_events'; event: Pick<XpEvent, 'reason' | 'amount'> }
  | { table: 'user_achievements'; key: string };

export class RankingError extends Error {
  constructor(readonly code: RankingErrorCode) {
    super(code);
  }
}

/**
 * What the screens read. The real one is `packages/data/src/gamification`, after F6-2; until then the
 * screens run on `fakeGamificationSource`. Every read is the signed-in user's own (RLS).
 */
export type GamificationSource = {
  /** Null before the first event or close: all zero. */
  getStats(): Promise<UserStats | null>;
  /** `user_day_stats` from `from` to `to`, both included. A missing day had nothing planned. */
  listDays(from: string, to: string): Promise<UserDayStats[]>;
  listAchievements(): Promise<Achievement[]>;
  listGranted(): Promise<UserAchievement[]>;
  /** The capped-reason events of a local day of the profile, for "teto atingido". */
  listEventsOn(localDate: string): Promise<Pick<XpEvent, 'reason' | 'amount'>[]>;
  /** Throws `RankingError` for `forbidden` and `ranking_disabled`. */
  groupRanking(input: GroupRankingInput): Promise<GroupRankingRow[]>;
  getGroupSettings(groupId: string): Promise<GroupSettings>;
  /** Reads, merges and writes `groups.settings`, so other keys survive. */
  setRankingEnabled(groupId: string, enabled: boolean): Promise<void>;
  /** Inserts in `xp_events` and `user_achievements` of `userId`. Returns the unsubscribe. */
  subscribe(userId: string, onRow: (row: GamificationRow) => void): () => void;
};

// ponytail: fixed sample data so the screens can be built before F6-2; swap for the data repository
// in `gamificationSource` below, and delete this, once `user_stats` and friends exist.
const today = () => new Date().toISOString().slice(0, 10);
const settings = new Map<string, GroupSettings>();
const listeners = new Set<(row: GamificationRow) => void>();

export const fakeGamificationSource: GamificationSource & {
  /** Plays a row as if the Realtime had sent it. */
  emit(row: GamificationRow): void;
} = {
  async getStats() {
    return {
      userId: 'fake',
      totalXp: 420,
      currentStreak: 5,
      bestStreak: 9,
      streakFreezes: 1,
      perfectRun: 2,
      lastClosedDate: addDays(today(), -1),
      updatedAt: new Date().toISOString(),
    };
  },
  async listDays(from, to) {
    const days: UserDayStats[] = [];
    for (let date = from, i = 0; date <= to; date = addDays(date, 1), i += 1) {
      if (i % 4 === 3) continue; // An empty day now and then.
      const planned = 3 + (i % 3);
      const done = i % 5 === 1 ? 1 : planned;
      days.push({
        userId: 'fake',
        localDate: date,
        planned,
        done,
        partial: 0,
        missed: planned - done,
        goalMet: done === planned,
        perfect: done === planned,
        freezeUsed: i % 5 === 1,
        streak: 5,
        freezes: 1,
        perfectRun: 2,
      });
    }
    return days;
  },
  async listAchievements() {
    return [
      { key: 'first_task', kind: 'occurrences_done', threshold: 1, icon: '🌱', sortOrder: 1 },
      { key: 'streak_7', kind: 'streak_days', threshold: 7, icon: '🔥', sortOrder: 2 },
      { key: 'streak_30', kind: 'streak_days', threshold: 30, icon: '🏆', sortOrder: 3 },
      { key: 'proofs_100', kind: 'proofs', threshold: 100, icon: '📸', sortOrder: 4 },
      { key: 'perfect_week', kind: 'perfect_run', threshold: 7, icon: '⭐', sortOrder: 5 },
    ];
  },
  async listGranted() {
    return [
      {
        userId: 'fake',
        achievementKey: 'first_task',
        grantedAt: `${addDays(today(), -12)}T12:00:00Z`,
      },
    ];
  },
  async listEventsOn() {
    return [
      { reason: 'occurrence_done', amount: 20 },
      { reason: 'proof_bonus', amount: 5 },
    ];
  },
  async groupRanking({ groupId }) {
    if (settings.get(groupId)?.rankingEnabled === false) throw new RankingError('ranking_disabled');
    return [
      { userId: 'fake-1', displayName: 'Ana', xp: 180, rank: 1 },
      { userId: 'fake-2', displayName: 'Bruno', xp: 120, rank: 2 },
      { userId: 'fake-3', displayName: 'Carla', xp: 120, rank: 2 },
    ];
  },
  async getGroupSettings(groupId) {
    return settings.get(groupId) ?? {};
  },
  async setRankingEnabled(groupId, enabled) {
    settings.set(groupId, { ...settings.get(groupId), rankingEnabled: enabled });
  },
  subscribe(_userId, onRow) {
    listeners.add(onRow);
    return () => void listeners.delete(onRow);
  },
  emit(row) {
    for (const listener of listeners) listener(row);
  },
};

/** The one place to swap for the real repository after F6-2. */
export const gamificationSource: GamificationSource = fakeGamificationSource;
