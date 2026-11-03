import { useTranslation } from '@azkaban/i18n';
import { View } from 'react-native';
import { IconButton } from './IconButton';
import { Body } from './Text';
import { sizes, spacing } from './tokens';

type Props = {
  /** What is being counted, read by screen readers: "Repetir a cada". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Smallest allowed value. A recurrence interval of 0 makes no sense, so the default is 1. */
  min?: number;
  max?: number;
  step?: number;
  /** Text for the current value, e.g. `(n) => `${n} dias``. Defaults to the number. */
  format?: (value: number) => string;
};

export function Stepper({ label, value, onChange, min = 1, max, step = 1, format }: Props) {
  const { t } = useTranslation('ui');
  const text = format ? format(value) : String(value);
  return (
    <View
      role="group"
      aria-label={label}
      style={{ gap: spacing[3] }}
      className="flex-row items-center"
    >
      <IconButton
        icon="−"
        label={t('stepper.decrease', { label })}
        disabled={value - step < min}
        onPress={() => onChange(Math.max(min, value - step))}
      />
      <Body
        aria-live="polite"
        style={{ minWidth: sizes.stepperValue }}
        className="text-center font-heavy"
      >
        {text}
      </Body>
      <IconButton
        icon="+"
        label={t('stepper.increase', { label })}
        disabled={max !== undefined && value + step > max}
        onPress={() => onChange(max === undefined ? value + step : Math.min(max, value + step))}
      />
    </View>
  );
}
