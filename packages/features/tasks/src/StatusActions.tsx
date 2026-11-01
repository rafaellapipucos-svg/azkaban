import type { OccurrenceListItem, OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { Body, Button, Muted, tokens } from '@azkaban/ui';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Transition } from './hooks';

// Same order the buttons appear in: the common outcome first, the undo last.
const ORDER: OccurrenceStatus[] = ['done', 'partial', 'missed', 'pending', 'cancelled'];

type Props = {
  item: OccurrenceListItem;
  available: readonly Transition[];
  onChange: (to: OccurrenceStatus, reason?: string) => void;
  /** The row panel leaves cancelling to the detail screen, where it is explained. */
  showCancel?: boolean;
};

/**
 * One button per change the user may make now. The list comes from `availableTransitions`, so a
 * button that would be refused is not drawn; the database still has the last word.
 */
export function StatusActions({ item, available, onChange, showCancel = true }: Props) {
  const { t } = useTranslation('tasks');
  const [asking, setAsking] = useState<OccurrenceStatus | null>(null);
  const [reason, setReason] = useState('');
  const options = ORDER.flatMap((to) => available.filter((entry) => entry.to === to)).filter(
    ({ to }) => showCancel || to !== 'cancelled',
  );

  if (asking) {
    return (
      <View style={{ gap: tokens.spacing[3] }}>
        <Body>{t('actions.reasonLabel')}</Body>
        <TextInput
          aria-label={t('actions.reasonLabel')}
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          autoFocus
          placeholder={t('actions.reasonPlaceholder')}
          placeholderTextColor={tokens.colors.muted}
          className="min-h-12 rounded-md border-2 border-border bg-surface px-4 font-body text-md text-text dark:border-border-dark dark:bg-surface-dark dark:text-text-dark"
        />
        <Button
          label={t('actions.confirm')}
          disabled={reason.trim().length === 0}
          onPress={() => {
            onChange(asking, reason);
            setAsking(null);
            setReason('');
          }}
        />
        <Button variant="secondary" label={t('actions.back')} onPress={() => setAsking(null)} />
      </View>
    );
  }

  if (options.length === 0) return <Muted>{t('actions.none')}</Muted>;

  return (
    <View style={{ gap: tokens.spacing[2] }}>
      {options.map(({ to, requiresReason, late }) => (
        <View key={to} style={{ gap: tokens.spacing[1] }}>
          <Button
            variant={to === 'done' ? 'primary' : 'secondary'}
            label={t(
              item.status === 'cancelled' && to === 'pending' ? 'actions.restore' : `actions.${to}`,
            )}
            onPress={() => (requiresReason ? setAsking(to) : onChange(to))}
          />
          {late && to === 'done' ? (
            <Muted className="text-sm">{t('actions.lateHint')}</Muted>
          ) : null}
        </View>
      ))}
    </View>
  );
}
