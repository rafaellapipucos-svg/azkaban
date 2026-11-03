import { nameSchema } from '@azkaban/contracts';
import { shoppingRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  ErrorText,
  Input,
  Muted,
  Screen,
  Subtitle,
  Title,
} from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { shoppingKeys } from './hooks';
import { canShop, shoppingErrorKey, shoppingPaths } from './shopping';

/** `/shopping`: the open lists of one scope, personal or a group, and a new list. */
export function ShoppingListsScreen() {
  const { t } = useTranslation('shopping');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, groups } = useCurrentUser();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const lists = useQuery({
    queryKey: shoppingKeys.lists(groupId, 'open'),
    queryFn: () => shoppingRepository.lists(groupId, 'open'),
  });
  const create = useMutation({
    mutationFn: () => shoppingRepository.createList({ groupId, name: nameSchema.parse(name) }),
    onSuccess: async (id) => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      router.push(shoppingPaths.list(id, 'build'));
    },
  });
  const valid = nameSchema.safeParse(name).success;

  return (
    <Screen title={t('lists.title')}>
      <Title>{t('lists.title')}</Title>
      {groups.length > 0 ? (
        <ChipRow label={t('lists.scope')}>
          <Chip
            label={t('lists.personal')}
            selected={groupId === null}
            onPress={() => setGroupId(null)}
          />
          {groups.map((group) => (
            <Chip
              key={group.id}
              label={group.name}
              selected={groupId === group.id}
              onPress={() => setGroupId(group.id)}
            />
          ))}
        </ChipRow>
      ) : null}

      {canShop(user, 'shopping.create_list', groupId) ? (
        <>
          <Input
            aria-label={t('lists.newName')}
            placeholder={t('lists.newPlaceholder')}
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => (valid ? create.mutate() : undefined)}
            returnKeyType="done"
          />
          <Button
            label={t('lists.create')}
            disabled={!valid}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
          {create.isError ? <ErrorText>{t(shoppingErrorKey(create.error))}</ErrorText> : null}
        </>
      ) : null}

      <Subtitle>{t('lists.open')}</Subtitle>
      {lists.isPending ? <Muted role="status">{t('lists.loading')}</Muted> : null}
      {lists.isError ? (
        <>
          <ErrorText>{t('lists.load')}</ErrorText>
          <Button
            variant="secondary"
            label={t('lists.retry')}
            onPress={() => void lists.refetch()}
          />
        </>
      ) : null}
      {lists.data?.length === 0 ? <EmptyState text={t('lists.empty')} mood="sleeping" /> : null}
      {lists.data?.map((list) => (
        <Card key={list.id} onPress={() => router.push(shoppingPaths.list(list.id))}>
          <Body className="font-heavy">{list.name}</Body>
        </Card>
      ))}
      <Button
        variant="secondary"
        label={t('lists.history')}
        onPress={() => router.push(shoppingPaths.history(groupId))}
      />
    </Screen>
  );
}
