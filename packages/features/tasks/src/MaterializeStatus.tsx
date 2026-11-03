import { useTranslation } from '@azkaban/i18n';
import { Body, Button, tokens } from '@azkaban/ui';
import { useMutationState, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { useEffect } from 'react';
import { materializeKey, readPendingMaterialization, useMaterializeTasks } from './hooks';

/**
 * Saving a repeating task returns at once, and its occurrences are created in the background. This
 * says so while it runs, and when it fails says that too, with a retry: without it the task is
 * simply missing from the lists until the daily job, and the person creates it again.
 */
export function MaterializeStatus() {
  const { t } = useTranslation('tasks');
  const queryClient = useQueryClient();
  const retry = useMaterializeTasks();
  const { mutate } = retry;
  // The page may have been reloaded while a request was running: pick the work up again.
  useEffect(() => {
    readPendingMaterialization().then((ids) => {
      if (ids.length > 0) mutate(ids);
    });
  }, [mutate]);
  const runs = useMutationState({
    filters: { mutationKey: materializeKey },
    select: (mutation) => ({
      status: mutation.state.status,
      taskIds: (mutation.state.variables ?? []) as string[],
    }),
  });
  const running = runs.some(({ status }) => status === 'pending');
  const failedIds = [
    ...new Set(runs.filter(({ status }) => status === 'error').flatMap(({ taskIds }) => taskIds)),
  ];

  if (failedIds.length === 0) {
    return running ? (
      <View role="status" style={{ padding: tokens.spacing[3] }}>
        <Body className="text-center">{t('materialize.running')}</Body>
      </View>
    ) : null;
  }
  return (
    <View
      role="alert"
      style={{ gap: tokens.spacing[2], padding: tokens.spacing[3] }}
      className="border-t-2 border-missed bg-surface dark:bg-surface-dark"
    >
      <Body>{t('materialize.failed')}</Body>
      <Button
        label={t('materialize.retry')}
        loading={running}
        onPress={() => {
          // The failed runs are replaced by the new one, so the alert goes away on success.
          queryClient
            .getMutationCache()
            .findAll({ mutationKey: materializeKey, predicate: (m) => m.state.status === 'error' })
            .forEach((mutation) => queryClient.getMutationCache().remove(mutation));
          retry.mutate(failedIds);
        }}
      />
    </View>
  );
}
