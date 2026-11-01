import { buildTaskInput, addDays, localDayRange, nextHourTime } from '@azkaban/core';
import { contextsRepository, tasksRepository, taskErrorCode } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Button,
  Chip,
  ChipRow,
  ErrorText,
  Fab,
  FormTextField,
  IconButton,
  SegmentedControl,
  Subtitle,
  TimeField,
  tokens,
} from '@azkaban/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { z } from 'zod';
import { errorKey } from './format';
import { defaultFormValues } from './formDefaults';
import { useCurrentUser, useLastContext, useNow, useRefreshTasks } from './hooks';

const quickSchema = z.object({
  title: z.string().trim().min(1).max(120),
  day: z.enum(['today', 'tomorrow']),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  contextId: z.string().min(1),
});
type QuickValues = z.infer<typeof quickSchema>;

type Props = {
  /** The context to start from when the screen is already inside one. */
  contextId?: string;
  onCreated: () => void;
};

/**
 * The "+" button and its sheet: a title and a time, then "Criar". Two taps from anywhere that
 * has the button. "Mais opções" carries what was typed to the full form.
 */
export function QuickCreate({ contextId, onCreated }: Props) {
  const { t } = useTranslation('tasks');
  const router = useRouter();
  const refresh = useRefreshTasks();
  const { user, timezone } = useCurrentUser();
  const { lastContextId, remember } = useLastContext();
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const [open, setOpen] = useState(false);
  const now = useNow();

  const list = contexts.data ?? [];
  const startContext =
    [contextId, lastContextId].find((id) => list.some((context) => context.id === id)) ??
    list[0]?.id ??
    '';

  const { control, handleSubmit, getValues, reset } = useForm<QuickValues>({
    resolver: zodResolver(quickSchema),
    values: {
      title: '',
      day: 'today',
      time: nextHourTime(timezone, now),
      contextId: startContext,
    },
    resetOptions: { keepDirtyValues: true },
  });
  const { field: day } = useController({ control, name: 'day' });
  const { field: context } = useController({ control, name: 'contextId' });

  const create = useMutation({
    mutationFn: async (values: QuickValues) => {
      const chosen = list.find(({ id }) => id === values.contextId);
      if (!chosen) throw new Error('context_missing');
      const today = localDayRange(timezone, new Date()).date;
      const input = buildTaskInput(
        {
          ...defaultFormValues({
            contextId: chosen.id,
            userId: user.id,
            date: values.day === 'today' ? today : addDays(today, 1),
            time: values.time,
          }),
          title: values.title,
        },
        {
          timezone,
          assigneeId: user.id,
          creatorId: user.id,
          personalContext: chosen.groupId === null,
        },
      );
      await tasksRepository.create(input, null);
      remember(chosen.id);
    },
    onSuccess: async () => {
      await refresh();
      reset();
      setOpen(false);
      onCreated();
    },
  });

  const submit = handleSubmit((values) => create.mutate(values));
  const close = () => {
    setOpen(false);
    create.reset();
  };
  const moreOptions = () => {
    const values = getValues();
    setOpen(false);
    router.push({
      pathname: '/tasks/new',
      params: {
        title: values.title,
        context: values.contextId,
        day: values.day,
        time: values.time,
      },
    });
  };

  return (
    <>
      <Fab
        label={t('quick.fab')}
        extended
        onPress={() => (list.length === 0 ? router.push('/contexts/new') : setOpen(true))}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            aria-label={t('quick.close')}
            onPress={close}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: tokens.colors.text,
              opacity: 0.4,
            }}
          />
          <View
            role="dialog"
            aria-label={t('quick.title')}
            style={{
              gap: tokens.spacing[3],
              padding: tokens.spacing[4],
              width: '100%',
              maxWidth: tokens.layout.maxContentWidth,
              alignSelf: 'center',
            }}
            className="rounded-t-lg bg-background dark:bg-background-dark"
          >
            <View className="flex-row items-center justify-between">
              <Subtitle>{t('quick.title')}</Subtitle>
              <IconButton icon="✕" label={t('quick.close')} onPress={close} />
            </View>
            <FormTextField
              control={control}
              name="title"
              label={t('quick.titleLabel')}
              errorText={t('form.titleRequired')}
              autoFocus
              maxLength={120}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
            <SegmentedControl
              label={t('quick.dayLabel')}
              value={day.value}
              onChange={day.onChange}
              options={[
                { value: 'today', label: t('days.today') },
                { value: 'tomorrow', label: t('days.tomorrow') },
              ]}
            />
            <TimeField
              control={control}
              name="time"
              label={t('quick.timeLabel')}
              errorText={t('form.timeRequired')}
            />
            {list.length > 1 ? (
              <ChipRow label={t('form.context')}>
                {list.map((item) => (
                  <Chip
                    key={item.id}
                    label={`${item.icon} ${item.name}`}
                    colorToken={item.colorToken}
                    selected={context.value === item.id}
                    onPress={() => context.onChange(item.id)}
                  />
                ))}
              </ChipRow>
            ) : null}
            {create.isError ? (
              <ErrorText>{t(errorKey(taskErrorCode(create.error)))}</ErrorText>
            ) : null}
            <Button
              label={t('quick.create')}
              loading={create.isPending}
              onPress={() => void submit()}
            />
            <Button variant="secondary" label={t('quick.moreOptions')} onPress={moreOptions} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
