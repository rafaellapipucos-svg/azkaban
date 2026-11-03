import type { OccurrenceListItem } from '@azkaban/contracts';
import {
  buildDays,
  can,
  emptyDay,
  localDateOf,
  noFilter,
  shiftDate,
  visibleRange,
  type CalendarFilter,
  type CalendarView,
} from '@azkaban/core';
import { contextsRepository, groupsRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  ErrorText,
  IconButton,
  Muted,
  Screen,
  SegmentedControl,
  Subtitle,
  Title,
  tokens,
} from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { calendarConfig, type CalendarInitial } from './config';
import { ItemList, PerfectBanner, type DayActions } from './DayParts';
import { DayView } from './DayView';
import { Filters } from './Filters';
import { capitalize, dayMonth, dayMonthYear, longDay, monthTitle } from './format';
import { useCalendarOccurrences, useMaterializeAhead, useNow, type Scope } from './hooks';
import { MonthView } from './MonthView';
import { ScopePicker, type ScopeKind } from './ScopePicker';
import { WeekView } from './WeekView';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar tab: month, week and day, with filters, and for admins other people's calendars. */
export function CalendarScreen({ initial = {} }: { initial?: CalendarInitial }) {
  const { t, i18n } = useTranslation('calendar');
  const router = useRouter();
  const now = useNow();
  const { user, groups, timezone, ready } = useCurrentUser();
  const today = localDateOf(timezone, now.getTime());
  const { weekStartsOn } = calendarConfig;

  const [view, setView] = useState<CalendarView>(initial.view ?? calendarConfig.defaultView);
  const [picked, setPicked] = useState<string | null>(
    initial.date && DATE_PATTERN.test(initial.date) ? initial.date : null,
  );
  const date = picked ?? today;
  const [filter, setFilter] = useState<CalendarFilter>(noFilter);
  const [kind, setKind] = useState<ScopeKind>(initial.scope ?? 'mine');
  const [groupPick, setGroupPick] = useState(initial.groupId);
  const [memberPick, setMemberPick] = useState(initial.memberId);

  // Only groups where the user may see the others' tasks. The database enforces it again (RLS).
  const viewable = useMemo(
    () => groups.filter((group) => can(user, 'task.view_group', group)),
    [groups, user],
  );
  const group = viewable.find(({ id }) => id === groupPick) ?? viewable[0];
  const effectiveKind: ScopeKind = group ? kind : 'mine';

  const members = useQuery({
    queryKey: ['group-members', group?.id],
    queryFn: () => groupsRepository.listMembers(group!.id),
    enabled: group !== undefined,
  });
  const others = (members.data ?? []).filter(({ userId }) => userId !== user.id);
  const member = others.find(({ userId }) => userId === memberPick) ?? others[0];

  const scope: Scope =
    effectiveKind === 'team' && group
      ? { kind: 'team', groupId: group.id }
      : effectiveKind === 'member' && group && member
        ? { kind: 'member', groupId: group.id, memberId: member.userId }
        : { kind: 'mine' };

  const areas = useQuery({ queryKey: ['areas'], queryFn: contextsRepository.listAreas });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });

  const range = visibleRange(view, date, weekStartsOn);
  const occurrences = useCalendarOccurrences({
    scope,
    userId: user.id,
    timezone,
    first: range.first,
    last: range.last,
    // A member scope without a member yet would otherwise show the user's own tasks.
    enabled: ready && !(effectiveKind === 'member' && !member),
  });
  const reach = useMaterializeAhead({ last: range.last, timezone, now, enabled: ready });

  const days = useMemo(
    () => buildDays(occurrences.data ?? [], { timezone, filter }),
    [occurrences.data, timezone, filter],
  );
  const info = days.get(date) ?? emptyDay(date);

  const contextOf = (item: OccurrenceListItem) =>
    (contexts.data ?? []).find(({ id }) => id === item.task.contextId);
  const actions: DayActions = {
    timezone,
    contextLabelOf: (item) => {
      const context = contextOf(item);
      return context ? `${context.icon} ${context.name}` : undefined;
    },
    assigneeNameOf: (item) =>
      effectiveKind === 'team'
        ? (members.data ?? []).find(({ userId }) => userId === item.assigneeId)?.displayName
        : undefined,
    onOpen: (item) => router.push(`/tasks/${item.id}`),
    onCreate: (day, time) =>
      router.push({ pathname: '/tasks/new', params: time ? { day, time } : { day } }),
  };

  const title =
    view === 'month'
      ? capitalize(monthTitle(date, i18n.language))
      : view === 'week'
        ? t('nav.range', {
            from: dayMonth(range.first, i18n.language),
            to: dayMonthYear(range.last, i18n.language),
          })
        : capitalize(longDay(date, i18n.language));
  const limitDate = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${reach.limitDate}T12:00:00Z`));

  return (
    <Screen title={t('title')}>
      <Title>{t('title')}</Title>

      {viewable.length > 0 ? (
        <ScopePicker
          kind={effectiveKind}
          groups={viewable}
          groupId={group?.id}
          members={others}
          memberId={member?.userId}
          onChange={(next) => {
            setKind(next.kind);
            setGroupPick(next.groupId);
            setMemberPick(next.memberId);
          }}
        />
      ) : null}
      {scope.kind !== 'mine' && group ? (
        <Muted role="status">
          {scope.kind === 'team'
            ? t('scope.viewing.team', { group: group.name })
            : t('scope.viewing.member', { name: member?.displayName, group: group.name })}
        </Muted>
      ) : null}

      <SegmentedControl
        label={t('views.label')}
        value={view}
        onChange={setView}
        options={[
          { value: 'month', label: t('views.month') },
          { value: 'week', label: t('views.week') },
          { value: 'day', label: t('views.day') },
        ]}
      />

      <View style={{ gap: tokens.spacing[2] }} className="flex-row items-center">
        <IconButton
          icon="‹"
          label={t(`nav.previous.${view}`)}
          onPress={() => setPicked(shiftDate(view, date, -1))}
        />
        <Subtitle className="flex-1 text-center">{title}</Subtitle>
        <IconButton
          icon="›"
          label={t(`nav.next.${view}`)}
          onPress={() => setPicked(shiftDate(view, date, 1))}
        />
      </View>
      {date !== today ? (
        <Button variant="secondary" label={t('nav.today')} onPress={() => setPicked(null)} />
      ) : null}

      <Filters
        filter={filter}
        areas={areas.data ?? []}
        contexts={contexts.data ?? []}
        onChange={setFilter}
      />

      {occurrences.isError ? (
        <View style={{ gap: tokens.spacing[2] }}>
          <ErrorText>{t('errors.load')}</ErrorText>
          <Button
            variant="secondary"
            label={t('errors.retry')}
            onPress={() => occurrences.refetch()}
          />
        </View>
      ) : null}
      {reach.failed ? (
        <View style={{ gap: tokens.spacing[2] }}>
          <ErrorText>{t('errors.materialize')}</ErrorText>
          <Button
            variant="secondary"
            label={t('errors.retry')}
            loading={reach.retrying}
            onPress={reach.retry}
          />
        </View>
      ) : null}
      {reach.capped ? <Muted role="status">{t('limit', { date: limitDate })}</Muted> : null}
      {occurrences.isPending && ready ? <Muted>{t('loading')}</Muted> : null}

      {view === 'month' ? (
        <>
          <MonthView
            date={date}
            today={today}
            days={days}
            weekStartsOn={weekStartsOn}
            onSelect={setPicked}
          />
          <View style={{ gap: tokens.spacing[3] }}>
            <Subtitle>{capitalize(longDay(date, i18n.language))}</Subtitle>
            <PerfectBanner info={info} />
            {info.items.length === 0 && !occurrences.isError ? (
              <Body>{t('day.empty')}</Body>
            ) : (
              <ItemList items={info.items} actions={actions} />
            )}
            <Button variant="secondary" label={t('day.openDay')} onPress={() => setView('day')} />
            <Button label={t('day.newOnDay')} onPress={() => actions.onCreate(date)} />
          </View>
        </>
      ) : null}

      {view === 'week' ? (
        <WeekView
          date={date}
          today={today}
          days={days}
          weekStartsOn={weekStartsOn}
          actions={actions}
          onOpenDay={(day) => {
            setPicked(day);
            setView('day');
          }}
        />
      ) : null}

      {view === 'day' ? (
        <>
          <DayView date={date} info={days.get(date)} actions={actions} />
          <Button label={t('day.newOnDay')} onPress={() => actions.onCreate(date)} />
        </>
      ) : null}
    </Screen>
  );
}
