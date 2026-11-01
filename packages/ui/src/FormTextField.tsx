import { TextInput, View, type TextInputProps } from 'react-native';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Body, ErrorText } from './Text';
import { useThemeColors } from './useThemeColors';

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  errorText: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'>;

export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  errorText,
  ...input
}: Props<T>) {
  const { muted } = useThemeColors();
  const { field, fieldState } = useController({ control, name });
  return (
    <View className="gap-1">
      <Body>{label}</Body>
      <TextInput
        aria-label={label}
        aria-invalid={fieldState.invalid}
        value={field.value ?? ''}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        placeholderTextColor={muted}
        className={`min-h-12 rounded-md border-2 bg-surface px-4 font-body text-md text-text dark:bg-surface-dark dark:text-text-dark ${
          fieldState.invalid
            ? 'border-danger dark:border-danger-light'
            : 'border-border dark:border-border-dark'
        }`}
        {...input}
      />
      {fieldState.invalid ? <ErrorText>{errorText}</ErrorText> : null}
    </View>
  );
}
