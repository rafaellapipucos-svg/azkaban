import { notificationsRepository, useCurrentUser, type BellItem } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, IconButton, Muted, tokens } from '@azkaban/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { notificationsConfig } from './config';
import { syncThisDevice } from './device';
import { bellKey, useItemText, useOpenItem } from './hooks';

/**
 * Mounted once in the signed-in shell. Listens to the bell by Realtime: an insert shows a short
 * notice that does not block the screen, and any change refreshes the count, also across tabs. With
 * a public key, it registers this browser's subscription again on open (ADR-0008, section 9).
 */
export function NotificationToaster({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const { t } = useTranslation('notifications');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<BellItem | null>(null);
  const text = useItemText();
  const open = useOpenItem();

  useEffect(() => {
    if (!user.id) return;
    return notificationsRepository.subscribe(user.id, ({ type, id }) => {
      void queryClient.invalidateQueries({ queryKey: bellKey });
      if (type !== 'insert') return;
      notificationsRepository
        .get(id)
        .then((item) => item && setShown(item))
        .catch(() => undefined);
    });
  }, [user.id, queryClient]);

  useEffect(() => {
    if (user.id && vapidPublicKey) syncThisDevice(user.id, vapidPublicKey).catch(() => undefined);
  }, [user.id, vapidPublicKey]);

  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(null), notificationsConfig.toastMs);
    return () => clearTimeout(id);
  }, [shown]);

  if (!shown) return null;
  const { title, body } = text(shown);
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: tokens.spacing[4], left: 0, right: 0 }}
      className="items-center px-4"
    >
      <View
        role="status"
        aria-live="polite"
        style={{ width: '100%', maxWidth: tokens.layout.maxContentWidth, gap: tokens.spacing[2] }}
        className="flex-row items-center rounded-lg border-2 border-border bg-surface p-3 shadow-md dark:border-border-dark dark:bg-surface-dark"
      >
        <Pressable
          role="button"
          onPress={() => {
            setShown(null);
            open(shown);
          }}
          style={{ minHeight: tokens.sizes.touch }}
          className="flex-1 justify-center active:opacity-70"
        >
          <Body className="font-heavy">{title}</Body>
          {body ? <Muted>{body}</Muted> : null}
        </Pressable>
        <IconButton icon="✕" label={t('toast.dismiss')} onPress={() => setShown(null)} />
      </View>
    </View>
  );
}
