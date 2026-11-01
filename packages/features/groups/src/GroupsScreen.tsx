import { inviteCodeSchema } from '@azkaban/contracts';
import { groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  Card,
  EmptyState,
  FormTextField,
  Muted,
  Screen,
  Subtitle,
  Title,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const joinSchema = z.object({ code: inviteCodeSchema });

export function GroupsScreen() {
  const { t } = useTranslation('groups');
  const router = useRouter();
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsRepository.listMine });
  const { control, handleSubmit } = useForm<
    z.input<typeof joinSchema>,
    unknown,
    z.output<typeof joinSchema>
  >({
    resolver: zodResolver(joinSchema),
    defaultValues: { code: '' },
  });

  return (
    <Screen>
      <Title>{t('list.title')}</Title>
      {groups.data?.length === 0 ? <EmptyState text={t('list.empty')} /> : null}
      {groups.data?.map((group) => (
        <Card key={group.id} onPress={() => router.push(`/groups/${group.id}`)}>
          <Subtitle>{group.name}</Subtitle>
          <Muted>
            {t(`types.${group.type}`)} · {t(`roles.${group.role}`)}
          </Muted>
        </Card>
      ))}
      <Button label={t('list.new')} onPress={() => router.push('/groups/new')} />
      <Body>{t('list.join')}</Body>
      <FormTextField
        control={control}
        name="code"
        label={t('list.codeLabel')}
        errorText={t('list.codeInvalid')}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button
        variant="secondary"
        label={t('list.join')}
        onPress={handleSubmit(({ code }) => router.push(`/join/${code}`))}
      />
    </Screen>
  );
}
