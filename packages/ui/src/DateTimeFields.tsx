import { useTranslation } from '@azkaban/i18n';
import { DateTimeInput } from '@azkaban/platform';
import { View } from 'react-native';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Body, ErrorText } from './Text';
import { fontFamily, fontSize, radii, sizes, spacing } from './tokens';
import { useThemeColors } from './useThemeColors';

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  errorText: string;
  /** Shown on native while empty. Defaults to a generic prompt. */
  placeholder?: string;
};

function DateTimeField<T extends FieldValues>({
  mode,
  control,
  name,
  label,
  errorText,
  placeholder,
}: Props<T> & { mode: 'date' | 'time' }) {
  const { t, i18n } = useTranslation('ui');
  const theme = useThemeColors();
  const { field, fieldState } = useController({ control, name });
  return (
    <View className="gap-1">
      <Body>{label}</Body>
      <DateTimeInput
        mode={mode}
        value={field.value ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
        label={label}
        placeholder={
          placeholder ?? t(mode === 'date' ? 'dateField.placeholder' : 'timeField.placeholder')
        }
        invalid={fieldState.invalid}
        locale={i18n.language}
        appearance={{
          dark: theme.dark,
          color: theme.text,
          placeholderColor: theme.muted,
          accentColor: theme.primary,
          backgroundColor: theme.surface,
          borderColor: fieldState.invalid ? theme.danger : theme.border,
          borderWidth: 2,
          borderRadius: radii.md,
          minHeight: sizes.field,
          paddingHorizontal: spacing[4],
          fontFamily: fontFamily.body,
          fontSize: fontSize.md,
        }}
      />
      {fieldState.invalid ? <ErrorText>{errorText}</ErrorText> : null}
    </View>
  );
}

/** Value is a `yyyy-MM-dd` string on the user's calendar, or `''`. */
export function DateField<T extends FieldValues>(props: Props<T>) {
  return <DateTimeField mode="date" {...props} />;
}

/** Value is an `HH:mm` string on the user's clock, or `''`. */
export function TimeField<T extends FieldValues>(props: Props<T>) {
  return <DateTimeField mode="time" {...props} />;
}
