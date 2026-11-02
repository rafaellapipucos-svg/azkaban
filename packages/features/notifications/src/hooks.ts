import { buildPushPayload, notificationUrl, type Translate } from '@azkaban/core';
import { notificationsRepository, useCurrentUser, type BellItem } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

/** Every cache key of this module starts with it, so one invalidation refreshes the bell and the list. */
export const bellKey = ['notifications'] as const;

export function useUnreadCount() {
  return (
    useQuery({ queryKey: [...bellKey, 'unread'], queryFn: notificationsRepository.unreadCount })
      .data ?? 0
  );
}

/**
 * Title and body of a line, the same as the push says, through `buildPushPayload`. A task the user
 * no longer sees gets the generic text.
 */
export function useItemText() {
  const { t } = useTranslation('notifications');
  return useCallback(
    (item: BellItem) => {
      const translate: Translate = (key, values) => t(key, values);
      return buildPushPayload(item, item.requiresPhoto, translate);
    },
    [t],
  );
}

/** Marks the line read and goes where its push would go. */
export function useOpenItem() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    (item: BellItem) => {
      if (!item.readAt) {
        notificationsRepository
          .markRead(item.id)
          .then(() => queryClient.invalidateQueries({ queryKey: bellKey }))
          .catch(() => undefined);
      }
      router.push(notificationUrl(item, item.requiresPhoto));
    },
    [router, queryClient],
  );
}

/** An instant in the zone of the profile, as day, month and time. */
export function useWhenText() {
  const { i18n } = useTranslation('notifications');
  const { timezone } = useCurrentUser();
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
    return (instant: string) => format.format(Date.parse(instant));
  }, [i18n.language, timezone]);
}
