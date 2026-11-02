import {
  addDays,
  can,
  dayTone,
  localDateOf,
  teamOverview,
  weekDays,
  type DayCounts,
  type MemberOverview,
  type TeamTone,
} from '@azkaban/core';
import { groupsRepository, tasksRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  EmptyState,
  ErrorText,
  IconButton,
  Muted,
  Screen,
  Subtitle,
  Title,
  tokens,
} from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { tasksConfig } from './config';
import { useNow } from './hooks';

// Never color alone: each tone has a symbol and a word, as the status controls do.
const toneLook: Record<TeamTone, { symbol: string; box: string; text: string }> = {
  green: { symbol: '✓', box: 'bg-done', text: 'text-onDone' },
  yellow: { symbol: '~', box: 'bg-partial', text: 'text-onPartial' },
  red: { symbol: '✗', box: 'bg-missed', text: 'text-onMissed' },
  none: {
    symbol: '•',
    box: 'bg-pending dark:bg-pending-dark',
    text: 'text-onPending dark:text-onPending-dark',
  },
};

const percent = (rate: number) => Math.round(rate * 100);
const noCounts: DayCounts = { pending: 0, done: 0, partial: 0, missed: 0, late: 0 };
const totalOf = (counts: DayCounts) =>
  counts.pending + counts.done + counts.partial + counts.missed;

function dayName(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function dayMonth(date: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function MemberCard({
  member,
  days,
  today,
  isSelf,
  onOpen,
}: {
  member: MemberOverview;
  days: string[];
  today: string;
  isSelf: boolean;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation('tasks');
  const rate = toneLook[member.tone];
  const rateText =
    member.rate === null
      ? t('team.rate.none')
      : t('team.rateValue', {
          label: t(`team.rate.${member.tone}`),
          percent: percent(member.rate),
        });
  const name = isSelf ? `${member.displayName} ${t('team.you')}` : member.displayName;

  const cells = days.map((date) => {
    const counts = member.days.get(date) ?? noCounts;
    const tone = dayTone(counts);
    const total = totalOf(counts);
    return { date, counts, tone, total };
  });
  const spoken = cells
    .filter(({ total }) => total > 0)
    .map(({ date, counts, tone, total }) =>
      t('team.daySpoken', {
        day: dayName(date, i18n.language),
        tone: t(`team.dayTone.${tone}`),
        done: counts.done,
        total,
      }),
    )
    .join('; ');

  return (
    <Pressable
      role="button"
      aria-label={t('team.memberSpoken', {
        name,
        rate: rateText,
        days: spoken || t('team.noTasksInWeek'),
      })}
      onPress={onOpen}
      style={{ gap: tokens.spacing[3] }}
      className="rounded-lg border-2 border-border bg-surface p-3 active:opacity-70 dark:border-border-dark dark:bg-surface-dark"
    >
      <View
        aria-hidden
        style={{ gap: tokens.spacing[2], minHeight: tokens.sizes.touch }}
        className="flex-row flex-wrap items-center justify-between"
      >
        <Text className="font-heavy text-md text-text dark:text-text-dark">{name}</Text>
        <View
          style={{ gap: tokens.spacing[1] }}
          className={`min-h-8 flex-row items-center rounded-full px-3 ${rate.box}`}
        >
          <Text className={`font-heavy text-md ${rate.text}`}>{rate.symbol}</Text>
          <Text className={`font-body text-sm ${rate.text}`}>{rateText}</Text>
        </View>
      </View>
      <View aria-hidden style={{ gap: tokens.spacing[1] }} className="flex-row">
        {cells.map(({ date, tone, total, counts }) => {
          const look = toneLook[tone];
          return (
            <View
              key={date}
              style={{ gap: tokens.spacing[1] }}
              className={`flex-1 items-center rounded-md border-2 py-1 ${
                date === today
                  ? 'border-primary dark:border-primary-light'
                  : 'border-border dark:border-border-dark'
              }`}
            >
              <Text className="font-body text-sm text-muted dark:text-muted-dark">
                {dayName(date, i18n.language)}
              </Text>
              <View
                style={{ width: tokens.spacing[6], height: tokens.spacing[6] }}
                className={`items-center justify-center rounded-full ${total > 0 ? look.box : ''}`}
              >
                <Text className={`font-heavy text-md ${total > 0 ? look.text : 'text-muted'}`}>
                  {total > 0 ? look.symbol : '–'}
                </Text>
              </View>
              <Text className="font-heavy text-sm text-text dark:text-text-dark">
                {total > 0 ? `${counts.done}/${total}` : ' '}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

/**
 * The team view of a group: each member's week, day by day, and their completion rate. Only for
 * people with `task.view_group` in that group; the database refuses everyone else too. `children`
 * are entry points of other modules, composed by the route (ADR-0006).
 */
export function TeamScreen({ groupId, children }: { groupId: string; children?: ReactNode }) {
  const { t, i18n } = useTranslation('tasks');
  const router = useRouter();
  const now = useNow();
  const { user, groups, timezone, ready } = useCurrentUser();
  const group = groups.find(({ id }) => id === groupId);
  const allowed = group !== undefined && can(user, 'task.view_group', group);
  const today = localDateOf(timezone, now.getTime());
  const [picked, setPicked] = useState<string | null>(null);
  const anchor = picked ?? today;
  const days = weekDays(anchor, tasksConfig.team.weekStartsOn);
  const first = days[0]!;
  const last = days[6]!;

  const members = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => groupsRepository.listMembers(groupId),
    enabled: allowed,
  });
  const overview = useQuery({
    queryKey: ['team-overview', groupId, first, last, timezone],
    // The days are counted in the viewer's zone (ADR-0006 section 1), so wait for the profile.
    queryFn: () => tasksRepository.teamOverview({ groupId, from: first, to: last, timezone }),
    enabled: allowed && ready,
  });
  const list = useMemo(
    () =>
      teamOverview(overview.data ?? [], members.data ?? [], {
        today,
        bands: tasksConfig.team.bands,
      }),
    [overview.data, members.data, today],
  );

  if (!ready) return <Screen title={t('team.title')}>{null}</Screen>;
  if (!allowed) {
    return (
      <Screen title={t('team.title')}>
        <EmptyState text={t('team.forbidden')} />
      </Screen>
    );
  }

  const openMember = (member: MemberOverview) =>
    router.push({
      pathname: '/calendar',
      params:
        member.userId === user.id
          ? { view: 'week', date: first }
          : { scope: 'member', group: groupId, member: member.userId, view: 'week', date: first },
    });

  return (
    <Screen title={t('team.title')}>
      <View>
        <Title>{t('team.title')}</Title>
        <Muted>{group.name}</Muted>
      </View>
      {children}

      <View style={{ gap: tokens.spacing[2] }} className="flex-row items-center">
        <IconButton
          icon="‹"
          label={t('team.previousWeek')}
          onPress={() => setPicked(addDays(anchor, -7))}
        />
        <Subtitle className="flex-1 text-center">
          {t('team.range', {
            from: dayMonth(first, i18n.language),
            to: dayMonth(last, i18n.language),
          })}
        </Subtitle>
        <IconButton
          icon="›"
          label={t('team.nextWeek')}
          onPress={() => setPicked(addDays(anchor, 7))}
        />
      </View>
      {picked !== null && picked !== today ? (
        <Button variant="secondary" label={t('team.thisWeek')} onPress={() => setPicked(null)} />
      ) : null}

      {overview.isError || members.isError ? <ErrorText>{t('team.loadError')}</ErrorText> : null}
      {overview.isPending || members.isPending ? <Muted>{t('loading')}</Muted> : null}
      {members.isSuccess && list.length === 0 ? <Body>{t('team.noMembers')}</Body> : null}

      {list.map((member) => (
        <MemberCard
          key={member.userId}
          member={member}
          days={days}
          today={today}
          isSelf={member.userId === user.id}
          onOpen={() => openMember(member)}
        />
      ))}
      <Muted className="text-sm">{t('team.hint')}</Muted>
    </Screen>
  );
}
