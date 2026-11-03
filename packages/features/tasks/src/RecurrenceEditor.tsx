import type { RecurrenceFrequency, Weekday } from '@azkaban/contracts';
import { addDays, withFrequency, type TaskFormValues } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Chip,
  ChipRow,
  DateField,
  Muted,
  SegmentedControl,
  Stepper,
  tokens,
} from '@azkaban/ui';
import { useController, type Control } from 'react-hook-form';
import { View } from 'react-native';
import { tasksConfig } from './config';
import { describeRecurrence } from './format';

const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly'];
const WEEKDAYS: { value: Weekday; key: string }[] = [
  { value: 'MO', key: 'mon' },
  { value: 'TU', key: 'tue' },
  { value: 'WE', key: 'wed' },
  { value: 'TH', key: 'thu' },
  { value: 'FR', key: 'fri' },
  { value: 'SA', key: 'sat' },
  { value: 'SU', key: 'sun' },
];
const DEFAULT_COUNT = 10;
const DEFAULT_END_DAYS = 30;

type EndType = 'never' | 'on_date' | 'after_count';

/**
 * The friendly editor: how often, which days, when it stops. The user never sees an RRULE; the
 * rule string is built from this value in core when the form is saved.
 */
export function RecurrenceEditor({
  control,
  date,
}: {
  control: Control<TaskFormValues>;
  /** The day of the task, which seeds the weekday, the day of the month and the end date. */
  date: string;
}) {
  const { t } = useTranslation('tasks');
  const { field } = useController({ control, name: 'recurrence' });
  const recurrence = field.value;
  const { frequency, interval, weekdays, monthDay, end } = recurrence;

  const toggleDay = (day: Weekday) => {
    const next = weekdays.includes(day)
      ? weekdays.filter((value) => value !== day)
      : [...weekdays, day];
    // A weekly rule with no day would never happen: the last one stays.
    if (next.length > 0) field.onChange({ ...recurrence, weekdays: next });
  };
  const setEnd = (type: EndType) =>
    field.onChange({
      ...recurrence,
      end:
        type === 'never'
          ? { type }
          : type === 'on_date'
            ? { type, date: addDays(date, DEFAULT_END_DAYS) }
            : { type, count: DEFAULT_COUNT },
    });

  return (
    <View style={{ gap: tokens.spacing[3] }}>
      <ChipRow label={t('repeat.frequencyLabel')}>
        {FREQUENCIES.map((value) => (
          <Chip
            key={value}
            label={t(`repeat.frequency.${value}`)}
            selected={frequency === value}
            onPress={() => field.onChange(withFrequency(recurrence, value, date))}
          />
        ))}
      </ChipRow>

      <Body>{t('repeat.every')}</Body>
      <Stepper
        label={t('repeat.every')}
        value={interval}
        min={1}
        max={tasksConfig.maxInterval}
        onChange={(value) => field.onChange({ ...recurrence, interval: value })}
        format={(value) => t(`repeat.unit.${frequency}`, { count: value })}
      />

      {frequency === 'weekly' ? (
        <>
          <Body>{t('repeat.daysLabel')}</Body>
          <ChipRow label={t('repeat.daysLabel')} multiple>
            {WEEKDAYS.map(({ value, key }) => (
              <Chip
                key={value}
                label={t(`weekdaysShort.${key}`)}
                selected={weekdays.includes(value)}
                multiple
                onPress={() => toggleDay(value)}
              />
            ))}
          </ChipRow>
        </>
      ) : null}

      {frequency === 'monthly' ? (
        <>
          <Body>{t('repeat.monthDayLabel')}</Body>
          <Stepper
            label={t('repeat.monthDayLabel')}
            value={monthDay ?? 1}
            min={1}
            max={tasksConfig.maxMonthDay}
            onChange={(value) => field.onChange({ ...recurrence, monthDay: value })}
            format={(value) => t('repeat.monthDay', { day: value })}
          />
          {(monthDay ?? 1) > 28 ? <Muted>{t('repeat.shortMonthHint')}</Muted> : null}
        </>
      ) : null}

      <Body>{t('repeat.endsLabel')}</Body>
      <SegmentedControl<EndType>
        label={t('repeat.endsLabel')}
        value={end.type}
        onChange={setEnd}
        options={[
          { value: 'never', label: t('repeat.ends.never') },
          { value: 'on_date', label: t('repeat.ends.on_date') },
          { value: 'after_count', label: t('repeat.ends.after_count') },
        ]}
      />
      {end.type === 'on_date' ? (
        <DateField
          control={control}
          name="recurrence.end.date"
          label={t('repeat.endDate')}
          errorText={t('repeat.endDateInvalid')}
        />
      ) : null}
      {end.type === 'after_count' ? (
        <Stepper
          label={t('repeat.countLabel')}
          value={end.count}
          min={1}
          max={tasksConfig.maxCount}
          onChange={(value) =>
            field.onChange({ ...recurrence, end: { type: 'after_count', count: value } })
          }
          format={(value) => t('repeat.count', { count: value })}
        />
      ) : null}

      <Muted>{t('repeat.summary.prefix', { text: describeRecurrence(recurrence, t) })}</Muted>
    </View>
  );
}
