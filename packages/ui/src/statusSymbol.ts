import type { OccurrenceStatus } from '@azkaban/contracts';

/** One glyph per status, shared by StatusBadge, StatusMark and TaskCheck: never color alone. */
export const statusSymbol: Record<OccurrenceStatus, string> = {
  pending: '•',
  done: '✓',
  partial: '~',
  missed: '✗',
  cancelled: '–',
};

/**
 * `done` with `proofReviewStatus = 'in_review'` ("em análise", ADR-0007). A different glyph from
 * `done`'s ✓, so it reads without color. It is a sub-state, not a status: it counts as done.
 */
export const reviewSymbol = '◔';
