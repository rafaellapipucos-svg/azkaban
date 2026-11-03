export const colors = {
  primary: '#6B2FE0',
  'primary-light': '#C9B2FF',
  primaryEdge: '#4B1DA8',
  onPrimary: '#FFFFFF',
  danger: '#C8283D',
  dangerEdge: '#8F1626',
  // Red text and borders on the dark theme: `danger` is only 2.9:1 on surface-dark.
  'danger-light': '#F2677A',
  background: '#FBF8FF',
  'background-dark': '#16121F',
  surface: '#FFFFFF',
  'surface-dark': '#241E33',
  border: '#E4E0EC',
  'border-dark': '#3A3350',
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
  // Darker bottom edge of the 3D status controls, like primaryEdge on Button.
  doneEdge: '#075B3C',
  partialEdge: '#B58500',
  cancelledEdge: '#4F4A5E',
  // "Em análise": done, waiting for an admin (ADR-0007). Light green, so it is not mistaken for
  // `done`. The edge is what separates it from a light card; tokens.test.ts measures the contrast.
  review: '#C4EED7',
  'review-dark': '#A6E6C4',
  onReview: '#0A3A28',
  'onReview-dark': '#0A3A28',
  reviewEdge: '#2F8A62',
  'reviewEdge-dark': '#6FCB9A',
} as const;

// Stored by name in areas.color_token and contexts.color_token. All pass AA with white text.
export const contextColors = {
  violet: '#6B2FE0',
  teal: '#0B7A75',
  coral: '#C2410C',
  rose: '#BE185D',
  blue: '#1D4FD8',
  slate: '#475569',
} as const;

export type ContextColorToken = keyof typeof contextColors;

export const mascotColors = {
  body: '#7C4DFF',
  belly: '#D9CCFF',
  leaf: '#22B573',
  ink: '#1F1830',
  blush: '#FF8FA3',
} as const;

export const radii = { md: 16, lg: 24, full: 999 } as const;

export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

export const fontFamily = {
  body: 'Nunito_600SemiBold',
  heavy: 'Nunito_800ExtraBold',
} as const;

/** `xs` is only for the tab bar with more than five tabs, so six labels fit whole at 320 px. */
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 32 } as const;

export const layout = { maxContentWidth: 560, tabBarHeight: 64 } as const;

/** Pixel sizes for controls drawn with SVG or inline styles. `touch` is the minimum target. */
export const sizes = {
  touch: 44,
  field: 48,
  check: 48,
  fab: 56,
  ring: 96,
  ringStroke: 10,
  switchWidth: 52,
  switchHeight: 32,
  switchThumb: 24,
  stepperValue: 64,
  /** The corner mark: "late" on TaskCheck, the count on IconButton. */
  cornerBadge: 20,
  /** StatusMark: `dot` fits a month cell, `row` a list line. */
  statusDot: 16,
  statusRow: 24,
  border: 2,
  mascot: 120,
  mascotSmall: 80,
  mascotLarge: 160,
  /** How far the mascot jumps (`celebrating`) and sways (`worried`). */
  mascotJump: 16,
  mascotShake: 6,
  xpBar: 16,
  /** The icon circle of AchievementBadge. */
  achievement: 56,
  confettiPiece: 10,
} as const;

/** Animation durations in ms. Components skip them entirely when the user asks for reduced motion. */
export const motion = { fast: 150, base: 450, mascot: 600, celebrate: 1600 } as const;

/** The confetti burst: how many pieces and their colors, all from the palette above. */
export const confetti = {
  pieces: 28,
  colors: [
    colors.primary,
    colors.done,
    colors.partial,
    contextColors.coral,
    contextColors.blue,
    contextColors.rose,
    mascotColors.leaf,
  ],
} as const;

/** Opacities for layers drawn over content. */
export const opacity = { scrim: 0.4 } as const;
