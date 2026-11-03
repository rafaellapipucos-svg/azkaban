import { profileUpdateSchema, type ProfileUpdateInput } from '@azkaban/contracts';
import { authRepository, profilesRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { deviceTimezone } from '@azkaban/platform';
import { Body, Button, ErrorText, FormTextField, Mascot, Screen, Title } from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

/** `children` are extra entries the app puts above the sign-out button, such as the groups link. */
export function ProfileScreen({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('auth');
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: profilesRepository.getMine });
  const { control, handleSubmit, setValue } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    values: profile.data && {
      displayName: profile.data.displayName,
      timezone: profile.data.timezone,
    },
  });
  const save = useMutation({
    mutationFn: profilesRepository.updateMine,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });
  const signOut = useMutation({
    mutationFn: authRepository.signOut,
    onSuccess: () => queryClient.clear(),
  });

  return (
    <Screen>
      <View className="items-center">
        <Mascot mood="happy" />
      </View>
      <Title>{t('profile.title')}</Title>
      <FormTextField
        control={control}
        name="displayName"
        label={t('fields.name')}
        errorText={t('validation.name')}
      />
      <FormTextField
        control={control}
        name="timezone"
        label={t('fields.timezone')}
        errorText={t('validation.timezone')}
        autoCapitalize="none"
      />
      <Button
        variant="secondary"
        label={t('profile.useDeviceTimezone')}
        onPress={() => setValue('timezone', deviceTimezone(), { shouldValidate: true })}
      />
      {save.isSuccess ? <Body>{t('profile.saved')}</Body> : null}
      {save.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
      <Button
        label={t('actions.save')}
        loading={save.isPending}
        onPress={handleSubmit((values) => save.mutate(values))}
      />
      {children}
      <Button
        variant="secondary"
        label={t('profile.signOut')}
        loading={signOut.isPending}
        onPress={() => signOut.mutate()}
      />
    </Screen>
  );
}
