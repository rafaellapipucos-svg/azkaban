import type { OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { Text, View } from 'react-native';
import { statusSymbol } from './statusSymbol';
import { sizes } from './tokens';

// Status is never conveyed by color alone: each one carries a symbol (statusSymbol) and a label.
const statusStyles: Record<OccurrenceStatus, { box: string; label: string }> = {
  pending: {
    box: 'bg-pending dark:bg-pending-dark',
    label: 'text-onPending dark:text-onPending-dark',
  },
  done: { box: 'bg-done', label: 'text-onDone' },
  partial: { box: 'bg-partial', label: 'text-onPartial' },
  missed: { box: 'bg-missed', label: 'text-onMissed' },
  cancelled: { box: 'bg-cancelled', label: 'text-onCancelled' },
};

export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const { t } = useTranslation();
  const { box, label } = statusStyles[status];
  return (
    <View
      style={{ minHeight: sizes.touch }}
      className={`flex-row items-center gap-2 rounded-full px-4 ${box}`}
    >
      <Text aria-hidden className={`font-heavy text-md ${label}`}>
        {statusSymbol[status]}
      </Text>
      <Text className={`font-body text-md ${label}`}>{t(`status.${status}`)}</Text>
    </View>
  );
}
