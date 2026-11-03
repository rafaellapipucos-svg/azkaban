import { signUpSchema, type SignUpInput } from '@azkaban/contracts';
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
import { failureKey } from './failureKey';

export function SignUpScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeInternalPath(next);
  const { control, handleSubmit } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const signUp = useMutation({
    mutationFn: (values: SignUpInput) =>
      authRepository.signUp(values, createAppLink(target ?? '/')),
    onSuccess: (signedIn) => {
      if (signedIn && target) router.replace(target as Href);
    },
  });

  return (
    <Screen title={t('signUp.title')}>
      <View className="items-center">
        <Mascot mood="celebrating" />
      </View>
      <Title>{t('signUp.title')}</Title>
      <FormTextField
        control={control}
        name="displayName"
        label={t('fields.name')}
        errorText={t('validation.name')}
        autoComplete="name"
      />
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
        autoComplete="new-password"
        secureTextEntry
      />
      {signUp.isError ? (
        <ErrorText>{t(failureKey(signUp.error, 'errors.generic'))}</ErrorText>
      ) : null}
      {signUp.data === false ? <Body>{t('signUp.confirmEmail')}</Body> : null}
      <Button
        label={t('signUp.submit')}
        loading={signUp.isPending}
        onPress={handleSubmit((values) => signUp.mutate(values))}
      />
      <Button
        variant="secondary"
        label={t('signUp.haveAccount')}
        onPress={() => router.replace({ pathname: '/sign-in', params: next ? { next } : {} })}
      />
    </Screen>
  );
}
