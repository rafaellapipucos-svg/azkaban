import { can } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { Button } from '@azkaban/ui';
import { useRouter } from 'expo-router';
import { useCurrentUser } from './hooks';

/** The way into the team view, shown on a group's page only to people who can open it. */
export function TeamLink({ groupId }: { groupId: string }) {
  const { t } = useTranslation('tasks');
  const router = useRouter();
  const { user } = useCurrentUser();
  if (!can(user, 'task.view_group', { id: groupId })) return null;
  return (
    <Button
      variant="secondary"
      label={t('team.link')}
      onPress={() => router.push(`/team/${groupId}`)}
    />
  );
}
