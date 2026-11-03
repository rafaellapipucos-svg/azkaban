import { monthGrid, monthOf, type DayInfo, type WeekStart } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { tokens } from '@azkaban/ui';
import { Pressable, Text, View } from 'react-native';
import { DayMarks } from './DayMarks';
import { daySummaryLabel, weekdayNarrow } from './format';

type Props = {
  /** The selected day. Its month is the one drawn. */
  date: string;
  today: string;
  days: ReadonlyMap<string, DayInfo>;
  weekStartsOn: WeekStart;
  onSelect: (date: string) => void;
};

// The grid is seven equal columns that share the width of the screen. It bleeds over the side
// padding of Screen and each target fills its whole column, the 4px between the boxes being
// padding inside the target: at 320px each target is about 45px wide, so it keeps the 44px touch
// target without scrolling sideways. Each cell draws the day number, the count, one marker per
// status present (a symbol, not just a color) and a star when the day is perfect. The spoken label
// says the same in words; the column heads are one letter, so they fit at 200% zoom. A day of the
// next or previous month has a dashed border and a muted number, not a lower opacity: half opacity
// left it at 3.3:1.
export function MonthView({ date, today, days, weekStartsOn, onSelect }: Props) {
  const { t, i18n } = useTranslation('calendar');
  const weeks = monthGrid(monthOf(date), weekStartsOn);

  return (
    // ponytail: the bleed equals Screen's paddingHorizontal (spacing[4]); change both together.
    <View style={{ marginHorizontal: -tokens.spacing[4] }}>
      <View aria-hidden className="flex-row">
        {weeks[0]!.map((cell) => (
          <Text
            key={cell.date}
            numberOfLines={1}
            className="flex-1 text-center font-heavy text-sm text-muted dark:text-muted-dark"
          >
            {weekdayNarrow(cell.date, i18n.language)}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]!.date} className="flex-row">
          {week.map((cell) => {
            const info = days.get(cell.date);
            const selected = cell.date === date;
            const isToday = cell.date === today;
            return (
              <Pressable
                key={cell.date}
                role="button"
                aria-label={daySummaryLabel(info, cell.date, { t, language: i18n.language })}
                aria-pressed={selected}
                aria-current={isToday ? 'date' : undefined}
                onPress={() => onSelect(cell.date)}
                className="flex-1 p-0.5 active:opacity-70"
              >
                <View
                  style={{
                    minHeight: tokens.sizes.touch + tokens.spacing[6],
                    gap: tokens.spacing[1],
                  }}
                  className={`flex-1 rounded-md border-2 bg-surface px-0.5 py-1 dark:bg-surface-dark ${
                    selected
                      ? 'border-primary dark:border-primary-light'
                      : info?.perfect
                        ? 'border-done'
                        : 'border-border dark:border-border-dark'
                  } ${cell.inMonth ? '' : 'border-dashed'}`}
                >
                  <View className="flex-row items-center justify-between">
                    <View
                      style={{ minWidth: tokens.spacing[6], height: tokens.spacing[6] }}
                      className={`items-center justify-center rounded-full ${
                        isToday ? 'bg-primary' : ''
                      }`}
                    >
                      <Text
                        className={`font-heavy text-sm ${
                          isToday
                            ? 'text-onPrimary'
                            : cell.inMonth
                              ? 'text-text dark:text-text-dark'
                              : 'text-muted dark:text-muted-dark'
                        }`}
                      >
                        {Number(cell.date.slice(8, 10))}
                      </Text>
                    </View>
                    {info && info.summary.total > 0 ? (
                      <Text className="font-heavy text-sm text-muted dark:text-muted-dark">
                        {info.summary.total}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row flex-wrap items-center">
                    <DayMarks summary={info?.summary} />
                    {info?.perfect ? (
                      <Text aria-hidden className="text-sm">
                        ⭐
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
