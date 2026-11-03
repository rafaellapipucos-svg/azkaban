import { Text, View } from 'react-native';
import { sizes } from './tokens';

type Props = {
  /** The emoji from the seed (`achievements.icon`). */
  icon: string;
  title: string;
  description?: string;
  unlocked: boolean;
  /** Visible state, never color alone: "Concedida em 3/11" or "Bloqueada". */
  stateLabel: string;
};

// Locked is told apart three ways besides color: a lock mark, a dashed faded circle and the state text.
export function AchievementBadge({ icon, title, description, unlocked, stateLabel }: Props) {
  return (
    <View style={{ minHeight: sizes.touch }} className="flex-row items-center gap-3">
      <View
        aria-hidden
        style={{ width: sizes.achievement, height: sizes.achievement }}
        className={`items-center justify-center rounded-full border-2 ${
          unlocked
            ? 'border-primary bg-primary-light'
            : 'border-dashed border-muted bg-pending dark:border-muted-dark dark:bg-pending-dark'
        }`}
      >
        <Text className={`text-xl ${unlocked ? '' : 'opacity-40'}`}>{icon}</Text>
        <View
          style={{ width: sizes.cornerBadge, height: sizes.cornerBadge }}
          className={`absolute -bottom-1 -right-1 items-center justify-center rounded-full border-2 border-surface dark:border-surface-dark ${
            unlocked ? 'bg-done' : 'bg-cancelled'
          }`}
        >
          <Text className="font-heavy text-sm text-onDone">{unlocked ? '✓' : '🔒'}</Text>
        </View>
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-heavy text-md text-text dark:text-text-dark">{title}</Text>
        <Text className="font-body text-sm text-muted dark:text-muted-dark">{stateLabel}</Text>
        {description ? (
          <Text className="font-body text-sm text-text dark:text-text-dark">{description}</Text>
        ) : null}
      </View>
    </View>
  );
}
