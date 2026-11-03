import { privacyDefaults, proofRules, rateLimitRules } from '@azkaban/config';
import {
  authRepository,
  discardOfflineQueue,
  PrivacyError,
  privacyRepository,
  retryWait,
} from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { canSaveTextFile, createAppLink, saveTextFile } from '@azkaban/platform';
import {
  Body,
  Button,
  Card,
  ConfirmButton,
  ErrorText,
  Input,
  Muted,
  Screen,
  Subtitle,
  Title,
} from '@azkaban/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSession } from './useSession';

type T = ReturnType<typeof useTranslation>['t'];

const shownCodes = ['export_failed', 'delete_failed', 'owns_groups', 'network'] as const;

/** The text of a failed export or deletion, with the wait of `rate_limited`. */
function errorText(t: T, error: unknown): string {
  if (!(error instanceof PrivacyError)) return t('errors.generic');
  if (error.code === 'rate_limited') {
    const { unit, count } = retryWait(error.details.retryAfterSeconds);
    return t(`privacy.errors.rate_limited_${unit}`, { count });
  }
  return (shownCodes as readonly string[]).includes(error.code)
    ? t(`privacy.errors.${error.code}`)
    : t('errors.generic');
}

const consentKey = ['privacy', 'proofConsent'];
const previewKey = ['privacy', 'deletionPreview'];

/**
 * "Privacidade" (ADR-0012, section 6): export, the photo proof acceptance with revoking, the
 * settings shortcuts the route passes as `children`, the transparency text and deleting the account.
 */
export function PrivacyScreen({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('auth');
  const router = useRouter();
  return (
    <Screen title={t('privacy.title')}>
      <Title>{t('privacy.title')}</Title>
      <Body>{t('privacy.intro')}</Body>
      <ExportSection />
      <ConsentSection />
      <Card>
        <Subtitle>{t('privacy.settings.title')}</Subtitle>
        <Body>{t('privacy.settings.description')}</Body>
        {children}
        <Body>{t('privacy.settings.location')}</Body>
      </Card>
      <Button
        variant="secondary"
        label={t('privacy.transparency')}
        onPress={() => router.push('/transparency')}
      />
      <Muted>{t('privacy.policyPending')}</Muted>
      <DeleteSection />
    </Screen>
  );
}

function ExportSection() {
  const { t } = useTranslation('auth');
  const exportData = useMutation({
    mutationFn: async () => {
      const { fileName, text } = await privacyRepository.exportData();
      await saveTextFile(fileName, text);
      return fileName;
    },
  });
  return (
    <Card>
      <Subtitle>{t('privacy.export.title')}</Subtitle>
      <Body>
        {t('privacy.export.description', {
          minutes: Math.round(privacyDefaults.exportPhotoUrlTtlSeconds / 60),
        })}
      </Body>
      <Muted>
        {t('privacy.export.limit', { count: rateLimitRules.actions.data_export.limit })}
      </Muted>
      {canSaveTextFile ? (
        <Button
          label={t('privacy.export.action')}
          loading={exportData.isPending}
          onPress={() => exportData.mutate()}
        />
      ) : (
        <Body>{t('privacy.export.unsupported')}</Body>
      )}
      {exportData.isSuccess ? (
        <Body role="status">{t('privacy.export.saved', { fileName: exportData.data })}</Body>
      ) : null}
      {exportData.isError ? <ErrorText>{errorText(t, exportData.error)}</ErrorText> : null}
    </Card>
  );
}

function ConsentSection() {
  const { t, i18n } = useTranslation('auth');
  const queryClient = useQueryClient();
  const consent = useQuery({ queryKey: consentKey, queryFn: privacyRepository.proofConsent });
  const revoke = useMutation({
    mutationFn: privacyRepository.revokeProofConsent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consentKey }),
  });
  if (!consent.isSuccess) return null;
  return (
    <Card>
      <Subtitle>{t('privacy.consent.title')}</Subtitle>
      {consent.data ? (
        <>
          <Body>
            {t('privacy.consent.accepted', {
              date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
                new Date(consent.data.acceptedAt),
              ),
            })}
          </Body>
          <Muted>{t('privacy.consent.effect', { days: proofRules.retentionDays })}</Muted>
          <ConfirmButton
            label={t('privacy.consent.revoke')}
            confirmLabel={t('privacy.consent.revokeConfirm')}
            loading={revoke.isPending}
            onConfirm={() => revoke.mutate()}
          />
        </>
      ) : (
        <Body>{t('privacy.consent.none')}</Body>
      )}
      {revoke.isSuccess ? <Body role="status">{t('privacy.consent.revoked')}</Body> : null}
      {revoke.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
    </Card>
  );
}

function DeleteSection() {
  const { t, i18n } = useTranslation('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: privacyRepository.deletionPreview,
    enabled: open,
    retry: false,
  });

  // Back from a group page (ownership passed, group deleted): the preview may have changed. A closed
  // section has a disabled query, which this leaves alone; a fetch in flight is reused.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: previewKey }, { cancelRefetch: false });
    }, [queryClient]),
  );

  const remove = useMutation({
    mutationFn: privacyRepository.deleteAccount,
    onSuccess: async () => {
      // ADR-0012, sections 3 and 5: nothing of this account may run after it is gone.
      discardOfflineQueue(queryClient);
      // The server already ended every session with the account; this only forgets it here.
      await authRepository.signOut('local').catch(() => undefined);
      queryClient.clear();
    },
    onError: (error) => {
      if (error instanceof PrivacyError && error.details.preview)
        queryClient.setQueryData(previewKey, error.details.preview);
    },
  });
  const email = session?.user.email ?? '';
  const reauth = useMutation({
    mutationFn: () => authRepository.signIn({ email, password }),
    onSuccess: () => {
      setPassword('');
      remove.mutate();
    },
  });
  const magicLink = useMutation({
    mutationFn: () => authRepository.sendMagicLink({ email }, createAppLink('/settings/privacy')),
  });

  const confirmWord = t('privacy.delete.word');
  const confirmed = word.trim().toLocaleUpperCase(i18n.language) === confirmWord;
  const needsReauth =
    remove.error instanceof PrivacyError && remove.error.code === 'reauth_required';
  const close = () => {
    setOpen(false);
    setWord('');
    remove.reset();
  };

  return (
    <Card>
      <Subtitle tone="danger">{t('privacy.delete.title')}</Subtitle>
      <Body>{t('privacy.delete.description')}</Body>
      {!open ? (
        <Button
          variant="secondary"
          label={t('privacy.delete.start')}
          onPress={() => setOpen(true)}
        />
      ) : preview.isError ? (
        <>
          <ErrorText>{errorText(t, preview.error)}</ErrorText>
          <Button
            variant="secondary"
            label={t('privacy.delete.recheck')}
            onPress={() => preview.refetch()}
          />
        </>
      ) : !preview.data ? (
        <Button variant="secondary" label={t('privacy.delete.start')} loading />
      ) : preview.data.blockingGroups.length > 0 ? (
        <>
          <Body>{t('privacy.delete.blocking')}</Body>
          {preview.data.blockingGroups.map((group) => (
            <Card key={group.id}>
              <Body className="font-heavy">{group.name}</Body>
              <Muted>{t('privacy.delete.members', { count: group.memberCount })}</Muted>
              <Button
                variant="secondary"
                label={t('privacy.delete.openGroup', { name: group.name })}
                onPress={() => router.push(`/groups/${group.id}`)}
              />
            </Card>
          ))}
          {remove.isError ? <ErrorText>{errorText(t, remove.error)}</ErrorText> : null}
          <Button
            variant="secondary"
            label={t('privacy.delete.recheck')}
            loading={preview.isFetching}
            onPress={() => {
              remove.reset();
              void preview.refetch();
            }}
          />
        </>
      ) : (
        <>
          {preview.data.soloGroups.length > 0 ? (
            <>
              <Body>{t('privacy.delete.solo')}</Body>
              <View role="list">
                {preview.data.soloGroups.map((group) => (
                  <Body key={group.id} role="listitem" className="font-heavy">
                    {group.name}
                  </Body>
                ))}
              </View>
            </>
          ) : null}
          <Body>{t('privacy.delete.goes')}</Body>
          <Body>{t('privacy.delete.stays')}</Body>
          {needsReauth ? (
            <>
              <Subtitle level={3}>{t('privacy.delete.reauthTitle')}</Subtitle>
              <Body>
                {t('privacy.delete.reauthDescription', {
                  minutes: privacyDefaults.reauthMaxAgeMinutes,
                })}
              </Body>
              <Body>{t('fields.password')}</Body>
              <Input
                aria-label={t('fields.password')}
                value={password}
                onChangeText={setPassword}
                autoComplete="current-password"
                secureTextEntry
              />
              {reauth.isError ? <ErrorText>{t('privacy.delete.reauthInvalid')}</ErrorText> : null}
              <Button
                variant="danger"
                label={t('privacy.delete.reauthSubmit')}
                disabled={!password}
                loading={reauth.isPending || remove.isPending}
                onPress={() => reauth.mutate()}
              />
              <Button
                variant="secondary"
                label={t('privacy.delete.reauthMagicLink')}
                loading={magicLink.isPending}
                onPress={() => magicLink.mutate()}
              />
              {magicLink.isSuccess ? (
                <Body role="status">{t('privacy.delete.reauthMagicLinkSent')}</Body>
              ) : null}
              {magicLink.isError ? <ErrorText>{t('errors.generic')}</ErrorText> : null}
            </>
          ) : (
            <>
              <Body>{t('privacy.delete.wordLabel', { word: confirmWord })}</Body>
              <Input
                aria-label={t('privacy.delete.wordLabel', { word: confirmWord })}
                value={word}
                onChangeText={setWord}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {remove.isError ? <ErrorText>{errorText(t, remove.error)}</ErrorText> : null}
              <Button
                variant="danger"
                label={t('privacy.delete.confirm')}
                disabled={!confirmed}
                loading={remove.isPending}
                onPress={() => remove.mutate()}
              />
            </>
          )}
        </>
      )}
      {open ? <Button variant="secondary" label={t('actions.cancel')} onPress={close} /> : null}
    </Card>
  );
}
