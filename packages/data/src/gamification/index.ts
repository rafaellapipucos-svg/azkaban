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
import { subscribeCaughtUp } from '../realtime';

/** An event as the screens use it: `capRoom` groups by `occurrenceId` (else `id`) and `groupId`. */
export type XpEventItem = Pick<XpEvent, 'id' | 'occurrenceId' | 'groupId' | 'reason' | 'amount'>;

/** A new row of the user's, as the Realtime delivers it (ADR-0010, section 8). */
export type GamificationRow =
  { table: 'xp_events'; event: XpEventItem } | { table: 'user_achievements'; key: string };

/** `forbidden` or `ranking_disabled` from `group_ranking`; the UI explains both. */
export class RankingError extends Error {
  constructor(readonly code: RankingErrorCode) {
    super(code);
  }
}

type XpEventRow = {
  id: string;
  occurrence_id: string | null;
  group_id: string | null;
  reason: string;
  amount: number;
};

// A reason from a newer server is left out instead of failing the list or the burst.
function toEventItem(row: XpEventRow): XpEventItem | null {
  const reason = xpEventReasonSchema.safeParse(row.reason);
  return reason.success
    ? {
        id: row.id,
        occurrenceId: row.occurrence_id,
        groupId: row.group_id,
        reason: reason.data,
        amount: row.amount,
      }
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

  /** When the profile was created: "Últimos dias" starts on its local day (QA6-5). */
  async getMemberSince(): Promise<string> {
    const { data, error } = await db()
      .from('profiles')
      .select('created_at')
      .eq('id', await currentUserId())
      .single();
    if (error) throw error;
    return data.created_at;
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

  /** The capped-reason events written from `since` on: the cap window's, for "teto atingido". */
  async listCapEventsSince(since: string): Promise<XpEventItem[]> {
    const { data, error } = await db()
      .from('xp_events')
      .select('id, occurrence_id, group_id, reason, amount')
      .eq('user_id', await currentUserId())
      .in('reason', [...cappedXpEventReasons])
      .gte('created_at', since);
    if (error) throw error;
    return data.map(toEventItem).filter((event) => event !== null);
  },

  /** Throws `RankingError` for `forbidden` and `ranking_disabled`. */
  async groupRanking(input: GroupRankingInput): Promise<GroupRankingRow[]> {
    const { groupId, weekStart } = groupRankingInputSchema.parse(input);
    // The zone is the caller's profile, read by the server (ADR-0010, SEG6-4).
    const { data, error } = await db().rpc('group_ranking', {
      p_group_id: groupId,
      p_week_start: weekStart,
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

  /**
   * Inserts in the user's `xp_events` and `user_achievements`, each once, from the call on. Returns
   * the unsubscribe. What is written before the server hears the tables is read back
   * (`subscribeCaughtUp`).
   */
  subscribe(userId: string, onRow: (row: GamificationRow) => void) {
    const granted = async () => {
      const { data, error } = await db()
        .from('user_achievements')
        .select('achievement_key')
        .eq('user_id', userId);
      if (error) throw error;
      return data.map((row) => row.achievement_key);
    };
    const newest = async () => {
      const { data, error } = await db()
        .from('xp_events')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.created_at ?? null;
    };
    // What is already there: the newest event's instant, in server time, and the granted keys.
    // ponytail: a row written during this first read counts as old; the window is one round trip.
    const mark = Promise.all([newest(), granted()]);
    mark.catch(() => undefined);
    return subscribeCaughtUp<GamificationRow>(
      {
        name: `gamification:${userId}`,
        changes: [
          {
            filter: {
              event: 'INSERT',
              schema: 'public',
              table: 'xp_events',
              filter: `user_id=eq.${userId}`,
            },
            toItem: (payload) => {
              const event = toEventItem(payload.new as XpEventRow);
              return event && { table: 'xp_events', event };
            },
          },
          {
            filter: {
              event: 'INSERT',
              schema: 'public',
              table: 'user_achievements',
              filter: `user_id=eq.${userId}`,
            },
            toItem: (payload) => {
              const key = (payload.new as { achievement_key?: string }).achievement_key;
              return key ? { table: 'user_achievements', key } : null;
            },
          },
        ],
        catchUp: async () => {
          const [since, before] = await mark;
          let query = db()
            .from('xp_events')
            .select('id, occurrence_id, group_id, reason, amount')
            .eq('user_id', userId)
            .order('created_at');
          if (since) query = query.gt('created_at', since);
          const [events, keys] = await Promise.all([query, granted()]);
          if (events.error) throw events.error;
          const rows: GamificationRow[] = [];
          for (const row of events.data) {
            const event = toEventItem(row);
            if (event) rows.push({ table: 'xp_events', event });
          }
          for (const key of keys)
            if (!before.includes(key)) rows.push({ table: 'user_achievements', key });
          return rows;
        },
        key: (row) => (row.table === 'xp_events' ? `e:${row.event.id}` : `a:${row.key}`),
      },
      onRow,
    );
  },
};
