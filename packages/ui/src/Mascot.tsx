import { useTranslation } from '@azkaban/i18n';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { mascotColors as c } from './tokens';

export type MascotMood = 'happy' | 'celebrating' | 'worried' | 'sleeping';

const mouths: Record<MascotMood, string> = {
  happy: 'M50 70 Q60 80 70 70',
  celebrating: 'M46 66 Q60 88 74 66 Z',
  worried: 'M50 76 Q60 68 70 76',
  sleeping: 'M54 74 Q60 77 66 74',
};

// Broto: an original sprout-headed seedling, because the app is about things growing day by day.
export function Mascot({ mood = 'happy', size = 120 }: { mood?: MascotMood; size?: number }) {
  const { t } = useTranslation();
  const closedEyes = mood === 'sleeping';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={t(`mascot.${mood}`)}
    >
      <Path d="M60 26 Q58 12 44 8 Q44 24 60 26 Z" fill={c.leaf} />
      <Path d="M60 26 Q62 14 78 12 Q76 26 60 26 Z" fill={c.leaf} />
      <Ellipse cx="60" cy="68" rx="42" ry="44" fill={c.body} />
      <Ellipse cx="60" cy="84" rx="26" ry="24" fill={c.belly} />
      {closedEyes ? (
        <G stroke={c.ink} strokeWidth="4" strokeLinecap="round" fill="none">
          <Path d="M36 56 Q42 62 48 56" />
          <Path d="M72 56 Q78 62 84 56" />
        </G>
      ) : (
        <G>
          <Circle cx="42" cy="56" r="11" fill="#FFFFFF" />
          <Circle cx="78" cy="56" r="11" fill="#FFFFFF" />
          <Circle cx="44" cy={mood === 'worried' ? 60 : 56} r="6" fill={c.ink} />
          <Circle cx="80" cy={mood === 'worried' ? 60 : 56} r="6" fill={c.ink} />
        </G>
      )}
      <Circle cx="28" cy="70" r="6" fill={c.blush} opacity={0.7} />
      <Circle cx="92" cy="70" r="6" fill={c.blush} opacity={0.7} />
      <Path
        d={mouths[mood]}
        stroke={c.ink}
        strokeWidth="4"
        strokeLinecap="round"
        fill={mood === 'celebrating' ? c.ink : 'none'}
      />
    </Svg>
  );
}
