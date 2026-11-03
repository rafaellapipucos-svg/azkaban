import { calendarStatuses, weekDays, type DayInfo, type WeekStart } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { IconButton, Muted, StatusMark, tokens } from '@azkaban/ui';
import { Pressable, Text, View } from 'react-native';
import { ItemList, type DayActions } from './DayParts';
import { daySummaryLabel, shortDay } from './format';

type Props = {
  date: string;
  today: string;
  days: ReadonlyMap<string, DayInfo>;
  weekStartsOn: WeekStart;
  actions: DayActions;
  onOpenDay: (date: string) => void;
};

/**
 * The week as seven stacked days, not seven columns: a column is under 50px wide on a phone, too
 * narrow for a title. Each head opens that day, and its plus button starts a task on it.
 */
export function WeekView({ date, today, days, weekStartsOn, actions, onOpenDay }: Props) {
  const { t, i18n } = useTranslation('calendar');
  return (
    <View style={{ gap: tokens.spacing[4] }}>
      {weekDays(date, weekStartsOn).map((day) => {
        const info = days.get(day);
        return (
          <View key={day} style={{ gap: tokens.spacing[2] }}>
            <View style={{ gap: tokens.spacing[2] }} className="flex-row items-center">
              <Pressable
                role="button"
                aria-label={`${t('day.openDayLabel', {
                  date: daySummaryLabel(info, day, { t, language: i18n.language }),
                })}`}
                onPress={() => onOpenDay(day)}
                style={{ minHeight: tokens.sizes.touch, gap: tokens.spacing[2] }}
                className="flex-1 flex-row flex-wrap items-center active:opacity-70"
              >
                <Text
                  className={`font-heavy text-md ${
                    day === today
                      ? 'text-primary dark:text-primary-light'
                      : 'text-text dark:text-text-dark'
                  }`}
                >
                  {shortDay(day, i18n.language)}
                </Text>
                {calendarStatuses
                  .filter((status) => (info?.summary[status] ?? 0) > 0)
                  .map((status) => (
                    <StatusMark key={status} status={status} size="dot" />
                  ))}
                {info?.perfect ? (
                  <Text aria-hidden className="text-md">
                    ⭐
                  </Text>
                ) : null}
              </Pressable>
              <IconButton
                icon="+"
                label={`${t('day.newOnDay')}: ${shortDay(day, i18n.language)}`}
                onPress={() => actions.onCreate(day)}
              />
            </View>
            {info && info.items.length > 0 ? (
              <ItemList items={info.items} actions={actions} />
            ) : (
              <Muted className="text-sm">{t('day.empty')}</Muted>
            )}
          </View>
        );
      })}
    </View>
  );
}
