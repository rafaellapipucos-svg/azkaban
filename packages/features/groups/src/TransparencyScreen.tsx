import { gamificationRules, privacyController, proofRules } from '@azkaban/config';
import { rankingEnabled } from '@azkaban/core';
import { gamificationRepository, groupsRepository } from '@azkaban/data';
import { useTranslation } from '@azkaban/i18n';
import { Body, Card, Screen, Subtitle, Title } from '@azkaban/ui';
import { useQuery } from '@tanstack/react-query';

// The nine items of ADR-0012, section 7, in order. Each is a title and one or more paragraphs.
const items = [
  ['sees', ['text']],
  ['notSees', ['text']],
  ['members', ['text']],
  ['proof', ['viewers', 'stamp', 'device', 'location', 'admin', 'web', 'retention']],
  ['notifications', ['text']],
  ['whatsapp', ['text']],
  ['ranking', ['text', 'private']],
  ['shopping', ['text']],
  ['deletion', ['text']],
] as const;

/**
 * "What whoever runs the group sees" (ADR-0012, section 7). Readable signed out and before joining:
 * with `groupId` it says what holds in that group (type, ranking), with only `groupType` (the invite
 * preview) what the type starts with, and with neither just the general text.
 */
export function TransparencyScreen({
  groupId,
  groupType,
}: {
  groupId?: string;
  groupType?: string;
}) {
  const { t } = useTranslation('groups');
  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: groupsRepository.listMine,
    enabled: !!groupId,
  });
  const settings = useQuery({
    queryKey: ['group-settings', groupId],
    queryFn: () => gamificationRepository.getGroupSettings(groupId ?? ''),
    enabled: !!groupId,
  });
  const group = groupId ? groups.data?.find(({ id }) => id === groupId) : undefined;
  const type = group?.type ?? (groupId ? undefined : groupType);
  const defaults = gamificationRules.ranking.defaultEnabledByGroupType;
  const typeLabel = type && t(`types.${type}`, { defaultValue: type });

  return (
    <Screen title={t('transparency.title')}>
      <Title>{t('transparency.title')}</Title>
      <Body>{t('transparency.intro')}</Body>
      {type ? (
        <Card>
          <Subtitle>{t('transparency.here')}</Subtitle>
          <Body>{t('transparency.type', { type: typeLabel })}</Body>
          {group && settings.isSuccess ? (
            <Body>
              {rankingEnabled({ type: group.type, settings: settings.data }, defaults)
                ? t('transparency.rankingOn')
                : t('transparency.rankingOff')}
            </Body>
          ) : !groupId ? (
            <Body>
              {rankingEnabled({ type }, defaults)
                ? t('transparency.rankingDefaultOn', { type: typeLabel })
                : t('transparency.rankingDefaultOff', { type: typeLabel })}
            </Body>
          ) : null}
        </Card>
      ) : null}
      {items.map(([item, paragraphs]) => (
        <Card key={item}>
          <Subtitle>{t(`transparency.${item}.title`)}</Subtitle>
          {paragraphs.map((paragraph) => (
            <Body key={paragraph}>
              {t(`transparency.${item}.${paragraph}`, {
                days: proofRules.retentionDays,
                recordDays: proofRules.recordRetentionDays,
              })}
            </Body>
          ))}
        </Card>
      ))}
      {/* Who answers for the data (BL-27): outside the nine items, so no heading of its own. */}
      <Card>
        <Body>
          {t('transparency.controller.text', {
            name: privacyController.name,
            email: privacyController.contactEmail,
          })}
        </Body>
        <Body>{t('transparency.controller.legalBasis')}</Body>
      </Card>
    </Screen>
  );
}
