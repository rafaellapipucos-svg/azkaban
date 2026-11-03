import type { OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { Text, View } from 'react-native';

// Status is never conveyed by color alone: each one carries a symbol and a label.
const statusStyles: Record<OccurrenceStatus, { symbol: string; box: string; label: string }> = {
  pending: {
    symbol: '•',
    box: 'bg-pending dark:bg-pending-dark',
    label: 'text-onPending dark:text-onPending-dark',
  },
  done: { symbol: '✓', box: 'bg-done', label: 'text-onDone' },
  partial: { symbol: '~', box: 'bg-partial', label: 'text-onPartial' },
  missed: { symbol: '✗', box: 'bg-missed', label: 'text-onMissed' },
  cancelled: { symbol: '–', box: 'bg-cancelled', label: 'text-onCancelled' },
};

export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const { t } = useTranslation();
  const { symbol, box, label } = statusStyles[status];
  return (
    <View className={`min-h-11 flex-row items-center gap-2 rounded-full px-4 ${box}`}>
      <Text aria-hidden className={`font-heavy text-md ${label}`}>
        {symbol}
      </Text>
      <Text className={`font-body text-md ${label}`}>{t(`status.${status}`)}</Text>
    </View>
  );
}
