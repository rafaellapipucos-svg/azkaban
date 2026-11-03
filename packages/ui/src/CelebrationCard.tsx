import type { CelebrationKind } from '@azkaban/contracts';
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Button } from './Button';
import { celebrationLook } from './celebration';
import { Confetti } from './Confetti';
import { Mascot } from './Mascot';
import { Body, Muted, Subtitle } from './Text';
import { sizes } from './tokens';

type Props = {
  /** Picks the mascot and the confetti. `perfect_day` has its own screen, PerfectDayScreen. */
  kind: CelebrationKind;
  title: string;
  detail?: string;
  /** The smaller celebrations that came in the same burst, one line each. */
  others?: string[];
  closeLabel: string;
  onClose: () => void;
};

/**
 * A celebration the screen reader announces when it appears. Mount a new one (or change its `key`)
 * for each celebration: the announcement and the animations run on mount.
 */
export function CelebrationCard({ kind, title, detail, others, closeLabel, onClose }: Props) {
  const look = celebrationLook(kind);
  // role="alert" announces it on the web; iOS and Android need the explicit call (a no-op on the web).
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility([title, detail].filter(Boolean).join('. '));
  }, [title, detail]);
  return (
    <View
      role="alert"
      className="items-center gap-3 overflow-hidden rounded-lg border-2 border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
    >
      {look.confetti ? <Confetti /> : null}
      <Mascot mood={look.mood} size={sizes.mascotSmall} animate />
      <Subtitle className="text-center">{title}</Subtitle>
      {detail ? <Body className="text-center">{detail}</Body> : null}
      {others?.map((line) => (
        <Muted key={line} className="text-center">
          {line}
        </Muted>
      ))}
      <View className="self-stretch">
        <Button label={closeLabel} onPress={onClose} />
      </View>
    </View>
  );
}
