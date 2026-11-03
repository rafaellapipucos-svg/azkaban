import { shoppingRepository, tasksRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { randomId } from '@azkaban/platform';
import { Button, ErrorText, tokens } from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { shoppingKeys } from './hooks';
import { canShop, listForTask, shoppingErrorKey, shoppingPaths } from './shopping';

// The task's page, which is the tasks module's. Features do not import each other.
const taskPath = (occurrenceId: string) => `/tasks/${occurrenceId}`;

/**
 * "Open the task" on a list, only when the reader can see the task. A task RLS hides, a gone one,
 * or a failed read are all no link: no button and never a "not found" (ADR-0011, section 16, SEG7-1).
 */
export function LinkedTaskButton({ taskId }: { taskId: string }) {
  const { t } = useTranslation('shopping');
  const router = useRouter();
  const task = useQuery({
    queryKey: shoppingKeys.linkedTask(taskId),
    queryFn: () => shoppingRepository.linkedTask(taskId),
  });
  if (!task.data) return null;
  const { title, occurrenceId } = task.data;
  return (
    <Button
      variant="secondary"
      label={t('task.open', { title })}
      onPress={() => router.push(taskPath(occurrenceId))}
    />
  );
}

/**
 * On a task's page, composed by the route (ADR-0011, section 8): open the shopping list linked to
 * the task, or make one from it, named after the task. Completing the list never changes the task.
 */
export function TaskShoppingLink({ occurrenceId }: { occurrenceId: string }) {
  const { t } = useTranslation('shopping');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const occurrence = useQuery({
    queryKey: shoppingKeys.occurrence(occurrenceId),
    queryFn: () => tasksRepository.getOccurrence(occurrenceId),
  });
  const task = occurrence.data?.task;
  const lists = useQuery({
    queryKey: shoppingKeys.taskLists(task?.id ?? ''),
    queryFn: () => shoppingRepository.listsForTask(task?.id ?? ''),
    enabled: task !== undefined,
  });
  const target = task ? listForTask(task, t('task.defaultName')) : null;
  const create = useMutation({
    // ponytail: two calls, so a refused link leaves an unlinked list behind; the person sees the
    // error and the list in Compras. One RPC with the link, if that ever happens for real.
    mutationFn: async () => {
      if (!task || !target) return null;
      const id = await shoppingRepository.createList({ id: randomId(), ...target });
      await shoppingRepository.updateList(id, { linkedTaskId: task.id });
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      if (id) router.push(shoppingPaths.list(id, 'build'));
    },
  });

  if (!task || !target || !lists.isSuccess) return null;
  // Open lists come first: the one to shop with.
  const linked = lists.data[0];
  if (!linked && !canShop(user, 'shopping.create_list', target.groupId)) return null;
  return (
    <View className="bg-background dark:bg-background-dark">
      <View
        style={{
          width: '100%',
          maxWidth: tokens.layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: tokens.spacing[4],
          paddingTop: tokens.spacing[4],
          gap: tokens.spacing[2],
        }}
      >
        {linked ? (
          <Button
            variant="secondary"
            label={t('task.openList', { name: linked.name })}
            onPress={() => router.push(shoppingPaths.list(linked.id))}
          />
        ) : (
          <Button
            variant="secondary"
            label={t('task.createList')}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        )}
        {create.isError ? <ErrorText>{t(shoppingErrorKey(create.error))}</ErrorText> : null}
      </View>
    </View>
  );
}
