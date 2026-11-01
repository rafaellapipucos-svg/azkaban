import type { OccurrenceStatus } from '@azkaban/contracts';

/** One glyph per status, shared by StatusBadge, StatusMark and TaskCheck: never color alone. */
export const statusSymbol: Record<OccurrenceStatus, string> = {
  pending: '•',
  done: '✓',
  partial: '~',
  missed: '✗',
  cancelled: '–',
};
