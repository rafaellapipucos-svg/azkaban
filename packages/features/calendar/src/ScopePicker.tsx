import type { Group, GroupMember } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { Chip, ChipRow, Muted, SegmentedControl, tokens } from '@azkaban/ui';
import { View } from 'react-native';

export type ScopeKind = 'mine' | 'member' | 'team';

type Props = {
  kind: ScopeKind;
  /** Only groups where the user has `task.view_group`. */
  groups: readonly Group[];
  groupId: string | undefined;
  /** Everyone in the chosen group but the user. */
  members: readonly GroupMember[];
  memberId: string | undefined;
  onChange: (next: { kind: ScopeKind; groupId?: string; memberId?: string }) => void;
};

/**
 * "Meu calendário", "calendário de [membro]" or "time inteiro". Rendered only for people who can
 * see at least one group's tasks, with the groups where they can; the database filters the data.
 */
export function ScopePicker({ kind, groups, groupId, members, memberId, onChange }: Props) {
  const { t } = useTranslation('calendar');
  return (
    <View style={{ gap: tokens.spacing[3] }}>
      <SegmentedControl
        label={t('scope.label')}
        value={kind}
        onChange={(next) => onChange({ kind: next, groupId, memberId })}
        options={[
          { value: 'mine', label: t('scope.mine') },
          { value: 'member', label: t('scope.member') },
          { value: 'team', label: t('scope.team') },
        ]}
      />
      {kind !== 'mine' && groups.length > 1 ? (
        <ChipRow label={t('scope.groupLabel')}>
          {groups.map((group) => (
            <Chip
              key={group.id}
              label={group.name}
              selected={group.id === groupId}
              onPress={() => onChange({ kind, groupId: group.id, memberId: undefined })}
            />
          ))}
        </ChipRow>
      ) : null}
      {kind === 'member' ? (
        members.length > 0 ? (
          <ChipRow label={t('scope.memberLabel')}>
            {members.map((member) => (
              <Chip
                key={member.userId}
                label={member.displayName}
                selected={member.userId === memberId}
                onPress={() => onChange({ kind, groupId, memberId: member.userId })}
              />
            ))}
          </ChipRow>
        ) : (
          <Muted>{t('scope.noMembers')}</Muted>
        )
      ) : null}
    </View>
  );
}
