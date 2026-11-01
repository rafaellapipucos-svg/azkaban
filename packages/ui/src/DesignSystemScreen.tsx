import type { OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { Button, ConfirmButton } from './Button';
import { DateField, TimeField } from './DateTimeFields';
import { Fab } from './Fab';
import { IconButton } from './IconButton';
import { Card, Chip, ChipRow, EmptyState, Screen } from './Layout';
import { Mascot, type MascotMood } from './Mascot';
import { ProgressRing } from './ProgressRing';
import { SegmentedControl } from './SegmentedControl';
import { StatusBadge } from './StatusBadge';
import { Stepper } from './Stepper';
import { SwitchRow } from './SwitchRow';
import { TaskCheck } from './TaskCheck';
import { Body, ErrorText, Muted, Subtitle, Title } from './Text';
import { colors, contextColors } from './tokens';

const moods: MascotMood[] = ['happy', 'celebrating', 'worried', 'sleeping'];
const statuses: OccurrenceStatus[] = ['pending', 'done', 'partial', 'missed', 'cancelled'];
const goal = 5;
type CalendarView = 'month' | 'week' | 'day';

export function DesignSystemScreen() {
  const { t } = useTranslation('ui');
  const [selected, setSelected] = useState<string>('violet');
  const [done, setDone] = useState(3);
  const [notify, setNotify] = useState(true);
  const [view, setView] = useState<CalendarView>('week');
  const [every, setEvery] = useState(2);
  const [status, setStatus] = useState<OccurrenceStatus>('pending');
  const [fabPressed, setFabPressed] = useState(false);
  const form = useForm({ defaultValues: { date: '', time: '' } });
  const [date, time] = form.watch(['date', 'time']);
  // Shows the invalid look until a time is picked.
  useEffect(() => form.setError('time', { type: 'required' }), [form]);
  useEffect(() => {
    if (time) form.clearErrors('time');
  }, [time, form]);
  const nextStatus = () =>
    setStatus(statuses[(statuses.indexOf(status) + 1) % statuses.length] ?? 'pending');
  return (
    <View className="flex-1">
      <Screen>
        <Title>{t('designSystem.title')}</Title>

        <Subtitle>{t('designSystem.text')}</Subtitle>
        <Body>Body</Body>
        <Muted>Muted</Muted>
        <ErrorText>ErrorText</ErrorText>

        <Subtitle>{t('designSystem.buttons')}</Subtitle>
        <Button label="Primary" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Danger" variant="danger" />
        <Button label="Disabled" disabled />
        <Button label="Loading" loading />
        <ConfirmButton label="Confirm" confirmLabel="Sure?" onConfirm={() => undefined} />

        <Subtitle>{t('designSystem.status')}</Subtitle>
        <View className="flex-row flex-wrap gap-2">
          <StatusBadge status="pending" />
          <StatusBadge status="done" />
          <StatusBadge status="partial" />
          <StatusBadge status="missed" />
          <StatusBadge status="cancelled" />
        </View>

        <Subtitle>{t('designSystem.progress')}</Subtitle>
        <View className="flex-row items-center gap-4">
          <ProgressRing
            progress={done / goal}
            label={t('designSystem.dailyGoal')}
            valueText={t('designSystem.progressValue', { done, total: goal })}
          />
          <View className="flex-1 gap-2">
            <Button
              label={t('designSystem.progressMore')}
              disabled={done >= goal}
              onPress={() => setDone(done + 1)}
            />
            <Button
              label={t('designSystem.progressReset')}
              variant="secondary"
              onPress={() => setDone(0)}
            />
          </View>
        </View>

        <Subtitle>{t('designSystem.dateTime')}</Subtitle>
        <DateField
          control={form.control}
          name="date"
          label={t('designSystem.dateLabel')}
          errorText={t('designSystem.dateError')}
        />
        <TimeField
          control={form.control}
          name="time"
          label={t('designSystem.timeLabel')}
          errorText={t('designSystem.timeError')}
        />
        <Body testID="date-out">{t('designSystem.dateOut', { value: date })}</Body>
        <Body testID="time-out">{t('designSystem.timeOut', { value: time })}</Body>

        <Subtitle>{t('designSystem.controls')}</Subtitle>
        <SwitchRow
          label={t('designSystem.notifyLabel')}
          description={t('designSystem.notifyHint')}
          value={notify}
          onValueChange={setNotify}
        />
        <SegmentedControl
          label={t('designSystem.viewLabel')}
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: t('designSystem.viewMonth') },
            { value: 'week', label: t('designSystem.viewWeek') },
            { value: 'day', label: t('designSystem.viewDay') },
          ]}
        />
        <View className="flex-row items-center justify-between gap-4">
          <Body>{t('designSystem.everyLabel')}</Body>
          <Stepper
            label={t('designSystem.everyLabel')}
            value={every}
            onChange={setEvery}
            format={(count) => t('designSystem.everyDays', { count })}
          />
        </View>

        <Subtitle>{t('designSystem.iconButtons')}</Subtitle>
        <View className="flex-row gap-2">
          <IconButton icon="✏️" label={t('designSystem.editLabel')} />
          <IconButton icon="⭐" label={t('designSystem.starLabel')} variant="primary" />
          <IconButton icon="✏️" label={t('designSystem.editLabel')} disabled />
        </View>

        <Subtitle>{t('designSystem.taskChecks')}</Subtitle>
        <View className="flex-row flex-wrap items-center gap-4">
          {statuses.map((value) => (
            <TaskCheck key={value} status={value} title={t('designSystem.taskTitle')} />
          ))}
          <TaskCheck status="done" late title={t('designSystem.taskTitle')} />
        </View>
        <View className="flex-row items-center gap-4">
          <TaskCheck status={status} title={t('designSystem.taskTitle')} onPress={nextStatus} />
          <Muted className="flex-1">{t('designSystem.taskPressHint')}</Muted>
        </View>

        <Subtitle>{t('designSystem.fab')}</Subtitle>
        <Muted>{fabPressed ? t('designSystem.fabPressed') : ' '}</Muted>

        <Subtitle>{t('designSystem.contextColors')}</Subtitle>
        <ChipRow label={t('designSystem.contextColors')}>
          {Object.keys(contextColors).map((token) => (
            <Chip
              key={token}
              label={token}
              colorToken={token}
              selected={selected === token}
              onPress={() => setSelected(token)}
            />
          ))}
        </ChipRow>

        <Subtitle>{t('designSystem.mascot')}</Subtitle>
        <View className="flex-row flex-wrap justify-center gap-2">
          {moods.map((mood) => (
            <Mascot key={mood} mood={mood} size={80} />
          ))}
        </View>
        <EmptyState text="EmptyState" />

        <Subtitle>{t('designSystem.colors')}</Subtitle>
        {Object.entries(colors).map(([name, value]) => (
          <Card key={name}>
            <View className="flex-row items-center gap-3">
              <View className="h-8 w-8 rounded-full" style={{ backgroundColor: value }} />
              <Text className="font-body text-sm text-text dark:text-text-dark">
                {name} {value}
              </Text>
            </View>
          </Card>
        ))}
      </Screen>
      <Fab
        label={t('designSystem.newTask')}
        extended
        insideTabs={false}
        onPress={() => setFabPressed(true)}
      />
    </View>
  );
}
