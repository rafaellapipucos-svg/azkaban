import { View, type TextInputProps } from 'react-native';
import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Input } from './Input';
import { Body, ErrorText } from './Text';

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
  const { field, fieldState } = useController({ control, name });
  return (
    <View className="gap-1">
      <Body>{label}</Body>
      <Input
        aria-label={label}
        invalid={fieldState.invalid}
        value={field.value ?? ''}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        {...input}
      />
      {fieldState.invalid ? <ErrorText>{errorText}</ErrorText> : null}
    </View>
  );
}
