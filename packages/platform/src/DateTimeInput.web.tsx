import type { DateTimeInputProps } from './DateTimeInput';

// The browser owns the picker, the format and the keyboard: its value is already `yyyy-MM-dd` / `HH:mm`.
export function DateTimeInput({
  mode,
  value,
  onChange,
  onBlur,
  label,
  invalid,
  appearance: a,
}: DateTimeInputProps) {
  return (
    <input
      type={mode}
      value={value}
      aria-label={label}
      aria-invalid={invalid}
      // No DOM lib in the shared tsconfig, so the event target is typed by hand.
      onChange={(event) => onChange((event.target as { value: string }).value)}
      onBlur={onBlur}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        color: a.color,
        backgroundColor: a.backgroundColor,
        borderColor: a.borderColor,
        borderWidth: a.borderWidth,
        borderStyle: 'solid',
        borderRadius: a.borderRadius,
        minHeight: a.minHeight,
        paddingLeft: a.paddingHorizontal,
        paddingRight: a.paddingHorizontal,
        fontFamily: a.fontFamily,
        fontSize: a.fontSize,
        // Makes the browser draw its picker icon and popup for the active theme.
        colorScheme: a.dark ? 'dark' : 'light',
      }}
    />
  );
}
