import { whatsappRules } from '@azkaban/config';
import {
  dailySummaryPreferencesSchema,
  type DailySummaryPreferences,
  type WhatsAppStatus,
} from '@azkaban/contracts';
import { normalizePhone } from '@azkaban/core';
import { notificationsRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  ConfirmButton,
  ErrorText,
  FormTextField,
  Muted,
  Stepper,
  Subtitle,
  SwitchRow,
  TimeField,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useReducer, useState } from 'react';
import { useController, useForm, type Control } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import {
  phoneFormSchema,
  secondsUntil,
  waitParts,
  whatsappErrorKey,
  whatsappStep,
  type PhoneForm,
} from './whatsappFlow';

const whatsappKey = ['whatsapp'];
const { consentVersion } = whatsappRules;
const { codeLength } = whatsappRules.verification;
/** The notice the user accepts is the one of the version sent to `whatsapp_opt_in`. */
const consent = `whatsapp.consent.v${consentVersion}`;

const codeFormSchema = z.object({ code: z.string().regex(new RegExp(`^\\d{${codeLength}}$`)) });
type CodeForm = z.infer<typeof codeFormSchema>;

/** Seconds left until `instant`, ticking once a second while there is something to wait. */
function useSecondsUntil(instant: string | null) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const left = secondsUntil(instant, Date.now());
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(tick, 1000);
    return () => clearTimeout(id);
  });
  return left;
}

function useWaitText() {
  const { t } = useTranslation('notifications');
  return (seconds: number) => {
    const { unit, count } = waitParts(seconds);
    return t('whatsapp.retryIn', { wait: t(`whatsapp.wait.${unit}`, { count }) });
  };
}

/**
 * The WhatsApp part of `/settings/notifications` (ADR-0009): the number, the code sent by WhatsApp,
 * the notice and the opt-in, then the daily summary, turning it off and removing the number.
 */
export function WhatsAppSection() {
  const { t } = useTranslation('notifications');
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: whatsappKey, queryFn: notificationsRepository.getWhatsApp });
  // The number the last code went to, while its screen is up. Lost on reload: the person asks again.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // When another code may be asked for: `resendAt`, or now plus `retryAfterSeconds` of a refusal.
  const [waitUntil, setWaitUntil] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: whatsappKey });

  const request = useMutation({
    mutationFn: notificationsRepository.requestPhoneCode,
    onSuccess: (result, phone) => {
      if ('error' in result) {
        if (result.retryAfterSeconds !== undefined)
          setWaitUntil(new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString());
        return;
      }
      setWaitUntil(result.resendAt);
      setSentTo(phone);
    },
  });
  const requestError = request.isError
    ? whatsappErrorKey(request.error)
    : request.data && 'error' in request.data
      ? whatsappErrorKey(request.data.error)
      : null;

  const step = state.data ? whatsappStep(state.data.status, sentTo !== null, consentVersion) : null;

  return (
    <View className="gap-2">
      <Subtitle>{t('channels.whatsapp')}</Subtitle>
      <Muted>{t('whatsapp.intro')}</Muted>
      {state.isError ? <ErrorText>{t('preferences.load')}</ErrorText> : null}
      {step === 'phone' ? (
        <PhoneStep
          sending={request.isPending}
          errorKey={requestError}
          waitUntil={waitUntil}
          onSend={(phone) => request.mutate(phone)}
        />
      ) : null}
      {step === 'code' && sentTo ? (
        <CodeStep
          phone={sentTo}
          sending={request.isPending}
          requestErrorKey={requestError}
          waitUntil={waitUntil}
          onResend={() => request.mutate(sentTo)}
          onChangeNumber={() => {
            request.reset();
            setSentTo(null);
          }}
          onConfirmed={async () => {
            await refresh();
            setSentTo(null);
          }}
        />
      ) : null}
      {step === 'consent' && state.data ? (
        <ConsentStep status={state.data.status} onDone={refresh} />
      ) : null}
      {step === 'on' && state.data ? (
        <OnStep status={state.data.status} summary={state.data.summary} onDone={refresh} />
      ) : null}
    </View>
  );
}

function PhoneStep({
  sending,
  errorKey,
  waitUntil,
  onSend,
}: {
  sending: boolean;
  errorKey: string | null;
  waitUntil: string | null;
  onSend: (phone: string) => void;
}) {
  const { t } = useTranslation('notifications');
  const waitText = useWaitText();
  const wait = useSecondsUntil(waitUntil);
  const { control, handleSubmit } = useForm<PhoneForm>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { country: '55', number: '' },
  });
  return (
    <>
      <Body className="font-heavy">{t('whatsapp.phone.title')}</Body>
      <FormTextField
        control={control}
        name="country"
        label={t('whatsapp.phone.country')}
        // ponytail: one text for a malformed and a refused country while only Brazil is allowed.
        errorText={t('whatsapp.errors.phone_country_not_allowed')}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={3}
      />
      <FormTextField
        control={control}
        name="number"
        label={t('whatsapp.phone.label')}
        errorText={t('whatsapp.phone.invalid')}
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel-national"
      />
      <Button
        label={t('whatsapp.phone.send')}
        loading={sending}
        disabled={wait > 0}
        onPress={handleSubmit(({ number, country }) => {
          const phone = normalizePhone(number, country);
          if (phone) onSend(phone);
        })}
      />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {wait > 0 ? <Muted role="status">{waitText(wait)}</Muted> : null}
    </>
  );
}

function CodeStep({
  phone,
  sending,
  requestErrorKey,
  waitUntil,
  onResend,
  onChangeNumber,
  onConfirmed,
}: {
  phone: string;
  sending: boolean;
  requestErrorKey: string | null;
  waitUntil: string | null;
  onResend: () => void;
  onChangeNumber: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const { t } = useTranslation('notifications');
  const waitText = useWaitText();
  const wait = useSecondsUntil(waitUntil);
  const { control, handleSubmit, reset } = useForm<CodeForm>({
    resolver: zodResolver(codeFormSchema),
    defaultValues: { code: '' },
  });
  const confirm = useMutation({
    mutationFn: notificationsRepository.confirmPhoneCode,
    onSuccess: async (result) => {
      if (!('error' in result)) await onConfirmed();
    },
  });
  const confirmError = confirm.isError
    ? whatsappErrorKey(confirm.error)
    : confirm.data && 'error' in confirm.data
      ? whatsappErrorKey(confirm.data.error)
      : null;

  return (
    <>
      <Body className="font-heavy">{t('whatsapp.code.title')}</Body>
      <Muted>{t('whatsapp.code.hint', { phone })}</Muted>
      <FormTextField
        control={control}
        name="code"
        label={t('whatsapp.code.label', { count: codeLength })}
        errorText={t('whatsapp.code.invalid', { count: codeLength })}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={codeLength}
      />
      <Button
        label={t('whatsapp.code.confirm')}
        loading={confirm.isPending}
        onPress={handleSubmit(({ code }) => confirm.mutate(code))}
      />
      {confirmError ? <ErrorText>{t(confirmError)}</ErrorText> : null}
      <Button
        variant="secondary"
        label={t('whatsapp.code.resend')}
        loading={sending}
        disabled={wait > 0}
        onPress={() => {
          confirm.reset();
          reset();
          onResend();
        }}
      />
      {requestErrorKey ? <ErrorText>{t(requestErrorKey)}</ErrorText> : null}
      {wait > 0 ? <Muted role="status">{waitText(wait)}</Muted> : null}
      <Button variant="secondary" label={t('whatsapp.code.change')} onPress={onChangeNumber} />
    </>
  );
}

function RemovePhone({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useTranslation('notifications');
  const remove = useMutation({
    mutationFn: notificationsRepository.removePhone,
    onSuccess: onDone,
  });
  return (
    <>
      <ConfirmButton
        label={t('whatsapp.status.remove')}
        confirmLabel={t('whatsapp.status.removeConfirm')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      {remove.isError ? <ErrorText>{t(whatsappErrorKey(remove.error))}</ErrorText> : null}
    </>
  );
}

function ConsentStep({ status, onDone }: { status: WhatsAppStatus; onDone: () => Promise<void> }) {
  const { t } = useTranslation('notifications');
  const optIn = useMutation({
    mutationFn: () => notificationsRepository.whatsappOptIn(consentVersion),
    onSuccess: onDone,
  });
  return (
    <>
      {status.optOutAt ? <Body>{t('whatsapp.status.off')}</Body> : null}
      <View className="gap-2 rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark">
        <Body className="font-heavy">{t(`${consent}.title`)}</Body>
        <Body>{t(`${consent}.sender`, { phone: status.phoneE164 })}</Body>
        <Body>{t(`${consent}.what`)}</Body>
        <Body>{t(`${consent}.meta`)}</Body>
        <Body>{t(`${consent}.cost`)}</Body>
        <Body>{t(`${consent}.stop`)}</Body>
        <Body>{t(`${consent}.phone`)}</Body>
        <Button
          label={t(`${consent}.accept`)}
          loading={optIn.isPending}
          onPress={() => optIn.mutate()}
        />
        {optIn.isError ? <ErrorText>{t(whatsappErrorKey(optIn.error))}</ErrorText> : null}
      </View>
      <RemovePhone onDone={onDone} />
    </>
  );
}

function OnStep({
  status,
  summary,
  onDone,
}: {
  status: WhatsAppStatus;
  summary: DailySummaryPreferences;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation('notifications');
  const optOut = useMutation({
    mutationFn: notificationsRepository.whatsappOptOut,
    onSuccess: onDone,
  });
  return (
    <>
      <Body role="status">{t('whatsapp.status.on', { phone: status.phoneE164 })}</Body>
      <DailySummaryForm summary={summary} onDone={onDone} />
      <Button
        variant="secondary"
        label={t('whatsapp.status.turnOff')}
        loading={optOut.isPending}
        onPress={() => optOut.mutate()}
      />
      {optOut.isError ? <ErrorText>{t(whatsappErrorKey(optOut.error))}</ErrorText> : null}
      <RemovePhone onDone={onDone} />
    </>
  );
}

type SwitchName = 'enabled' | 'includeOverdue' | 'skipEmpty';

function FormSwitch({
  control,
  name,
  label,
}: {
  control: Control<DailySummaryPreferences>;
  name: SwitchName;
  label: string;
}) {
  const { field } = useController({ control, name });
  return <SwitchRow label={label} value={field.value} onValueChange={field.onChange} />;
}

function DailySummaryForm({
  summary,
  onDone,
}: {
  summary: DailySummaryPreferences;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation('notifications');
  const { timezone } = useCurrentUser();
  const save = useMutation({
    mutationFn: notificationsRepository.setDailySummary,
    onSuccess: onDone,
  });
  const { control, handleSubmit } = useForm<DailySummaryPreferences>({
    resolver: zodResolver(dailySummaryPreferencesSchema),
    values: summary,
  });
  const { field: days } = useController({ control, name: 'deadlineDays' });

  return (
    <View className="gap-2">
      <Subtitle>{t('whatsapp.dailySummary.title')}</Subtitle>
      <FormSwitch control={control} name="enabled" label={t('whatsapp.dailySummary.enabled')} />
      <Muted>{t('preferences.quietHours.timezone', { timezone })}</Muted>
      <TimeField
        control={control}
        name="time"
        label={t('whatsapp.dailySummary.time')}
        errorText={t('preferences.quietHours.time')}
      />
      <FormSwitch
        control={control}
        name="includeOverdue"
        label={t('whatsapp.dailySummary.includeOverdue')}
      />
      <Body>{t('whatsapp.dailySummary.deadlineDays')}</Body>
      <Stepper
        label={t('whatsapp.dailySummary.deadlineDays')}
        value={days.value}
        onChange={days.onChange}
        min={0}
        max={whatsappRules.dailySummary.maxDeadlineDays}
        format={(count) => t('whatsapp.dailySummary.days', { count })}
      />
      <FormSwitch control={control} name="skipEmpty" label={t('whatsapp.dailySummary.skipEmpty')} />
      <Button
        label={t('whatsapp.dailySummary.save')}
        loading={save.isPending}
        onPress={handleSubmit((values) => save.mutate(values))}
      />
      {save.isSuccess ? <Body role="status">{t('whatsapp.dailySummary.saved')}</Body> : null}
      {save.isError ? <ErrorText>{t('preferences.saveFailed')}</ErrorText> : null}
    </View>
  );
}
