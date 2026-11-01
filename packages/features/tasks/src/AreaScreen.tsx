import { can, localDateOf, planArea } from '@azkaban/core';
import { contextsRepository, useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorText,
  Muted,
  Body,
  Screen,
  SegmentedControl,
  Title,
  tokens,
} from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { tasksConfig } from './config';
import { dayLabel, errorKey } from './format';
import { useLastContext, useNotice, useOccurrenceLists, useStatusChange } from './hooks';
import { OccurrenceRow } from './OccurrenceRow';
import { QuickCreate } from './QuickCreate';
import { Section } from './Sections';

const ALL = 'all';

/** One area's tab: sub-tabs by context plus "Todos", and the tasks ahead day by day. */
export function AreaScreen({ areaKey }: { areaKey: string }) {
  const { t, i18n } = useTranslation('tasks');
  const router = useRouter();
  const { user, groups } = useCurrentUser();
  const areas = useQuery({ queryKey: ['areas'], queryFn: contextsRepository.listAreas });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const { lastContextId } = useLastContext();
  const status = useStatusChange();
  const [contextId, setContextId] = useState(ALL);
  const [scope, setScope] = useState<'mine' | 'group'>('mine');
  const [created, showCreated] = useNotice();

  const area = areas.data?.find(({ key }) => key === areaKey);
  const areaContexts = (contexts.data ?? []).filter(({ areaId }) => areaId === area?.id);
  // Only people who can see the group's tasks have anything more to look at.
  const seesGroup = groups.some(({ id }) => can(user, 'task.view_group', { id }));
  const { items, now, timezone, loading, failed } = useOccurrenceLists({
    days: tasksConfig.areaWindowDays,
    mineOnly: scope === 'mine',
  });

  const plan = useMemo(
    () =>
      planArea(
        items.filter(
          (item) =>
            item.areaId === area?.id && (contextId === ALL || item.task.contextId === contextId),
        ),
        { now, timezone },
      ),
    [items, area?.id, contextId, now, timezone],
  );

  if (!area) return <Screen>{null}</Screen>;

  const today = localDateOf(timezone, now.getTime());
  const actions = {
    change: status.change,
    open: (item: { id: string }) => router.push(`/tasks/${item.id}`),
  };
  const rows = (list: typeof plan.overdue) =>
    list.map((item) => {
      const context = areaContexts.find(({ id }) => id === item.task.contextId);
      return (
        <OccurrenceRow
          key={item.id}
          item={item}
          timezone={timezone}
          now={now}
          actions={actions}
          contextLabel={
            contextId === ALL && context ? `${context.icon} ${context.name}` : undefined
          }
        />
      );
    });
  const startContext =
    contextId !== ALL
      ? contextId
      : (areaContexts.find(({ id }) => id === lastContextId)?.id ?? areaContexts[0]?.id);
  const empty = plan.overdue.length === 0 && plan.days.length === 0;

  return (
    <View className="flex-1">
      <Screen>
        <Title>{`${area.icon} ${t(area.i18nKey, { ns: 'contexts' })}`}</Title>

        {areaContexts.length > 0 ? (
          <ChipRow label={t('area.contextLabel')}>
            <Chip
              label={t('area.all')}
              selected={contextId === ALL}
              onPress={() => setContextId(ALL)}
            />
            {areaContexts.map((context) => (
              <Chip
                key={context.id}
                label={`${context.icon} ${context.name}`}
                colorToken={context.colorToken}
                selected={context.id === contextId}
                onPress={() => setContextId(context.id)}
              />
            ))}
          </ChipRow>
        ) : null}

        {seesGroup ? (
          <SegmentedControl
            label={t('area.scopeLabel')}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: t('area.mine') },
              { value: 'group', label: t('area.group') },
            ]}
          />
        ) : null}

        {created ? <Body role="status">{t('today.created')}</Body> : null}
        {status.error ? <ErrorText>{t(errorKey(status.error))}</ErrorText> : null}
        {failed ? <ErrorText>{t('errors.load')}</ErrorText> : null}

        {contexts.isSuccess && areaContexts.length === 0 ? (
          <EmptyState text={t('area.noContexts')}>
            <Button
              label={t('today.newContext')}
              onPress={() => router.push({ pathname: '/contexts/new', params: { area: area.id } })}
            />
          </EmptyState>
        ) : loading ? (
          <Muted>{t('loading')}</Muted>
        ) : empty ? (
          <EmptyState mood="happy" text={t('area.empty')} />
        ) : null}

        {plan.overdue.length > 0 ? (
          <Section title={t('today.overdue')} danger>
            {rows(plan.overdue)}
          </Section>
        ) : null}
        {plan.days.map((day) => (
          <Section key={day.date} title={dayLabel(day.date, today, t, i18n.language)}>
            {rows(day.items)}
          </Section>
        ))}

        <Button
          variant="secondary"
          label={t('area.manageContexts')}
          onPress={() => router.push('/contexts')}
        />
        <View style={{ height: tokens.sizes.fab + tokens.spacing[4] }} />
      </Screen>
      <QuickCreate contextId={startContext} onCreated={showCreated} />
    </View>
  );
}
