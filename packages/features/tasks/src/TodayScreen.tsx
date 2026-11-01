import { taskRules } from '@azkaban/config';
import { earnedXp, planToday } from '@azkaban/core';
import { contextsRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Body,
  Button,
  EmptyState,
  ErrorText,
  Muted,
  ProgressRing,
  Screen,
  Title,
  tokens,
} from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { tasksConfig } from './config';
import { capitalize, errorKey } from './format';
import { useNotice, useOccurrenceLists, useStatusChange } from './hooks';
import { QuickCreate } from './QuickCreate';
import { ContextGroups, Section } from './Sections';

/** The start screen: everything of the day across areas, grouped by context. */
export function TodayScreen() {
  const { t, i18n } = useTranslation('tasks');
  const router = useRouter();
  const { user } = useCurrentUser();
  const { items, now, timezone, loading, failed } = useOccurrenceLists({
    days: 1 + tasksConfig.dueSoonDays,
    mineOnly: true,
  });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const status = useStatusChange();
  const [created, showCreated] = useNotice();

  const plan = useMemo(
    () => planToday(items, { now, timezone, dueSoonDays: tasksConfig.dueSoonDays }),
    [items, now, timezone],
  );
  const xp = earnedXp(plan.today, user.id, taskRules.xp);
  const actions = {
    change: status.change,
    open: (item: { id: string }) => router.push(`/tasks/${item.id}`),
  };
  const list = contexts.data ?? [];
  const common = { contexts: list, timezone, now, actions };
  const empty = plan.overdue.length + plan.today.length + plan.soon.length === 0;
  const dateText = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(now);

  return (
    <View className="flex-1">
      <Screen>
        <View>
          <Title>{t('today.title')}</Title>
          <Muted>{capitalize(dateText)}</Muted>
        </View>

        <View
          style={{ gap: tokens.spacing[4] }}
          className="flex-row items-center rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
        >
          <ProgressRing
            progress={plan.goal.total === 0 ? 0 : plan.goal.done / plan.goal.total}
            label={t('today.goal')}
            valueText={t('today.goalValue', plan.goal)}
          />
          <View className="flex-1" style={{ gap: tokens.spacing[1] }}>
            <Body className="font-heavy">{t('today.goal')}</Body>
            <Muted>{t('today.goalHint')}</Muted>
            <Text className="font-heavy text-md text-primary dark:text-primary-light">
              <Text aria-hidden>⭐ </Text>
              {t('today.xp', { count: xp })}
            </Text>
          </View>
        </View>

        {created ? <Body role="status">{t('today.created')}</Body> : null}
        {status.error ? <ErrorText>{t(errorKey(status.error))}</ErrorText> : null}
        {failed ? <ErrorText>{t('errors.load')}</ErrorText> : null}

        {contexts.isSuccess && list.length === 0 ? (
          <EmptyState text={t('today.noContext')}>
            <Button label={t('today.newContext')} onPress={() => router.push('/contexts/new')} />
          </EmptyState>
        ) : loading ? (
          <Muted>{t('loading')}</Muted>
        ) : empty ? (
          <EmptyState mood="happy" text={t('today.empty')} />
        ) : null}

        {plan.overdue.length > 0 ? (
          <Section title={t('today.overdue')} danger>
            <ContextGroups items={plan.overdue} {...common} />
          </Section>
        ) : null}
        {plan.today.length > 0 ? (
          <Section title={t('today.planned')}>
            <ContextGroups items={plan.today} {...common} />
          </Section>
        ) : null}
        {plan.soon.length > 0 ? (
          <Section title={t('today.soon')}>
            <ContextGroups items={plan.soon} {...common} />
          </Section>
        ) : null}
        <View style={{ height: tokens.sizes.fab + tokens.spacing[4] }} />
      </Screen>
      <QuickCreate onCreated={showCreated} />
    </View>
  );
}
