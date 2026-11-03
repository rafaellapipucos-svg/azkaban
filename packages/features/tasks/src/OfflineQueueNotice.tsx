import { offlineDefaults } from '@azkaban/config';
import {
  dismissOfflineDiscard,
  occurrenceStatusAction,
  useOfflineDiscards,
  useOfflinePendingCount,
} from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { useOnline } from '@azkaban/platform';
import { Button, ErrorText, Muted, tokens } from '@azkaban/ui';
import { View } from 'react-native';
import { errorKey } from './format';

const statusKey = occurrenceStatusAction.mutationKey[0];

/**
 * The quiet line of the offline queue (ADR-0012, section 5): no connection and how many changes will
 * be sent, and each status change the queue dropped, with the reason, until closed.
 */
// ponytail: built from the base texts; swap for the design-system notice once it exists.
export function OfflineQueueNotice() {
  const { t } = useTranslation('tasks');
  const online = useOnline();
  const pending = useOfflinePendingCount();
  const discards = useOfflineDiscards(statusKey);
  if (online && discards.length === 0) return null;
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      {online ? null : (
        <Muted role="status">
          {pending > 0 ? t('offline.pending', { count: pending }) : t('offline.none')}
        </Muted>
      )}
      {discards.map(({ id, reason }) => (
        <View key={id} style={{ gap: tokens.spacing[1] }}>
          <ErrorText>
            {t('offline.discarded', {
              reason: t(errorKey(reason), { hours: offlineDefaults.maxAgeHours }),
            })}
          </ErrorText>
          <Button
            variant="secondary"
            label={t('offline.dismiss')}
            onPress={() => dismissOfflineDiscard(id)}
          />
        </View>
      ))}
    </View>
  );
}
