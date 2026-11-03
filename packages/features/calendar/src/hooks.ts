import { taskDefaults } from '@azkaban/config';
import { dayRange, materializationNeed } from '@azkaban/core';
import { tasksRepository } from '@azkaban/data';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** A clock that ticks every minute, so "today" follows the real day. */
export function useNow(intervalMs = MINUTE_MS) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Whose occurrences a view shows. The database decides what of it is visible (RLS). */
export type Scope =
  | { kind: 'mine' }
  | { kind: 'member'; groupId: string; memberId: string }
  | { kind: 'team'; groupId: string };

const scopeKey = (scope: Scope) =>
  scope.kind === 'mine'
    ? 'mine'
    : scope.kind === 'team'
      ? `team:${scope.groupId}`
      : `member:${scope.groupId}:${scope.memberId}`;

/**
 * The occurrences that overlap the days `first` to `last` of the user's calendar. Waits for the
 * profile, because the edges of a day are those of the profile's zone.
 */
export function useCalendarOccurrences({
  scope,
  userId,
  timezone,
  first,
  last,
  enabled,
}: {
  scope: Scope;
  userId: string;
  timezone: string;
  first: string;
  last: string;
  enabled: boolean;
}) {
  const { from, to } = dayRange(timezone, first, last);
  return useQuery({
    queryKey: ['occurrences', 'calendar', scopeKey(scope), from, to],
    queryFn: () =>
      tasksRepository.listCalendar({
        from,
        to,
        ...(scope.kind === 'mine'
          ? { assigneeId: userId }
          : scope.kind === 'member'
            ? { assigneeId: scope.memberId, groupId: scope.groupId, groupOnly: true }
            : { groupId: scope.groupId, groupOnly: true }),
      }),
    enabled: enabled && (scope.kind !== 'mine' || userId !== ''),
  });
}

/**
 * Browsing past the window the daily job keeps asks the Edge Function for more occurrences, once
 * per range, and reloads the calendar if it created any. A failure changes nothing on screen: the
 * calendar shows what exists. `capped` tells the screen the view reaches past what can be asked.
 */
export function useMaterializeAhead({
  last,
  timezone,
  now,
  enabled,
}: {
  last: string;
  timezone: string;
  now: Date;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const need = materializationNeed({
    lastDate: last,
    timezone,
    now,
    windowDays: taskDefaults.materializationWindowDays,
    maxDays: taskDefaults.onDemandMaxDays,
  });
  useQuery({
    queryKey: ['materialize', need.until],
    queryFn: async () => {
      const inserted = await tasksRepository.materializeUntil(need.until!);
      if (inserted > 0) await queryClient.invalidateQueries({ queryKey: ['occurrences'] });
      return inserted;
    },
    enabled: enabled && need.until !== null,
    staleTime: Infinity,
    retry: false,
  });
  return need;
}
