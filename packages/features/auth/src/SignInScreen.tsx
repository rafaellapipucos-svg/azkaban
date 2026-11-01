import { signInSchema, type SignInInput } from '@azkaban/contracts';
import { safeInternalPath } from '@azkaban/core';
import { authRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { createAppLink } from '@azkaban/platform';
import { Body, Button, ErrorText, FormTextField, Mascot, Screen, Title } from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

export function SignInScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeInternalPath(next);
  const { control, handleSubmit, getValues, trigger } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const signIn = useMutation({
    mutationFn: authRepository.signIn,
    onSuccess: () => {
      if (target) router.replace(target as Href);
    },
  });
  const magicLink = useMutation({
    mutationFn: () =>
      authRepository.sendMagicLink({ email: getValues('email') }, createAppLink(target ?? '/')),
  });

  return (
    <Screen>
      <View className="items-center">
        <Mascot mood="happy" />
      </View>
      <Title>{t('signIn.title')}</Title>
      <FormTextField
        control={control}
        name="email"
        label={t('fields.email')}
        errorText={t('validation.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <FormTextField
        control={control}
        name="password"
        label={t('fields.password')}
        errorText={t('validation.password')}
        autoComplete="current-password"
        secureTextEntry
      />
      {signIn.isError ? <ErrorText>{t('signIn.invalid')}</ErrorText> : null}
      <Button
        label={t('signIn.submit')}
        loading={signIn.isPending}
        onPress={handleSubmit((values) => signIn.mutate(values))}
      />
      <Button
        variant="secondary"
        label={t('signIn.magicLink')}
        loading={magicLink.isPending}
        onPress={async () => {
          if (await trigger('email')) magicLink.mutate();
        }}
      />
      {magicLink.isSuccess ? <Body>{t('signIn.magicLinkSent')}</Body> : null}
      {magicLink.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
      <Button
        variant="secondary"
        label={t('signIn.createAccount')}
        onPress={() => router.replace({ pathname: '/sign-up', params: next ? { next } : {} })}
      />
    </Screen>
  );
}
