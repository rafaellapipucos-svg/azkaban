import { contextsRepository, groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Button, Card, Chip, ChipRow, EmptyState, Muted, Screen, Subtitle } from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

const ALL = 'all';

export function AreasScreen() {
  const { t } = useTranslation('contexts');
  const router = useRouter();
  const areas = useQuery({ queryKey: ['areas'], queryFn: contextsRepository.listAreas });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: contextsRepository.list });
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsRepository.listMine });
  const [areaId, setAreaId] = useState<string>();
  const [contextId, setContextId] = useState(ALL);

  const area = areas.data?.find(({ id }) => id === areaId) ?? areas.data?.[0];
  const areaContexts = contexts.data?.filter((context) => context.areaId === area?.id) ?? [];
  const visible = areaContexts.filter(({ id }) => contextId === ALL || id === contextId);

  return (
    <Screen title={t('list.title')}>
      <ChipRow label={t('list.areaLabel')}>
        {areas.data?.map((item) => (
          <Chip
            key={item.id}
            label={`${item.icon} ${t(item.i18nKey)}`}
            colorToken={item.colorToken}
            selected={item.id === area?.id}
            onPress={() => {
              setAreaId(item.id);
              setContextId(ALL);
            }}
          />
        ))}
      </ChipRow>

      {areaContexts.length > 0 ? (
        <ChipRow label={t('list.contextLabel')}>
          <Chip
            label={t('list.all')}
            selected={contextId === ALL}
            onPress={() => setContextId(ALL)}
          />
          {areaContexts.map((context) => (
            <Chip
              key={context.id}
              label={context.name}
              colorToken={context.colorToken}
              selected={context.id === contextId}
              onPress={() => setContextId(context.id)}
            />
          ))}
        </ChipRow>
      ) : (
        contexts.isSuccess && <EmptyState text={t('list.empty')} />
      )}

      {visible.map((context) => {
        const group = groups.data?.find(({ id }) => id === context.groupId);
        return (
          <Card key={context.id} onPress={() => router.push(`/contexts/${context.id}`)}>
            <View className="flex-row items-center gap-3">
              <Text aria-hidden className="text-lg">
                {context.icon}
              </Text>
              <View className="shrink">
                <Subtitle>{context.name}</Subtitle>
                <Muted>{group ? t('list.group', { name: group.name }) : t('list.personal')}</Muted>
              </View>
            </View>
          </Card>
        );
      })}

      <Button
        label={t('list.new')}
        onPress={() =>
          router.push({ pathname: '/contexts/new', params: area ? { area: area.id } : {} })
        }
      />
    </Screen>
  );
}
