import { monthGrid, monthOf, type DayInfo, type WeekStart } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { tokens } from '@azkaban/ui';
import { Pressable, Text, View } from 'react-native';
import { DayMarks } from './DayMarks';
import { daySummaryLabel, weekdayShort } from './format';

type Props = {
  /** The selected day. Its month is the one drawn. */
  date: string;
  today: string;
  days: ReadonlyMap<string, DayInfo>;
  weekStartsOn: WeekStart;
  onSelect: (date: string) => void;
};

// The grid is seven equal columns that share the width of the screen: at 375px each cell is about
// 45px, so it keeps the 44px touch target without scrolling sideways. Each cell draws the day
// number, the count, one marker per status present (a symbol, not just a color) and a star when
// the day is perfect. The spoken label says the same in words.
export function MonthView({ date, today, days, weekStartsOn, onSelect }: Props) {
  const { t, i18n } = useTranslation('calendar');
  const weeks = monthGrid(monthOf(date), weekStartsOn);
  const gap = tokens.spacing[1];

  return (
    <View style={{ gap }}>
      <View aria-hidden style={{ gap }} className="flex-row">
        {weeks[0]!.map((cell) => (
          <Text
            key={cell.date}
            numberOfLines={1}
            className="flex-1 text-center font-heavy text-sm text-muted dark:text-muted-dark"
          >
            {weekdayShort(cell.date, i18n.language)}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]!.date} style={{ gap }} className="flex-row">
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
                style={{
                  minHeight: tokens.sizes.touch + tokens.spacing[6],
                  gap: tokens.spacing[1],
                }}
                className={`flex-1 rounded-md border-2 bg-surface px-0.5 py-1 active:opacity-70 dark:bg-surface-dark ${
                  selected
                    ? 'border-primary dark:border-primary-light'
                    : info?.perfect
                      ? 'border-done'
                      : 'border-border dark:border-border-dark'
                } ${cell.inMonth ? '' : 'opacity-50'}`}
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
                        isToday ? 'text-onPrimary' : 'text-text dark:text-text-dark'
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
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
