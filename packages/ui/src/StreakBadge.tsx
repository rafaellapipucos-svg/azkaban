import { activateOnSpace } from '@azkaban/platform';
import { Pressable, Text, View } from 'react-native';
import { sizes } from './tokens';

type Props = {
  days: number;
  /** Spoken name of the whole badge: "5 dias de ofensiva". */
  label: string;
  /** Freezes available. Shown as a shield and its count, `label` is spoken: "2 proteções". */
  protection?: { count: number; label: string };
  /** For a header slot that opens the details. */
  onPress?: () => void;
};

/** Fire and the streak, plus a shield when freezes are available. At 0 days the fire fades. */
export function StreakBadge({ days, label, protection, onPress }: Props) {
  const spoken = protection ? `${label}, ${protection.label}` : label;
  const content = (
    <>
      <Text aria-hidden className={`text-lg ${days === 0 ? 'opacity-40' : ''}`}>
        🔥
      </Text>
      <Text aria-hidden className="font-heavy text-md text-text dark:text-text-dark">
        {days}
      </Text>
      {protection ? (
        <>
          <Text aria-hidden className="ml-1 text-md">
            🛡️
          </Text>
          <Text aria-hidden className="font-heavy text-md text-text dark:text-text-dark">
            {protection.count}
          </Text>
        </>
      ) : null}
    </>
  );
  const box =
    'flex-row items-center gap-1 self-start rounded-full border-2 border-border bg-surface px-3 dark:border-border-dark dark:bg-surface-dark';
  return onPress ? (
    <Pressable
      role="button"
      aria-label={spoken}
      onPress={onPress}
      {...activateOnSpace(onPress)}
      style={{ minHeight: sizes.touch, minWidth: sizes.touch }}
      className={`${box} active:opacity-70`}
    >
      {content}
    </Pressable>
  ) : (
    <View role="img" aria-label={spoken} style={{ minHeight: sizes.touch }} className={box}>
      {content}
    </View>
  );
}
