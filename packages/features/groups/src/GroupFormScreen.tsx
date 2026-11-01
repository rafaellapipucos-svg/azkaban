import { groupInputSchema, type GroupInput } from '@azkaban/contracts';
import { groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Button, Chip, ChipRow, ErrorText, FormTextField, Muted, Screen, Title } from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useController, useForm } from 'react-hook-form';

export function GroupFormScreen() {
  const { t } = useTranslation('groups');
  const router = useRouter();
  const queryClient = useQueryClient();
  const types = useQuery({ queryKey: ['group-types'], queryFn: groupsRepository.listTypes });
  const { control, handleSubmit } = useForm<GroupInput>({
    resolver: zodResolver(groupInputSchema),
    defaultValues: { name: '', type: 'family' },
  });
  const { field: type } = useController({ control, name: 'type' });
  const create = useMutation({
    mutationFn: groupsRepository.create,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace(`/groups/${id}`);
    },
  });

  return (
    <Screen>
      <Title>{t('form.title')}</Title>
      <FormTextField
        control={control}
        name="name"
        label={t('form.name')}
        errorText={t('form.nameInvalid')}
      />
      <Muted>{t('form.type')}</Muted>
      <ChipRow label={t('form.type')}>
        {types.data?.map((key) => (
          <Chip
            key={key}
            label={t(`types.${key}`)}
            selected={type.value === key}
            onPress={() => type.onChange(key)}
          />
        ))}
      </ChipRow>
      {create.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
      <Button
        label={t('form.submit')}
        loading={create.isPending}
        onPress={handleSubmit((values) => create.mutate(values))}
      />
    </Screen>
  );
}
