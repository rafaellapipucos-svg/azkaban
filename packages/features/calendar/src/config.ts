import type { CalendarView, WeekStart } from '@azkaban/core';

/** Tunables of this module (PROMPT_MESTRE 5.1: each module has its own config). */
export const calendarConfig = {
  /** Sunday, as on the printed calendars the family and the employer know. 1 would be Monday. */
  weekStartsOn: 0 as WeekStart,
  defaultView: 'month' as CalendarView,
} as const;

/** What the route can hand the screen, such as the team view opening a member's week. */
export type CalendarInitial = {
  view?: CalendarView;
  /** `yyyy-MM-dd` */
  date?: string;
  scope?: 'mine' | 'member' | 'team';
  groupId?: string;
  memberId?: string;
};
