import { gamificationRules } from '@azkaban/config';
import type { UserDayStats } from '@azkaban/contracts';
import { addDays, localDateOf } from '@azkaban/core';
import { useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  AchievementBadge,
  Body,
  Button,
  Card,
  ErrorText,
  Muted,
  StreakBadge,
  Subtitle,
  SwitchRow,
  XpBar,
} from '@azkaban/ui';
import { View } from 'react-native';
import { gamificationUi } from './config';
import {
  useAchievements,
  useCapReached,
  useCelebrationPrefs,
  useProgress,
  useRecentDays,
  useToday,
} from './hooks';

/** `yyyy-MM-dd` as "3 de nov.", on the calendar, not the clock. */
const dateText = (date: string, language: string) =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );

const dayState = (day: UserDayStats | undefined) =>
  !day || day.planned === 0
    ? 'empty'
    : day.perfect
      ? 'perfect'
      : day.goalMet
        ? 'met'
        : day.freezeUsed
          ? 'freeze'
          : 'missed';

/**
 * Level, streak, freezes, the last days, achievements and the celebration switches. Mounted by the
 * route inside ProfileScreen, through `children` (ADR-0010, F6-3). Only the owner ever sees it.
 */
export function ProgressPanel() {
  const { t, i18n } = useTranslation('gamification');
  const { timezone } = useCurrentUser();
  const today = useToday();
  const progress = useProgress();
  const days = useRecentDays();
  const achievements = useAchievements();
  const capReached = useCapReached();
  const { prefs, save, device } = useCelebrationPrefs();

  if (progress.isError || days.isError || achievements.isError)
    return (
      <Card>
        <ErrorText>{t('loadError')}</ErrorText>
        <Button
          label={t('retry')}
          variant="secondary"
          onPress={() => {
            void progress.refetch();
            void days.refetch();
            void achievements.refetch();
          }}
        />
      </Card>
    );
  if (!progress.isSuccess) return null;

  const { level, streak, bestStreak, freezes } = progress;
  const byDate = new Map((days.data ?? []).map((day) => [day.localDate, day]));
  const recent = Array.from({ length: gamificationUi.recentDays }, (_, i) => addDays(today, -i));

  return (
    <View className="gap-4">
      <Card>
        <XpBar
          progress={level.xpIntoLevel / level.xpForNextLevel}
          label={t('level.title', { level: level.level })}
          valueText={t('level.progress', { into: level.xpIntoLevel, next: level.xpForNextLevel })}
        />
        <Muted>{t('level.total', { xp: progress.totalXp })}</Muted>
        {capReached ? (
          <Body role="status">{t('goal.capReached', { cap: gamificationRules.xp.dailyCap })}</Body>
        ) : null}
      </Card>

      <Card>
        <Subtitle>{t('streak.title')}</Subtitle>
        <StreakBadge
          days={streak}
          label={t('streak.days', { count: streak })}
          protection={
            freezes > 0
              ? { count: freezes, label: t('streak.freezes', { count: freezes }) }
              : undefined
          }
        />
        <Muted>{t('streak.best', { count: bestStreak })}</Muted>
        <Muted>
          {t('streak.freezesHint', {
            every: gamificationRules.streak.freezeEveryDays,
            max: gamificationRules.streak.maxFreezes,
          })}
        </Muted>
      </Card>

      {days.isSuccess ? (
        <Card>
          <Subtitle>{t('days.title')}</Subtitle>
          <View role="list">
            {recent.map((date) => (
              <Body key={date} role="listitem">
                {t('days.row', {
                  date: dateText(date, i18n.language),
                  state: t(`days.${dayState(byDate.get(date))}`),
                })}
              </Body>
            ))}
          </View>
        </Card>
      ) : null}

      {achievements.isSuccess ? (
        <Card>
          <Subtitle>{t('achievements.title')}</Subtitle>
          <View role="list" className="gap-3">
            {achievements.data.map((a) => (
              <View key={a.key} role="listitem">
                <AchievementBadge
                  icon={a.icon}
                  title={t(`achievements.${a.key}.title`, { defaultValue: a.key })}
                  description={t(`achievements.${a.key}.description`, { defaultValue: '' })}
                  unlocked={a.grantedAt !== null}
                  stateLabel={
                    a.grantedAt
                      ? t('achievements.granted', {
                          date: dateText(
                            localDateOf(timezone, Date.parse(a.grantedAt)),
                            i18n.language,
                          ),
                        })
                      : t('achievements.locked')
                  }
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Subtitle>{t('settings.title')}</Subtitle>
        <SwitchRow
          label={t('settings.sound')}
          description={
            device.canPlayTone ? t('settings.soundHint') : t('settings.soundUnsupported')
          }
          value={prefs.sound && device.canPlayTone}
          disabled={!device.canPlayTone}
          onValueChange={(sound) => save({ ...prefs, sound })}
        />
        <SwitchRow
          label={t('settings.haptics')}
          description={
            device.canVibrate ? t('settings.hapticsHint') : t('settings.hapticsUnsupported')
          }
          value={prefs.haptics && device.canVibrate}
          disabled={!device.canVibrate}
          onValueChange={(haptics) => save({ ...prefs, haptics })}
        />
      </Card>
    </View>
  );
}
