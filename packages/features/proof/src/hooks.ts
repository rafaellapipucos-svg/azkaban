import { useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

/** The keys of the task screens, which are not imported, and of this module. */
const proofTouches = [
  'occurrences',
  'occurrence',
  'history',
  'proof',
  'proof-current',
  'proof-queue',
];

export function useRefreshProofs() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(proofTouches.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
    [queryClient],
  );
}

/** An instant as the user reads it, in the zone of their profile. */
export function useInstantText() {
  const { i18n } = useTranslation('proof');
  const { timezone } = useCurrentUser();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timezone,
    });
    return (instant: string) => format.format(Date.parse(instant));
  }, [i18n.language, timezone]);
}
