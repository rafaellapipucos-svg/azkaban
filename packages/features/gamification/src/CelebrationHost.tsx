import { gamificationDefaults } from '@azkaban/config';
import type { UserStats } from '@azkaban/contracts';
import { celebrationsFor, levelForXp, type Celebration } from '@azkaban/core';
import { useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { playTone, vibrate } from '@azkaban/platform';
import { CelebrationCard, PerfectDayScreen, tokens } from '@azkaban/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { gamificationUi } from './config';
import { gamificationKey, useCelebrationPrefs } from './hooks';
import { celebrationFeedback, readCelebratedLevel, rememberCelebratedLevel } from './preferences';
import { gamificationSource as source, type GamificationRow } from './source';

type Stats = Pick<UserStats, 'totalXp' | 'currentStreak'>;
const statsOf = (row: UserStats | null): Stats => ({
  totalXp: row?.totalXp ?? 0,
  currentStreak: row?.currentStreak ?? 0,
});

/**
 * Mounted once by the route in the signed-in layout, like the NotificationToaster (ADR-0010, section
 * 8). Listens to the user's new `xp_events` and `user_achievements`, reads `user_stats` once per burst,
 * and lets core decide what to celebrate against the stats it saw before. Works for any path to a
 * completion: Hoje, the calendar, a proof approved later.
 */
export function CelebrationHost() {
  const { t } = useTranslation('gamification');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { prefs, device } = useCelebrationPrefs();
  const [shown, setShown] = useState<{ id: number; list: Celebration[] } | null>(null);
  // The listener lives as long as the user; it reads the latest switches through this.
  const feedback = useRef(celebrationFeedback(prefs, device));
  useEffect(() => {
    feedback.current = celebrationFeedback(prefs, device);
  }, [prefs, device]);

  useEffect(() => {
    if (!user.id) return;
    const userId = user.id;
    let alive = true;
    let rows: GamificationRow[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bursts are handled one after the other, each against the stats the one before left. Null when
    // the first read failed: that burst then compares with itself and celebrates only its own rows.
    let before: Promise<Stats | null> = source
      .getStats()
      .then(async (row) => {
        const stats = statsOf(row);
        // A device that never celebrated starts at the current level, so a reopen and redo on a
        // new device does not celebrate a level reached long ago.
        await rememberCelebratedLevel(
          userId,
          levelForXp(stats.totalXp, gamificationDefaults.level).level,
        );
        return stats;
      })
      .catch(() => null);

    const flush = async (previous: Stats | null): Promise<Stats> => {
      const burst = rows;
      rows = [];
      const after = statsOf(await source.getStats());
      const result = celebrationsFor(previous ?? after, after, {
        events: burst.flatMap((row) => (row.table === 'xp_events' ? [row.event] : [])),
        achievementKeys: burst.flatMap((row) =>
          row.table === 'user_achievements' ? [row.key] : [],
        ),
        streakMilestones: gamificationDefaults.streakMilestones,
        celebratedLevel: await readCelebratedLevel(userId),
        levelCurve: gamificationDefaults.level,
      });
      await rememberCelebratedLevel(userId, result.celebratedLevel);
      void queryClient.invalidateQueries({ queryKey: gamificationKey });
      if (alive && result.celebrations.length > 0) {
        setShown({ id: Date.now(), list: result.celebrations });
        if (feedback.current.sound) playTone(gamificationUi.tone);
        if (feedback.current.haptics) vibrate(gamificationUi.hapticPattern);
      }
      return after;
    };

    const unsubscribe = source.subscribe(userId, (row) => {
      rows.push(row);
      clearTimeout(timer);
      timer = setTimeout(() => {
        // A failed read skips this burst and keeps the stats from before.
        before = before.then((previous) => flush(previous).catch(() => previous));
      }, gamificationUi.burstMs);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [user.id, queryClient]);

  // A completion at the cap or with a photo in review moves the streak without any event (QA6-3), so
  // the stats are read again after every successful save, without `tasks` knowing this feature.
  // ponytail: any mutation refetches the one-row stats while shown; narrow it if that ever weighs.
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((change) => {
        if (change.type === 'updated' && change.action.type === 'success')
          void queryClient.invalidateQueries({ queryKey: [...gamificationKey, 'stats'] });
      }),
    [queryClient],
  );

  const top = shown?.list[0];
  useEffect(() => {
    if (!shown || top?.kind === 'perfect_day') return;
    const id = setTimeout(() => setShown(null), gamificationUi.cardMs);
    return () => clearTimeout(id);
  }, [shown, top]);

  if (!shown || !top) return null;
  const text = (c: Celebration) => {
    switch (c.kind) {
      case 'streak_milestone':
        return t('celebration.streak_milestone', { count: c.days });
      case 'level_up':
        return t('celebration.level_up', { level: c.level });
      case 'achievement':
        return t('celebration.achievement', {
          title: t(`achievements.${c.key}.title`, { defaultValue: c.key }),
        });
      default:
        return t(`celebration.${c.kind}`);
    }
  };
  const others = shown.list.slice(1).map(text);
  const close = () => setShown(null);

  if (top.kind === 'perfect_day')
    return (
      <PerfectDayScreen
        visible
        title={text(top)}
        detail={[t('celebration.perfectDayDetail'), ...others].join(' ')}
        closeLabel={t('celebration.close')}
        onClose={close}
      />
    );
  return (
    <View
      // Centered, clear of the header controls above and of the toaster and tab bar below.
      style={{
        pointerEvents: 'box-none',
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      }}
      className="items-center justify-center px-4"
    >
      <View style={{ width: '100%', maxWidth: tokens.layout.maxContentWidth }}>
        <CelebrationCard
          key={shown.id}
          kind={top.kind}
          title={text(top)}
          others={others}
          closeLabel={t('celebration.close')}
          onClose={close}
        />
      </View>
    </View>
  );
}
