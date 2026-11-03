import { gamificationRules } from '@azkaban/config';
import { can, rankingEnabled } from '@azkaban/core';
import { useCurrentUser } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, Card, ErrorText, Muted, Subtitle, SwitchRow } from '@azkaban/ui';
import { View } from 'react-native';
import { useGroupSettings, useRanking } from './hooks';
import { RankingError } from './source';

/**
 * The weekly ranking of a group and, for whoever has `group.update`, the switch that turns it on
 * (ADR-0010, section 6). Mounted by the route inside GroupDetailScreen, through `children`. Off is a
 * state explained to the member, not an error.
 */
export function GroupRanking({ groupId }: { groupId: string }) {
  const { t } = useTranslation('gamification');
  const { user, groups } = useCurrentUser();
  const group = groups.find((g) => g.id === groupId);
  const { settings, setRanking } = useGroupSettings(groupId);
  const on =
    !!group &&
    settings.isSuccess &&
    rankingEnabled(
      { type: group.type, settings: settings.data },
      gamificationRules.ranking.defaultEnabledByGroupType,
    );
  const ranking = useRanking(groupId, on);

  if (!group || !settings.isSuccess) return null;
  const errorCode = ranking.error instanceof RankingError ? ranking.error.code : null;

  return (
    <Card>
      <Subtitle>{t('ranking.title')}</Subtitle>
      {can(user, 'group.update', group) ? (
        <SwitchRow
          label={t('ranking.toggle')}
          description={t('ranking.toggleHint')}
          value={on}
          disabled={setRanking.isPending}
          onValueChange={(enabled) => setRanking.mutate(enabled)}
        />
      ) : null}
      {setRanking.isError ? <ErrorText>{t('ranking.saveError')}</ErrorText> : null}
      {!on || errorCode === 'ranking_disabled' ? (
        <Muted>{t('ranking.disabled')}</Muted>
      ) : errorCode === 'forbidden' ? (
        <Muted>{t('ranking.forbidden')}</Muted>
      ) : ranking.isError ? (
        <ErrorText>{t('ranking.loadError')}</ErrorText>
      ) : ranking.data?.length === 0 ? (
        <Muted>{t('ranking.empty')}</Muted>
      ) : ranking.data ? (
        <View role="list">
          {ranking.data.map((row) => (
            <View key={row.userId} role="listitem" className="flex-row items-center gap-3 py-2">
              <Body className="w-8 font-heavy">{t('ranking.rank', { rank: row.rank })}</Body>
              <Body className="flex-1">{row.displayName}</Body>
              <Muted>{t('ranking.xp', { xp: row.xp })}</Muted>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
