import { useTranslation } from '@azkaban/i18n';
import { StreakBadge } from '@azkaban/ui';
import { useProgress } from './hooks';

/**
 * The streak for the header slot of Hoje (ADR-0010, section 10). The route mounts it and says where a
 * press goes, usually the profile. Nothing until the stats load, so the header does not show a 0
 * that turns into the real number.
 */
export function StreakChip({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation('gamification');
  const { isSuccess, streak, freezes } = useProgress();
  if (!isSuccess) return null;
  return (
    <StreakBadge
      days={streak}
      label={t('streak.days', { count: streak })}
      protection={
        freezes > 0 ? { count: freezes, label: t('streak.freezes', { count: freezes }) } : undefined
      }
      onPress={onPress}
    />
  );
}
