import { notificationRules } from '@azkaban/config';
import {
  notificationTypeSchema,
  quietHoursSchema,
  type DeliveryChannel,
  type NotificationType,
  type PushDevice,
} from '@azkaban/contracts';
import { deviceLabel } from '@azkaban/core';
import { notificationsRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  ErrorText,
  Muted,
  Screen,
  Subtitle,
  SwitchRow,
  TimeField,
  Title,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { forgetThisDevice, thisDeviceId } from './device';
import { useWhenText } from './hooks';
import { PushSetupCard, thisDeviceQueryKey } from './PushSetupCard';
import { WhatsAppSection } from './WhatsAppSection';

const preferencesKey = ['notification-preferences'];
const quietHoursKey = ['quiet-hours'];
const devicesKey = ['push-devices'];

const quietHoursFormSchema = quietHoursSchema.unwrap();
type QuietHoursForm = { start: string; end: string };

/**
 * `/settings/notifications`: which types ring on the device, the quiet hours, the devices and
 * WhatsApp. WhatsApp shows without a VAPID key too: it does not depend on push.
 */
export function NotificationPreferencesScreen({ vapidPublicKey }: { vapidPublicKey?: string }) {
  const { t } = useTranslation('notifications');
  return (
    <Screen title={t('preferences.title')}>
      <Title>{t('preferences.title')}</Title>
      <Muted>{t('preferences.intro')}</Muted>
      {/* Without the public key there is no push here: nothing to turn on or list. */}
      {vapidPublicKey ? (
        <>
          <PushSetupCard vapidPublicKey={vapidPublicKey} />
          <ChannelSwitches />
        </>
      ) : null}
      <QuietHoursSection />
      {vapidPublicKey ? <DevicesSection /> : null}
      <WhatsAppSection />
    </Screen>
  );
}

/**
 * The push offers every type but the daily summary, which goes only by WhatsApp in this phase
 * (ADR-0009, section 5). WhatsApp has no switches here: its only type, the summary, is turned on and
 * off in `WhatsAppSection`, by `daily_summary_enabled`, so one choice does not live in two places.
 */
// ponytail: only `web_push`. A second WhatsApp type in `whatsappTypes` brings the switches back.
const pushTypes = notificationTypeSchema.options.filter((type) => type !== 'daily_summary');

function ChannelSwitches() {
  const { t } = useTranslation('notifications');
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: preferencesKey,
    queryFn: notificationsRepository.listPreferences,
  });
  const save = useMutation({
    mutationFn: notificationsRepository.setPreference,
    onSettled: () => queryClient.invalidateQueries({ queryKey: preferencesKey }),
  });
  const enabled = (type: NotificationType, channel: DeliveryChannel) => {
    const pending = save.isPending ? save.variables : undefined;
    if (pending?.type === type && pending.channel === channel) return pending.enabled;
    const row = rows.data?.find((r) => r.type === type && r.channel === channel);
    return row?.enabled ?? notificationRules.defaultChannels[type][channel];
  };

  if (rows.isError) return <ErrorText>{t('preferences.load')}</ErrorText>;
  const channel = 'web_push';
  return (
    <View>
      <Subtitle>{t(`channels.${channel}`)}</Subtitle>
      {pushTypes.map((type) => (
        <SwitchRow
          key={type}
          label={t(`types.${type}`)}
          value={enabled(type, channel)}
          disabled={!rows.isSuccess}
          onValueChange={(value) => save.mutate({ type, channel, enabled: value })}
        />
      ))}
      {save.isError ? <ErrorText>{t('preferences.saveFailed')}</ErrorText> : null}
    </View>
  );
}

function QuietHoursSection() {
  const { t } = useTranslation('notifications');
  const { timezone } = useCurrentUser();
  const queryClient = useQueryClient();
  const hours = useQuery({
    queryKey: quietHoursKey,
    queryFn: notificationsRepository.getQuietHours,
  });
  const save = useMutation({
    mutationFn: notificationsRepository.setQuietHours,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quietHoursKey }),
  });
  const { control, handleSubmit, formState } = useForm<QuietHoursForm>({
    resolver: zodResolver(quietHoursFormSchema),
    values: hours.data ?? notificationRules.defaultQuietHours,
  });
  const off = hours.data === null;
  const endError = formState.errors.end?.type === 'custom' ? 'same' : 'time';

  return (
    <View className="gap-2">
      <Subtitle>{t('preferences.quietHours.title')}</Subtitle>
      <Muted>{t('preferences.quietHours.hint')}</Muted>
      {hours.isError ? <ErrorText>{t('preferences.load')}</ErrorText> : null}
      <SwitchRow
        label={t('preferences.quietHours.none')}
        value={off}
        disabled={!hours.isSuccess || save.isPending}
        // Turning it back on starts from the default window, which the person then adjusts.
        onValueChange={(none) =>
          save.mutate(none ? null : { ...notificationRules.defaultQuietHours })
        }
      />
      {hours.isSuccess && !off ? (
        <>
          <Muted>{t('preferences.quietHours.timezone', { timezone })}</Muted>
          <TimeField
            control={control}
            name="start"
            label={t('preferences.quietHours.start')}
            errorText={t('preferences.quietHours.time')}
          />
          <TimeField
            control={control}
            name="end"
            label={t('preferences.quietHours.end')}
            errorText={t(`preferences.quietHours.${endError}`)}
          />
          <Button
            label={t('preferences.quietHours.save')}
            loading={save.isPending}
            onPress={handleSubmit((values) => save.mutate(values))}
          />
        </>
      ) : null}
      {save.isSuccess ? <Body role="status">{t('preferences.quietHours.saved')}</Body> : null}
      {save.isError ? <ErrorText>{t('preferences.saveFailed')}</ErrorText> : null}
    </View>
  );
}

function DevicesSection() {
  const { t } = useTranslation('notifications');
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const when = useWhenText();
  const devices = useQuery({ queryKey: devicesKey, queryFn: notificationsRepository.listDevices });
  const thisDevice = useQuery({
    queryKey: thisDeviceQueryKey(user.id),
    queryFn: () => thisDeviceId(user.id),
    enabled: Boolean(user.id),
  });
  const remove = useMutation({
    // This browser's row also stops the browser, or the next open would register it again.
    mutationFn: (id: string) =>
      id === thisDevice.data ? forgetThisDevice() : notificationsRepository.removeDevice(id),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: devicesKey }),
        queryClient.invalidateQueries({ queryKey: thisDeviceQueryKey(user.id) }),
      ]),
  });
  const name = (device: PushDevice) => {
    const { browser, system } = deviceLabel(device.userAgent);
    const label =
      browser && system
        ? t('preferences.devices.name', { browser, system })
        : (browser ?? system ?? t('preferences.devices.unknown'));
    return device.id === thisDevice.data
      ? `${label} · ${t('preferences.devices.thisDevice')}`
      : label;
  };

  return (
    <View className="gap-2">
      <Subtitle>{t('preferences.devices.title')}</Subtitle>
      {devices.isError ? <ErrorText>{t('preferences.load')}</ErrorText> : null}
      {devices.data?.length === 0 ? <Muted>{t('preferences.devices.empty')}</Muted> : null}
      {devices.data?.map((device) => (
        <View
          key={device.id}
          className="gap-2 rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
        >
          <Body className="font-heavy">{name(device)}</Body>
          <Muted>
            {device.lastSuccessAt
              ? t('preferences.devices.lastSuccess', { date: when(device.lastSuccessAt) })
              : t('preferences.devices.added', { date: when(device.createdAt) })}
          </Muted>
          <Button
            variant="secondary"
            label={t('preferences.devices.remove')}
            loading={remove.isPending && remove.variables === device.id}
            onPress={() => remove.mutate(device.id)}
          />
        </View>
      ))}
      {remove.isError ? <ErrorText>{t('preferences.devices.removeFailed')}</ErrorText> : null}
    </View>
  );
}
