import type { GroupMember } from '@azkaban/contracts';
import { useTranslation } from '@azkaban/i18n';
import { Body, Chip, ChipRow, Muted } from '@azkaban/ui';
import { View } from 'react-native';

type Props = {
  members: readonly GroupMember[];
  userId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Creating can pick several people, one task each; editing moves the task to one person. */
  multiple: boolean;
};

export function AssigneePicker({ members, userId, value, onChange, multiple }: Props) {
  const { t } = useTranslation('tasks');
  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    const next = value.includes(id) ? value.filter((other) => other !== id) : [...value, id];
    // A task with nobody to do it is not a task.
    if (next.length > 0) onChange(next);
  };
  return (
    <View className="gap-2">
      <Body>{t('form.assignees')}</Body>
      <ChipRow label={t('form.assignees')} multiple={multiple}>
        {members.map((member) => (
          <Chip
            key={member.userId}
            label={member.userId === userId ? t('form.me') : member.displayName}
            selected={value.includes(member.userId)}
            multiple={multiple}
            onPress={() => toggle(member.userId)}
          />
        ))}
      </ChipRow>
      {multiple && value.length > 1 ? (
        <Muted>{t('form.batchHint', { count: value.length })}</Muted>
      ) : null}
    </View>
  );
}
