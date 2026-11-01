import type { OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { motion, sizes } from './tokens';
import { useReducedMotion } from './useReducedMotion';

// Same symbols as StatusBadge. Never color alone: symbol here, spoken label on the control.
const looks: Record<OccurrenceStatus, { symbol: string; box: string; symbolStyle: string }> = {
  pending: {
    symbol: '•',
    box: 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark',
    symbolStyle: 'text-muted dark:text-muted-dark',
  },
  done: { symbol: '✓', box: 'border-doneEdge bg-done', symbolStyle: 'text-onDone' },
  partial: { symbol: '~', box: 'border-partialEdge bg-partial', symbolStyle: 'text-onPartial' },
  missed: { symbol: '✗', box: 'border-dangerEdge bg-missed', symbolStyle: 'text-onMissed' },
  cancelled: {
    symbol: '–',
    box: 'border-cancelledEdge bg-cancelled',
    symbolStyle: 'text-onCancelled',
  },
};

type Props = {
  status: OccurrenceStatus;
  /** `done` after the deadline (`Occurrence.late`). Adds a corner mark and its own spoken label. */
  late?: boolean;
  /** The task's name, so the spoken label says which task this control belongs to. */
  title: string;
  onPress?: () => void;
  /** For the less common outcomes (tried, not done, cancel). */
  onLongPress?: () => void;
  disabled?: boolean;
};

export function TaskCheck({ status, late, title, onPress, onLongPress, disabled }: Props) {
  const { t } = useTranslation('ui');
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(status);
  const isLate = status === 'done' && late === true;
  const { symbol, box, symbolStyle } = looks[status];

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

  const statusText = isLate ? t('taskCheck.doneLate') : t(`status.${status}`);
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
        style={{ width: sizes.check, height: sizes.check }}
        className={`items-center justify-center rounded-full border-2 border-b-4 active:translate-y-0.5 active:border-b-2 ${box} ${disabled ? 'opacity-60' : ''}`}
      >
        <Text aria-hidden className={`font-heavy text-lg ${symbolStyle}`}>
          {symbol}
        </Text>
        {isLate ? (
          <View
            aria-hidden
            className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-partial dark:border-surface-dark"
          >
            <Text className="font-heavy text-sm text-onPartial">!</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
