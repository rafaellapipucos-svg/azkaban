import {
  achievementSchema,
  cappedXpEventReasons,
  groupRankingInputSchema,
  groupRankingRowSchema,
  groupSettingsSchema,
  rankingErrorCodeSchema,
  userAchievementSchema,
  userDayStatsSchema,
  userStatsSchema,
  xpEventReasonSchema,
  type Achievement,
  type GroupRankingInput,
  type GroupRankingRow,
  type GroupSettings,
  type RankingErrorCode,
  type UserAchievement,
  type UserDayStats,
  type UserStats,
  type XpEvent,
} from '@azkaban/contracts';
import { currentUserId, db } from '../client';
import type { Json } from '../database.types';

/** An event as the screens use it: `capRoom` groups by `occurrenceId`, else `id`. */
export type XpEventItem = Pick<XpEvent, 'id' | 'occurrenceId' | 'reason' | 'amount'>;

/** A new row of the user's, as the Realtime delivers it (ADR-0010, section 8). */
export type GamificationRow =
  { table: 'xp_events'; event: XpEventItem } | { table: 'user_achievements'; key: string };

/** `forbidden` or `ranking_disabled` from `group_ranking`; the UI explains both. */
export class RankingError extends Error {
  constructor(readonly code: RankingErrorCode) {
    super(code);
  }
}

type XpEventRow = { id: string; occurrence_id: string | null; reason: string; amount: number };

// A reason from a newer server is left out instead of failing the list or the burst.
function toEventItem(row: XpEventRow): XpEventItem | null {
  const reason = xpEventReasonSchema.safeParse(row.reason);
  return reason.success
    ? { id: row.id, occurrenceId: row.occurrence_id, reason: reason.data, amount: row.amount }
    : null;
}

/** Every read is the signed-in user's own; RLS already says so, the filter keeps it if that widens. */
export const gamificationRepository = {
  /** Null before the first event or close: all zero. */
  async getStats(): Promise<UserStats | null> {
    const { data, error } = await db()
      .from('user_stats')
      .select('*')
      .eq('user_id', await currentUserId())
      .maybeSingle();
    if (error) throw error;
    return data
      ? userStatsSchema.parse({
          userId: data.user_id,
          totalXp: data.total_xp,
          currentStreak: data.current_streak,
          bestStreak: data.best_streak,
          streakFreezes: data.streak_freezes,
          perfectRun: data.perfect_run,
          lastClosedDate: data.last_closed_date,
          updatedAt: data.updated_at,
        })
      : null;
  },

  /** `user_day_stats` from `from` to `to`, both included. A missing day had nothing planned. */
  async listDays(from: string, to: string): Promise<UserDayStats[]> {
    const { data, error } = await db()
      .from('user_day_stats')
      .select('*')
      .eq('user_id', await currentUserId())
      .gte('local_date', from)
      .lte('local_date', to)
      .order('local_date');
    if (error) throw error;
    return data.map((row) =>
      userDayStatsSchema.parse({
        userId: row.user_id,
        localDate: row.local_date,
        planned: row.planned,
        done: row.done,
        partial: row.partial,
        missed: row.missed,
        goalMet: row.goal_met,
        perfect: row.perfect,
        freezeUsed: row.freeze_used,
        streak: row.streak,
        freezes: row.freezes,
        perfectRun: row.perfect_run,
      }),
    );
  },

  async listAchievements(): Promise<Achievement[]> {
    const { data, error } = await db().from('achievements').select('*').order('sort_order');
    if (error) throw error;
    // A kind from a newer server is left out.
    return data.flatMap((row) => {
      const parsed = achievementSchema.safeParse({
        key: row.key,
        kind: row.kind,
        threshold: row.threshold,
        icon: row.icon,
        sortOrder: row.sort_order,
      });
      return parsed.success ? [parsed.data] : [];
    });
  },

  async listGranted(): Promise<UserAchievement[]> {
    const { data, error } = await db()
      .from('user_achievements')
      .select('*')
      .eq('user_id', await currentUserId());
    if (error) throw error;
    return data.map((row) =>
      userAchievementSchema.parse({
        userId: row.user_id,
        achievementKey: row.achievement_key,
        grantedAt: row.granted_at,
      }),
    );
  },

  /** The capped-reason events written from `since` on: today's, for "teto atingido". */
  async listCapEventsSince(since: string): Promise<XpEventItem[]> {
    const { data, error } = await db()
      .from('xp_events')
      .select('id, occurrence_id, reason, amount')
      .eq('user_id', await currentUserId())
      .in('reason', [...cappedXpEventReasons])
      .gte('created_at', since);
    if (error) throw error;
    return data.map(toEventItem).filter((event) => event !== null);
  },

  /** Throws `RankingError` for `forbidden` and `ranking_disabled`. */
  async groupRanking(input: GroupRankingInput): Promise<GroupRankingRow[]> {
    const { groupId, weekStart, timezone } = groupRankingInputSchema.parse(input);
    const { data, error } = await db().rpc('group_ranking', {
      p_group_id: groupId,
      p_week_start: weekStart,
      p_timezone: timezone,
    });
    if (error) {
      const code = rankingErrorCodeSchema.safeParse(error.message);
      throw code.success ? new RankingError(code.data) : error;
    }
    return data.map((row) =>
      groupRankingRowSchema.parse({
        userId: row.user_id,
        displayName: row.display_name,
        xp: row.xp,
        rank: row.rank,
      }),
    );
  },

  async getGroupSettings(groupId: string): Promise<GroupSettings> {
    const { data, error } = await db().from('groups').select('settings').eq('id', groupId).single();
    if (error) throw error;
    return groupSettingsSchema.parse(data.settings);
  },

  /** Reads, merges and writes `groups.settings`, so other keys survive. RLS asks `group.update`. */
  // ponytail: read-merge-write races with another settings writer; a jsonb_set RPC if one appears.
  async setRankingEnabled(groupId: string, enabled: boolean) {
    const settings = groupSettingsSchema.parse({
      ...(await gamificationRepository.getGroupSettings(groupId)),
      rankingEnabled: enabled,
    });
    const { data, error } = await db()
      .from('groups')
      .update({ settings: settings as NonNullable<Json> })
      .eq('id', groupId)
      .select('id');
    if (error) throw error;
    // RLS hides a refused update as zero rows.
    if (data.length === 0) throw new Error('forbidden');
  },

  /** Inserts in the user's `xp_events` and `user_achievements`. Returns the unsubscribe. */
  subscribe(userId: string, onRow: (row: GamificationRow) => void) {
    const channel = db()
      .channel(`gamification:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'xp_events', filter: `user_id=eq.${userId}` },
        (payload) => {
          const event = toEventItem(payload.new as XpEventRow);
          if (event) onRow({ table: 'xp_events', event });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_achievements',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const key = (payload.new as { achievement_key?: string }).achievement_key;
          if (key) onRow({ table: 'user_achievements', key });
        },
      )
      .subscribe();
    return () => void db().removeChannel(channel);
  },
};
