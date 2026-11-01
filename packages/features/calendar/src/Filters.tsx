import type { Area, Context } from '@azkaban/contracts';
import { calendarStatuses, noFilter, type CalendarFilter } from '@azkaban/core';
import { useTranslation } from '@azkaban/i18n';
import { Button, Chip, ChipRow, tokens } from '@azkaban/ui';
import { useState } from 'react';
import { View } from 'react-native';

type Props = {
  filter: CalendarFilter;
  areas: readonly Area[];
  contexts: readonly Context[];
  onChange: (filter: CalendarFilter) => void;
};

/** Area, context and status, behind one button so they do not push the calendar off the screen. */
export function Filters({ filter, areas, contexts, onChange }: Props) {
  const { t } = useTranslation('calendar');
  const [open, setOpen] = useState(false);
  const active = [filter.areaId, filter.contextId, filter.status].filter(Boolean).length;
  const shownContexts = contexts.filter(
    ({ areaId }) => filter.areaId === null || areaId === filter.areaId,
  );

  return (
    <View style={{ gap: tokens.spacing[3] }}>
      <Button
        variant="secondary"
        label={active > 0 ? t('filters.toggleActive', { count: active }) : t('filters.toggle')}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        <View style={{ gap: tokens.spacing[3] }}>
          <ChipRow label={t('filters.area')}>
            <Chip
              label={t('filters.allAreas')}
              selected={filter.areaId === null}
              onPress={() => onChange({ ...filter, areaId: null, contextId: null })}
            />
            {areas.map((area) => (
              <Chip
                key={area.id}
                label={`${area.icon} ${t(area.i18nKey, { ns: 'contexts' })}`}
                selected={filter.areaId === area.id}
                onPress={() => onChange({ ...filter, areaId: area.id, contextId: null })}
              />
            ))}
          </ChipRow>
          <ChipRow label={t('filters.context')}>
            <Chip
              label={t('filters.allContexts')}
              selected={filter.contextId === null}
              onPress={() => onChange({ ...filter, contextId: null })}
            />
            {shownContexts.map((context) => (
              <Chip
                key={context.id}
                label={`${context.icon} ${context.name}`}
                colorToken={context.colorToken}
                selected={filter.contextId === context.id}
                onPress={() => onChange({ ...filter, contextId: context.id })}
              />
            ))}
          </ChipRow>
          <ChipRow label={t('filters.status')}>
            <Chip
              label={t('filters.allStatuses')}
              selected={filter.status === null}
              onPress={() => onChange({ ...filter, status: null })}
            />
            {calendarStatuses.map((status) => (
              <Chip
                key={status}
                label={t(`status.${status}`, { ns: 'common' })}
                selected={filter.status === status}
                onPress={() => onChange({ ...filter, status })}
              />
            ))}
          </ChipRow>
          {active > 0 ? (
            <Button
              variant="secondary"
              label={t('filters.clear')}
              onPress={() => onChange(noFilter)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
