import { dayTimeline, type DayInfo } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { Muted, tokens } from '@azkaban/ui';
import { Pressable, Text, View } from 'react-native';
import { calendarConfig } from './config';
import { Block, ItemList, PerfectBanner, type DayActions } from './DayParts';

const hourText = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * One day: the deadlines that fall due, what takes the whole day, then the hours. Tapping an hour
 * with nothing in it starts a task at that time, and an hour that has tasks keeps a slot for more.
 */
export function DayView({
  date,
  info,
  actions,
}: {
  date: string;
  info: DayInfo | undefined;
  actions: DayActions;
}) {
  const { t } = useTranslation('calendar');
  const timeline = dayTimeline(info?.items ?? [], actions.timezone);
  const firstTask = timeline.hours.findIndex((items) => items.length > 0);
  const startHour =
    firstTask === -1
      ? calendarConfig.dayStartHour
      : Math.min(firstTask, calendarConfig.dayStartHour);

  return (
    <View style={{ gap: tokens.spacing[4] }}>
      <PerfectBanner info={info} />
      <Block
        title={t('day.deadlines')}
        empty={t('day.noDeadlines')}
        items={timeline.deadlines}
        actions={actions}
      />
      <Block title={t('day.allDay')} items={timeline.allDay} actions={actions} />
      <View>
        {timeline.hours.map((items, hour) =>
          hour < startHour ? null : (
            <View
              key={hour}
              style={{ gap: tokens.spacing[2] }}
              className="flex-row border-t border-border py-1 dark:border-border-dark"
            >
              <Muted
                style={{ width: tokens.sizes.field, paddingTop: tokens.spacing[3] }}
                className="text-sm"
              >
                {hourText(hour)}
              </Muted>
              <View style={{ gap: tokens.spacing[1] }} className="flex-1">
                <ItemList items={items} actions={actions} />
                <Pressable
                  role="button"
                  aria-label={t('day.newAt', { time: hourText(hour) })}
                  onPress={() => actions.onCreate(date, hourText(hour))}
                  style={{ minHeight: tokens.sizes.touch }}
                  className="items-end justify-center rounded-md px-3 active:opacity-70"
                >
                  <Text aria-hidden className="font-heavy text-lg text-muted dark:text-muted-dark">
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          ),
        )}
      </View>
    </View>
  );
}
