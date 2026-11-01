export const colors = {
  primary: '#6B2FE0',
  primaryEdge: '#4B1DA8',
  onPrimary: '#FFFFFF',
  background: '#FBF8FF',
  'background-dark': '#16121F',
  surface: '#FFFFFF',
  'surface-dark': '#241E33',
  text: '#1F1830',
  'text-dark': '#F5F1FC',
  muted: '#5F5673',
  'muted-dark': '#B9B0CC',
  pending: '#E4E0EC',
  'pending-dark': '#3A3350',
  onPending: '#1F1830',
  'onPending-dark': '#F5F1FC',
  done: '#0E7C54',
  partial: '#F4B400',
  missed: '#C8283D',
  cancelled: '#6E6780',
  onDone: '#FFFFFF',
  onPartial: '#2B2000',
  onMissed: '#FFFFFF',
  onCancelled: '#FFFFFF',
} as const;

export const radii = { md: 16, lg: 24, full: 999 } as const;

export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

export const fontFamily = {
  body: 'Nunito_600SemiBold',
  heavy: 'Nunito_800ExtraBold',
} as const;

export const fontSize = { sm: 14, md: 16, xl: 32 } as const;
