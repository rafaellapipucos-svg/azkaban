import type {
  Achievement,
  GroupRankingInput,
  GroupRankingRow,
  GroupSettings,
  UserAchievement,
  UserDayStats,
  UserStats,
} from '@azkaban/contracts';
import { gamificationRepository, type GamificationRow, type XpEventItem } from '@azkaban/data';

export { RankingError, type GamificationRow } from '@azkaban/data';

/** What the screens read. Every read is the signed-in user's own (RLS). */
export type GamificationSource = {
  /** Null before the first event or close: all zero. */
  getStats(): Promise<UserStats | null>;
  /** `user_day_stats` from `from` to `to`, both included. A missing day had nothing planned. */
  listDays(from: string, to: string): Promise<UserDayStats[]>;
  listAchievements(): Promise<Achievement[]>;
  listGranted(): Promise<UserAchievement[]>;
  /** The capped-reason events written from the instant `since` on, for "teto atingido". */
  listCapEventsSince(since: string): Promise<XpEventItem[]>;
  /** Throws `RankingError` for `forbidden` and `ranking_disabled`. */
  groupRanking(input: GroupRankingInput): Promise<GroupRankingRow[]>;
  getGroupSettings(groupId: string): Promise<GroupSettings>;
  /** Reads, merges and writes `groups.settings`, so other keys survive. */
  setRankingEnabled(groupId: string, enabled: boolean): Promise<void>;
  /** Inserts in `xp_events` and `user_achievements` of `userId`. Returns the unsubscribe. */
  subscribe(userId: string, onRow: (row: GamificationRow) => void): () => void;
};

export const gamificationSource: GamificationSource = gamificationRepository;
