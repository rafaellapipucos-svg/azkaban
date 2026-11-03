import { calendarStatuses, type DaySummary } from '@azkaban/core';
import { StatusMark } from '@azkaban/ui';

/**
 * One marker per status a day holds, a symbol and not only a color. A `done` that still waits for
 * an admin has its own marker ("em análise"), next to the plain one when the day has both.
 */
export function DayMarks({ summary }: { summary: DaySummary | undefined }) {
  return calendarStatuses
    .filter((status) => (summary?.[status] ?? 0) > 0)
    .flatMap((status) => {
      if (status !== 'done' || !summary)
        return [<StatusMark key={status} status={status} size="dot" />];
      return [
        ...(summary.done > summary.reviewing
          ? [<StatusMark key="done" status="done" size="dot" />]
          : []),
        ...(summary.reviewing > 0
          ? [<StatusMark key="reviewing" status="done" size="dot" reviewing />]
          : []),
      ];
    });
}
