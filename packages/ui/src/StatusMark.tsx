import type { OccurrenceStatus } from '@azkaban/contracts';
import { Text, View } from 'react-native';
import { reviewSymbol, statusSymbol } from './statusSymbol';
import { fontSize, sizes, spacing } from './tokens';

// Same colors as TaskCheck. The symbol tells them apart for people who do not see the colors.
const boxes: Record<OccurrenceStatus, { box: string; symbol: string }> = {
  pending: {
    box: 'border-muted bg-surface dark:border-muted-dark dark:bg-surface-dark',
    symbol: 'text-muted dark:text-muted-dark',
  },
  done: { box: 'border-done bg-done', symbol: 'text-onDone' },
  partial: { box: 'border-partial bg-partial', symbol: 'text-onPartial' },
  missed: { box: 'border-missed bg-missed', symbol: 'text-onMissed' },
  cancelled: { box: 'border-cancelled bg-cancelled', symbol: 'text-onCancelled' },
};

const reviewBox = {
  box: 'border-reviewEdge bg-review dark:border-reviewEdge-dark dark:bg-review-dark',
  symbol: 'text-onReview dark:text-onReview-dark',
};

type Props = {
  status: OccurrenceStatus;
  size: 'dot' | 'row';
  /** `done` waiting for an admin (`proofReviewStatus === 'in_review'`). Ignored for other statuses. */
  reviewing?: boolean;
};

/**
 * A round status marker that is not a control. Decorative: the row or cell that holds it names
 * the status in words. `dot` is small enough for a month cell, `row` for a list line.
 */
export function StatusMark({ status, size, reviewing }: Props) {
  const inReview = status === 'done' && reviewing === true;
  const { box, symbol } = inReview ? reviewBox : boxes[status];
  const dot = size === 'dot';
  const side = dot ? sizes.statusDot : sizes.statusRow;
  return (
    <View
      aria-hidden
      style={{ width: side, height: side }}
      className={`items-center justify-center rounded-full ${dot ? 'border' : 'border-2'} ${box}`}
    >
      <Text
        style={{ lineHeight: dot ? fontSize.sm : side - spacing[1] }}
        className={`font-heavy ${dot ? 'text-sm' : 'text-md'} ${symbol}`}
      >
        {inReview ? reviewSymbol : statusSymbol[status]}
      </Text>
    </View>
  );
}
