import type { OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { Text, View } from 'react-native';
import { reviewSymbol, statusSymbol } from './statusSymbol';
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

// The border keeps the light fill visible on a light card (the fill alone is 1.3:1).
const reviewStyle = {
  box: 'border-2 border-reviewEdge bg-review dark:border-reviewEdge-dark dark:bg-review-dark',
  label: 'text-onReview dark:text-onReview-dark',
};

type Props = {
  status: OccurrenceStatus;
  /** `done` waiting for an admin (`proofReviewStatus === 'in_review'`). Ignored for other statuses. */
  reviewing?: boolean;
};

export function StatusBadge({ status, reviewing }: Props) {
  const { t } = useTranslation('ui');
  const inReview = status === 'done' && reviewing === true;
  const { box, label } = inReview ? reviewStyle : statusStyles[status];
  return (
    <View
      style={{ minHeight: sizes.touch }}
      className={`flex-row items-center gap-2 rounded-full px-4 ${box}`}
    >
      <Text aria-hidden className={`font-heavy text-md ${label}`}>
        {inReview ? reviewSymbol : statusSymbol[status]}
      </Text>
      <Text className={`font-body text-md ${label}`}>
        {inReview ? t('proofReview.inReview') : t(`status.${status}`)}
      </Text>
    </View>
  );
}
