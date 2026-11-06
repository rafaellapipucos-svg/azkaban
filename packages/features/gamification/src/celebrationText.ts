import type { Celebration } from '@azkaban/core';

type T = (key: string, options?: Record<string, unknown>) => string;

/** The line for one celebration. Every line ends in its own punctuation, so lines can be joined. */
export function celebrationText(t: T, c: Celebration): string {
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
}

/** The perfect day screen's one paragraph: its own line, then the other celebrations of the burst. */
export const perfectDayDetail = (t: T, others: string[]) =>
  [t('celebration.perfectDayDetail'), ...others].join(' ');
