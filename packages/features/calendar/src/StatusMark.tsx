import type { CalendarStatus } from '@azkaban/core';
import { tokens } from '@azkaban/ui';
import { Text, View } from 'react-native';

// Same symbols and colors as TaskCheck. The symbol is what tells them apart for people who do not
// see the colors: green is a check, yellow a tilde, red a cross, pending a dot.
const looks: Record<CalendarStatus, { symbol: string; box: string; symbolStyle: string }> = {
  pending: {
    symbol: '•',
    box: 'border-muted bg-surface dark:border-muted-dark dark:bg-surface-dark',
    symbolStyle: 'text-muted dark:text-muted-dark',
  },
  done: { symbol: '✓', box: 'border-done bg-done', symbolStyle: 'text-onDone' },
  partial: { symbol: '~', box: 'border-partial bg-partial', symbolStyle: 'text-onPartial' },
  missed: { symbol: '✗', box: 'border-missed bg-missed', symbolStyle: 'text-onMissed' },
};

/**
 * A round status marker. Decorative: the row or cell that holds it names the status in words.
 * `dot` is small enough for a month cell, `row` for a list.
 */
export function StatusMark({ status, size }: { status: CalendarStatus; size: 'dot' | 'row' }) {
  const { symbol, box, symbolStyle } = looks[status];
  const dot = size === 'dot';
  const side = dot ? tokens.spacing[4] : tokens.spacing[6];
  return (
    <View
      aria-hidden
      style={{ width: side, height: side }}
      className={`items-center justify-center rounded-full ${dot ? 'border' : 'border-2'} ${box}`}
    >
      <Text
        style={{ lineHeight: dot ? tokens.fontSize.sm : side - tokens.spacing[1] }}
        className={`font-heavy ${size === 'dot' ? 'text-sm' : 'text-md'} ${symbolStyle}`}
      >
        {symbol}
      </Text>
    </View>
  );
}
