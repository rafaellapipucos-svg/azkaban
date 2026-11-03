import { notificationsRepository, useCurrentUser, type BellItem } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, IconButton, Muted, tokens } from '@azkaban/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSegments } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationsConfig } from './config';
import { syncThisDevice } from './device';
import { bellKey, useItemText, useOpenItem } from './hooks';

/**
 * Mounted once in the signed-in shell. Listens to the bell by Realtime: an insert shows a short
 * notice at the bottom that covers no control, and any change refreshes the count, also across tabs. With
 * a public key, it registers this browser's subscription again on open (ADR-0008, section 9).
 */
export function NotificationToaster({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const { t } = useTranslation('notifications');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<BellItem | null>(null);
  const text = useItemText();
  const open = useOpenItem();
  const insets = useSafeAreaInsets();
  const inTabs = (useSegments() as string[]).includes('(tabs)');

  useEffect(() => {
    if (!user.id) return;
    return notificationsRepository.subscribe(user.id, ({ type, id }) => {
      void queryClient.invalidateQueries({ queryKey: bellKey });
      if (type !== 'insert') return;
      // A row born read (the daily summary, already told by WhatsApp) is listed, not announced.
      notificationsRepository
        .get(id)
        .then((item) => item && !item.readAt && setShown(item))
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

  const content = shown ? text(shown) : null;
  // Down at the bottom, clear of the header ("Voltar", the bell) and, on a tab, of the tab bar and
  // of the lane of the "Nova tarefa" button above it.
  const bottom =
    insets.bottom +
    tokens.spacing[4] +
    (inTabs ? tokens.layout.tabBarHeight + tokens.sizes.fab + tokens.spacing[2] : 0);
  // The live region stays mounted and empty, and only its content changes: a region inserted with
  // its text already in it is often not read by screen readers.
  return (
    <View
      style={{ pointerEvents: 'box-none', position: 'absolute', bottom, left: 0, right: 0 }}
      className="items-center px-4"
    >
      <View
        role="status"
        aria-live="polite"
        testID="notification-toast"
        style={{
          pointerEvents: 'box-none',
          width: '100%',
          maxWidth: tokens.layout.maxContentWidth,
        }}
      >
        {shown && content ? (
          <View
            style={{ gap: tokens.spacing[2] }}
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
              <Body className="font-heavy">{content.title}</Body>
              {content.body ? <Muted>{content.body}</Muted> : null}
            </Pressable>
            <IconButton icon="✕" label={t('toast.dismiss')} onPress={() => setShown(null)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
