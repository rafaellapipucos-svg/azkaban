import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { DateTimeInputProps } from './DateTimeInput';
import { formatDate, formatTime, parseDate, parseTime } from './dateTimeText';

// Android opens a system dialog; iOS shows a spinner under the field, toggled by tapping the field again.
export function DateTimeInput({
  mode,
  value,
  onChange,
  onBlur,
  label,
  placeholder,
  invalid,
  locale,
  appearance: a,
}: DateTimeInputProps) {
  const [open, setOpen] = useState(false);
  const parse = mode === 'date' ? parseDate : parseTime;
  const format = mode === 'date' ? formatDate : formatTime;
  const shown = !value
    ? placeholder
    : mode === 'date'
      ? parseDate(value).toLocaleDateString(locale)
      : value;

  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: parse(value),
        is24Hour: true,
        onValueChange: (_event, date) => {
          onChange(format(date));
          onBlur?.();
        },
        onDismiss: onBlur,
      });
      return;
    }
    if (open) onBlur?.();
    setOpen(!open);
  };

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        role="button"
        aria-label={`${label}: ${shown}`}
        aria-invalid={invalid}
        aria-expanded={Platform.OS === 'ios' ? open : undefined}
        onPress={press}
        style={{
          minHeight: a.minHeight,
          justifyContent: 'center',
          paddingHorizontal: a.paddingHorizontal,
          borderWidth: a.borderWidth,
          borderColor: a.borderColor,
          borderRadius: a.borderRadius,
          backgroundColor: a.backgroundColor,
        }}
      >
        <Text
          style={{
            color: value ? a.color : a.placeholderColor,
            fontFamily: a.fontFamily,
            fontSize: a.fontSize,
          }}
        >
          {shown}
        </Text>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          mode={mode}
          display="spinner"
          value={parse(value)}
          locale={locale}
          is24Hour
          themeVariant={a.dark ? 'dark' : 'light'}
          textColor={a.color}
          accentColor={a.accentColor}
          onValueChange={(_event, date) => onChange(format(date))}
        />
      ) : null}
    </View>
  );
}
