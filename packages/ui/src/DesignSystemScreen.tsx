import type { CelebrationKind, OccurrenceStatus } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { AchievementBadge } from './AchievementBadge';
import { Button, ConfirmButton } from './Button';
import { CelebrationCard } from './CelebrationCard';
import { DateField, TimeField } from './DateTimeFields';
import { Fab } from './Fab';
import { IconButton } from './IconButton';
import { Card, Chip, ChipRow, EmptyState, Screen } from './Layout';
import { Mascot, type MascotMood } from './Mascot';
import { PerfectDayScreen } from './PerfectDayScreen';
import { ProgressRing } from './ProgressRing';
import { SegmentedControl } from './SegmentedControl';
import { FormTextField } from './FormTextField';
import { Sheet } from './Sheet';
import { StatusMark } from './StatusMark';
import { StatusBadge } from './StatusBadge';
import { StreakBadge } from './StreakBadge';
import { Stepper } from './Stepper';
import { SwitchRow } from './SwitchRow';
import { TabBar } from './TabBar';
import { TaskCheck } from './TaskCheck';
import { Body, ErrorText, Muted, Subtitle, Title } from './Text';
import { XpBar } from './XpBar';
import { colors, contextColors, sizes } from './tokens';

const moods: MascotMood[] = ['happy', 'celebrating', 'worried', 'sleeping'];
const statuses: OccurrenceStatus[] = ['pending', 'done', 'partial', 'missed', 'cancelled'];
const goal = 5;
const levelXp = 150;
const celebrationKinds: CelebrationKind[] = [
  'occurrence_done',
  'occurrence_partial',
  'level_up',
  'achievement',
  'streak_milestone',
];
type CalendarView = 'month' | 'week' | 'day';
type LongView = 'mine' | 'member' | 'team';
const demoTabs = [
  { key: 'today', icon: '🌱', label: 'designSystem.tabToday' },
  { key: 'work', icon: '💼', label: 'designSystem.tabWork' },
  { key: 'home', icon: '🏠', label: 'designSystem.tabHome' },
  { key: 'calendar', icon: '📅', label: 'designSystem.tabCalendar' },
  { key: 'shopping', icon: '🛒', label: 'designSystem.tabShopping' },
  { key: 'profile', icon: '🙂', label: 'designSystem.tabProfile' },
] as const;

export function DesignSystemScreen() {
  const { t } = useTranslation('ui');
  const [selected, setSelected] = useState<string>('violet');
  const [days, setDays] = useState<string[]>(['mon', 'wed']);
  const [done, setDone] = useState(3);
  const [notify, setNotify] = useState(true);
  const [view, setView] = useState<CalendarView>('week');
  const [every, setEvery] = useState(2);
  const [status, setStatus] = useState<OccurrenceStatus>('pending');
  const [fabPressed, setFabPressed] = useState(false);
  const [longChip, setLongChip] = useState(true);
  const [longMulti, setLongMulti] = useState(false);
  const [longView, setLongView] = useState<LongView>('mine');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState('calendar');
  const [unread, setUnread] = useState(3);
  const [mascotRound, setMascotRound] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationKind | null>('occurrence_done');
  const [celebrationRound, setCelebrationRound] = useState(0);
  const [perfectDay, setPerfectDay] = useState(false);
  const showCelebration = (kind: CelebrationKind) => {
    setCelebration(kind);
    setCelebrationRound(celebrationRound + 1);
  };
  const form = useForm({ defaultValues: { date: '', time: '', note: '', sheetNote: '' } });
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
      <Screen title={t('designSystem.title')}>
        <Title>{t('designSystem.title')}</Title>

        <Subtitle>{t('designSystem.text')}</Subtitle>
        <Body>Body</Body>
        <Muted>Muted</Muted>
        <ErrorText>ErrorText</ErrorText>
        <Subtitle tone="danger">Subtitle danger</Subtitle>
        <Subtitle level={3}>{t('designSystem.level3')}</Subtitle>
        <FormTextField
          control={form.control}
          name="note"
          label={t('designSystem.noteLabel')}
          errorText={t('designSystem.noteLabel')}
          placeholder={t('designSystem.notePlaceholder')}
        />

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
          <StatusBadge status="done" reviewing />
        </View>

        <Subtitle>{t('designSystem.statusMarks')}</Subtitle>
        <View className="flex-row flex-wrap items-center gap-2">
          {statuses.map((value) => (
            <StatusMark key={`dot-${value}`} status={value} size="dot" />
          ))}
          <StatusMark status="done" size="dot" reviewing />
          {statuses.map((value) => (
            <StatusMark key={`row-${value}`} status={value} size="row" />
          ))}
          <StatusMark status="done" size="row" reviewing />
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

        <Subtitle>{t('designSystem.gamification')}</Subtitle>
        <Muted>{t('designSystem.motionHint')}</Muted>
        <XpBar
          progress={done / goal}
          label={t('designSystem.xpLevel', { level: 3 })}
          valueText={t('designSystem.xpValue', { xp: (done * levelXp) / goal, total: levelXp })}
        />
        <View className="flex-row flex-wrap items-center gap-2">
          <StreakBadge days={0} label={t('designSystem.streakLabel', { count: 0 })} />
          <StreakBadge days={1} label={t('designSystem.streakLabel', { count: 1 })} />
          <StreakBadge
            days={12}
            label={t('designSystem.streakLabel', { count: 12 })}
            protection={{ count: 2, label: t('designSystem.freezeLabel', { count: 2 }) }}
            onPress={() => undefined}
          />
        </View>
        <AchievementBadge
          icon="🌱"
          title={t('designSystem.achievementFirstTitle')}
          description={t('designSystem.achievementFirstDescription')}
          unlocked
          stateLabel={t('designSystem.achievementUnlocked')}
        />
        <AchievementBadge
          icon="🔥"
          title={t('designSystem.achievementWeekTitle')}
          description={t('designSystem.achievementWeekDescription')}
          unlocked={false}
          stateLabel={t('designSystem.achievementLocked')}
        />

        <Subtitle level={3}>{t('designSystem.mascotMotion')}</Subtitle>
        <View className="flex-row flex-wrap justify-center gap-2">
          <Mascot key={`c${mascotRound}`} mood="celebrating" size={sizes.mascotSmall} animate />
          <Mascot key={`w${mascotRound}`} mood="worried" size={sizes.mascotSmall} animate />
        </View>
        <Button
          label={t('designSystem.mascotReplay')}
          variant="secondary"
          onPress={() => setMascotRound(mascotRound + 1)}
        />

        <Subtitle level={3}>{t('designSystem.celebrations')}</Subtitle>
        <ChipRow label={t('designSystem.celebrationKind')}>
          {celebrationKinds.map((kind) => (
            <Chip
              key={kind}
              label={t(`designSystem.celebrate.${kind}.chip`)}
              selected={celebration === kind}
              onPress={() => showCelebration(kind)}
            />
          ))}
        </ChipRow>
        {celebration ? (
          <CelebrationCard
            key={`${celebration}${celebrationRound}`}
            kind={celebration}
            title={t(`designSystem.celebrate.${celebration}.title`)}
            detail={t(`designSystem.celebrate.${celebration}.detail`)}
            others={celebration === 'level_up' ? [t('designSystem.celebrationOther')] : undefined}
            closeLabel={t('designSystem.celebrationClose')}
            onClose={() => setCelebration(null)}
          />
        ) : (
          <Button
            label={t('designSystem.celebrationShow')}
            variant="secondary"
            onPress={() => showCelebration('occurrence_done')}
          />
        )}
        <Button
          label={t('designSystem.perfectDayOpen')}
          variant="secondary"
          onPress={() => setPerfectDay(true)}
        />

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
        <SegmentedControl
          label={t('designSystem.longViewLabel')}
          value={longView}
          onChange={setLongView}
          options={[
            { value: 'mine', label: t('designSystem.longMine') },
            { value: 'member', label: t('designSystem.longMember') },
            { value: 'team', label: t('designSystem.longTeam') },
          ]}
        />
        <Muted>{t('designSystem.keyboardHint')}</Muted>
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
          <IconButton
            icon="🔔"
            label={t('designSystem.bellLabel', { count: unread })}
            badge={unread}
            onPress={() => setUnread(unread === 0 ? 3 : unread === 3 ? 120 : 0)}
          />
        </View>

        <Subtitle>{t('designSystem.taskChecks')}</Subtitle>
        <View className="flex-row flex-wrap items-center gap-4">
          {statuses.map((value) => (
            <TaskCheck key={value} status={value} title={t('designSystem.taskTitle')} />
          ))}
          <TaskCheck status="done" late title={t('designSystem.taskTitle')} />
          <TaskCheck status="done" reviewing title={t('designSystem.taskTitle')} />
          <TaskCheck status="done" reviewing late title={t('designSystem.taskTitle')} />
        </View>
        <View className="flex-row items-center gap-4">
          <TaskCheck status={status} title={t('designSystem.taskTitle')} onPress={nextStatus} />
          <Muted className="flex-1">{t('designSystem.taskPressHint')}</Muted>
        </View>

        <Subtitle>{t('designSystem.tabBar')}</Subtitle>
        <Muted>{t('designSystem.tabBarHint')}</Muted>
        {/* -mx-4 undoes the Screen padding: the real bar spans the whole width. */}
        <View className="-mx-4">
          <TabBar
            items={demoTabs.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: t(item.label),
              selected: tab === item.key,
              onPress: () => setTab(item.key),
            }))}
          />
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

        <Subtitle>{t('designSystem.multiChips')}</Subtitle>
        <ChipRow label={t('designSystem.multiChips')} multiple>
          {['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => (
            <Chip
              key={day}
              multiple
              label={day}
              selected={days.includes(day)}
              onPress={() =>
                setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day])
              }
            />
          ))}
        </ChipRow>

        <Subtitle>{t('designSystem.longChips')}</Subtitle>
        <ChipRow label={t('designSystem.longChips')}>
          <Chip
            label={t('designSystem.longName')}
            colorToken="violet"
            selected={longChip}
            onPress={() => setLongChip(!longChip)}
          />
          <Chip label={t('designSystem.longName')} selected={false} onPress={() => undefined} />
        </ChipRow>
        <ChipRow label={t('designSystem.longChips')} multiple>
          <Chip
            multiple
            label={t('designSystem.longName')}
            selected={longMulti}
            onPress={() => setLongMulti(!longMulti)}
          />
        </ChipRow>

        <Subtitle>{t('designSystem.sheet')}</Subtitle>
        <Button
          label={t('designSystem.sheetOpen')}
          variant="secondary"
          onPress={() => setSheetOpen(true)}
        />

        <Subtitle>{t('designSystem.mascot')}</Subtitle>
        <View className="flex-row flex-wrap justify-center gap-2">
          {moods.map((mood) => (
            <Mascot key={mood} mood={mood} size={sizes.mascotSmall} />
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
      <Sheet
        visible={sheetOpen}
        label={t('designSystem.sheetTitle')}
        onClose={() => setSheetOpen(false)}
      >
        <Subtitle>{t('designSystem.sheetTitle')}</Subtitle>
        <Body>{t('designSystem.sheetText')}</Body>
        <FormTextField
          control={form.control}
          name="sheetNote"
          label={t('designSystem.noteLabel')}
          errorText={t('designSystem.noteLabel')}
          placeholder={t('designSystem.notePlaceholder')}
          autoFocus
        />
        <Button label={t('designSystem.sheetClose')} onPress={() => setSheetOpen(false)} />
      </Sheet>
      <PerfectDayScreen
        visible={perfectDay}
        title={t('designSystem.perfectDayTitle')}
        detail={t('designSystem.perfectDayDetail')}
        closeLabel={t('designSystem.celebrationClose')}
        onClose={() => setPerfectDay(false)}
      />
      <Fab
        label={t('designSystem.newTask')}
        extended
        insideTabs={false}
        onPress={() => setFabPressed(true)}
      />
    </View>
  );
}
