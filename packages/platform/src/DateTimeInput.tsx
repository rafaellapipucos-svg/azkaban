import type { ReactElement } from 'react';

/** Plain values the caller resolves from design tokens; the adapters hold no theme of their own. */
export type DateTimeInputAppearance = {
  dark: boolean;
  color: string;
  placeholderColor: string;
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  minHeight: number;
  paddingHorizontal: number;
  fontFamily: string;
  fontSize: number;
};

export type DateTimeInputProps = {
  mode: 'date' | 'time';
  /** `yyyy-MM-dd` for date, `HH:mm` for time, or `''` when empty. Always the user's local clock. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label: string;
  placeholder: string;
  invalid?: boolean;
  /** BCP 47 tag used to show the date on native. The web input follows the browser. */
  locale: string;
  appearance: DateTimeInputAppearance;
};

/**
 * Native `<input type="date|time">` on web (`DateTimeInput.web.tsx`) and the system picker on
 * iOS and Android (`DateTimeInput.native.tsx`). Metro picks those by platform and never loads
 * this file: its `.tsx` extension ranks below the platform files in Metro's lookup, whereas a `.ts`
 * would win over `.web.tsx`. TypeScript and dependency-cruiser, which know nothing of platforms,
 * resolve `./DateTimeInput` to it. A `.d.ts` would not do: dependency-cruiser cannot resolve one.
 */
export function DateTimeInput(props: DateTimeInputProps): ReactElement {
  throw new Error(`DateTimeInput (${props.mode}) has no adapter for this platform.`);
}
