import { gamificationDefaults, gamificationRules } from '@azkaban/config';
import { addDays, capRoom, levelForXp, localDateOf, startOfWeek } from '@azkaban/core';
import { useCurrentUser } from '@azkaban/data';
import { canPlayTone, canVibrate } from '@azkaban/platform';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gamificationUi } from './config';
import { readCelebrationPrefs, writeCelebrationPrefs, type CelebrationPrefs } from './preferences';
import { gamificationSource as source } from './source';

/** Every key of the feature starts with this, so a burst refreshes all of it at once. */
export const gamificationKey = ['gamification'] as const;

export function useToday() {
  const { timezone } = useCurrentUser();
  return localDateOf(timezone, Date.now());
}

/** `user_stats` with the level derived from it. A missing row is all zero. */
export function useProgress() {
  const query = useQuery({ queryKey: [...gamificationKey, 'stats'], queryFn: source.getStats });
  const stats = query.data ?? null;
  const totalXp = stats?.totalXp ?? 0;
  return {
    ...query,
    totalXp,
    streak: stats?.currentStreak ?? 0,
    bestStreak: stats?.bestStreak ?? 0,
    freezes: stats?.streakFreezes ?? 0,
    level: levelForXp(totalXp, gamificationDefaults.level),
  };
}

export function useRecentDays() {
  const today = useToday();
  const from = addDays(today, 1 - gamificationUi.recentDays);
  return useQuery({
    queryKey: [...gamificationKey, 'days', from, today],
    queryFn: () => source.listDays(from, today),
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: [...gamificationKey, 'achievements'],
    queryFn: async () => {
      const [all, granted] = await Promise.all([source.listAchievements(), source.listGranted()]);
      const grantedAt = new Map(granted.map((g) => [g.achievementKey, g.grantedAt]));
      return all
        .toSorted((a, b) => a.sortOrder - b.sortOrder)
        .map((a) => ({ ...a, grantedAt: grantedAt.get(a.key) ?? null }));
    },
  });
}

/**
 * Whether the capped XP of the last `capWindowHours` reached `dailyCap` (ADR-0010, SEG6-1). The window
 * moves, so the room comes back as events leave it: a burst refreshes it through `gamificationKey`,
 * and the clock through `capRefreshMs`.
 */
export function useCapReached() {
  const events = useQuery({
    queryKey: [...gamificationKey, 'capEvents'],
    queryFn: () => {
      const since = Date.now() - gamificationRules.xp.capWindowHours * 3_600_000;
      return source.listCapEventsSince(new Date(since).toISOString());
    },
    refetchInterval: gamificationUi.capRefreshMs,
  });
  return events.data ? capRoom(events.data, gamificationRules.xp.dailyCap) === 0 : false;
}

/** The current week only, which is always one of the `ranking.maxWeeks` the server answers. */
export function useRanking(groupId: string, enabled: boolean) {
  const weekStart = startOfWeek(useToday(), gamificationRules.ranking.weekStartsOn);
  return useQuery({
    queryKey: [...gamificationKey, 'ranking', groupId, weekStart],
    queryFn: () => source.groupRanking({ groupId, weekStart }),
    enabled,
    retry: false,
  });
}

export function useGroupSettings(groupId: string) {
  const queryClient = useQueryClient();
  const key = [...gamificationKey, 'groupSettings', groupId];
  const settings = useQuery({ queryKey: key, queryFn: () => source.getGroupSettings(groupId) });
  const setRanking = useMutation({
    mutationFn: (enabled: boolean) => source.setRankingEnabled(groupId, enabled),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...gamificationKey] }),
  });
  return { settings, setRanking };
}

const prefsKey = [...gamificationKey, 'prefs'];

export function useCelebrationPrefs() {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: prefsKey, queryFn: readCelebrationPrefs });
  const save = useMutation({
    mutationFn: writeCelebrationPrefs,
    onMutate: (next: CelebrationPrefs) => queryClient.setQueryData(prefsKey, next),
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefsKey }),
  });
  return {
    prefs: prefs.data ?? gamificationDefaults.celebration,
    save: save.mutate,
    device: { canPlayTone: canPlayTone(), canVibrate: canVibrate() },
  };
}
