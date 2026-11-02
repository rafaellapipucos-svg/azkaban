import type { OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { activateOnSpace } from '@azkaban/platform';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { reviewSymbol, statusSymbol } from './statusSymbol';
import { motion, sizes } from './tokens';
import { useReducedMotion } from './useReducedMotion';

// Same symbols as StatusBadge (statusSymbol, reviewSymbol). Never color alone: symbol here, spoken label on the control.
const looks: Record<OccurrenceStatus, { box: string; symbolStyle: string }> = {
  pending: {
    box: 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
    symbolStyle: 'text-muted dark:text-muted-dark',
  },
  done: { box: 'border-doneEdge bg-done', symbolStyle: 'text-onDone' },
  partial: { box: 'border-partialEdge bg-partial', symbolStyle: 'text-onPartial' },
  missed: { box: 'border-dangerEdge bg-missed', symbolStyle: 'text-onMissed' },
  cancelled: { box: 'border-cancelledEdge bg-cancelled', symbolStyle: 'text-onCancelled' },
};

// Done, waiting for an admin to approve the photo (ADR-0007). Light green with its own glyph.
const reviewLook = {
  box: 'border-reviewEdge bg-review dark:border-reviewEdge-dark dark:bg-review-dark',
  symbolStyle: 'text-onReview dark:text-onReview-dark',
};

type Props = {
  status: OccurrenceStatus;
  /** `done` waiting for an admin (`proofReviewStatus === 'in_review'`). Ignored for other statuses. */
  reviewing?: boolean;
  /** `done` after the deadline (`Occurrence.late`). Adds a corner mark and its own spoken label. */
  late?: boolean;
  /** The task's name, so the spoken label says which task this control belongs to. */
  title: string;
  onPress?: () => void;
  /** For the less common outcomes (tried, not done, cancel). */
  onLongPress?: () => void;
  disabled?: boolean;
};

export function TaskCheck({
  status,
  reviewing,
  late,
  title,
  onPress,
  onLongPress,
  disabled,
}: Props) {
  const { t } = useTranslation('ui');
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(status);
  const isLate = status === 'done' && late === true;
  const inReview = status === 'done' && reviewing === true;
  const { box, symbolStyle } = inReview ? reviewLook : looks[status];

  // A small pop when a task leaves "pending". Skipped for reduced motion and on first render.
  useEffect(() => {
    const changed = previous.current !== status;
    previous.current = status;
    if (!changed || reduced || status === 'pending') return;
    const run = Animated.sequence([
      Animated.timing(scale, { toValue: 1.2, duration: motion.fast, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: false }),
    ]);
    run.start();
    return () => run.stop();
  }, [status, reduced, scale]);

  const statusText = inReview
    ? t(isLate ? 'taskCheck.doneLateInReview' : 'taskCheck.inReview')
    : isLate
      ? t('taskCheck.doneLate')
      : t(`status.${status}`);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        role="checkbox"
        aria-label={t('taskCheck.label', { title, status: statusText })}
        aria-checked={status === 'done' ? true : status === 'partial' ? 'mixed' : false}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        {...activateOnSpace(disabled ? undefined : onPress)}
        style={{ width: sizes.check, height: sizes.check }}
        className={`items-center justify-center rounded-full border-2 border-b-4 active:translate-y-0.5 active:border-b-2 ${box} ${disabled ? 'opacity-60' : ''}`}
      >
        <Text aria-hidden className={`font-heavy text-lg ${symbolStyle}`}>
          {inReview ? reviewSymbol : statusSymbol[status]}
        </Text>
        {isLate ? (
          <View
            aria-hidden
            style={{ width: sizes.cornerBadge, height: sizes.cornerBadge }}
            className="absolute -right-1 -top-1 items-center justify-center rounded-full border-2 border-surface bg-partial dark:border-surface-dark"
          >
            <Text className="font-heavy text-sm text-onPartial">!</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
