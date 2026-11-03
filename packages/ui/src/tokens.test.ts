import { describe, expect, it } from 'vitest';
import { colors, contextColors } from './tokens';

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every text color on every fill it is drawn on (ADR-0012, section 9, item 2): 4.5:1, AA for
// normal text. The labels are small, so no pair leans on the 3:1 allowed for large text. `muted` on
// `surface` (and the dark pair) is also the disabled Button and ConfirmButton (buttonLook.tsx).
const onPage = (texts: (keyof typeof colors)[], fills: (keyof typeof colors)[]) =>
  texts.flatMap((text) => fills.map((fill) => [text, fill] as const));
const textPairs = [
  ...onPage(['text', 'muted', 'primary', 'danger'], ['background', 'surface']),
  ...onPage(
    ['text-dark', 'muted-dark', 'primary-light', 'danger-light'],
    ['background-dark', 'surface-dark'],
  ),
  ['onPrimary', 'primary'],
  ['onPrimary', 'danger'],
  ['onDone', 'done'],
  ['onDone', 'cancelled'],
  ['onPartial', 'partial'],
  ['onMissed', 'missed'],
  ['onCancelled', 'cancelled'],
  ['onPending', 'pending'],
  ['onPending-dark', 'pending-dark'],
] as const;
it.each(textPairs)('%s on %s passes AA', (text, fill) => {
  expect(contrast(colors[text], colors[fill])).toBeGreaterThanOrEqual(4.5);
});
it.each(Object.entries(contextColors))('white on the context color %s passes AA', (_, fill) => {
  expect(contrast(colors.onPrimary, fill)).toBeGreaterThanOrEqual(4.5);
});

// "Em análise" (ADR-0007): text needs 4.5:1 (AA), the boundary of the control 3:1 (WCAG 1.4.11).
describe.each([
  {
    theme: 'light',
    fill: colors.review,
    text: colors.onReview,
    edge: colors.reviewEdge,
    cards: [colors.surface, colors.background],
  },
  {
    theme: 'dark',
    fill: colors['review-dark'],
    text: colors['onReview-dark'],
    edge: colors['reviewEdge-dark'],
    cards: [colors['surface-dark'], colors['background-dark']],
  },
])('review tokens, $theme', ({ fill, text, edge, cards }) => {
  it('symbol and label on the fill pass AA', () => {
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(cards)('edge against %s is at least 3:1', (card) => {
    expect(contrast(edge, card)).toBeGreaterThanOrEqual(3);
  });
});

it('the dark fill stands out from the dark card by itself', () => {
  expect(contrast(colors['review-dark'], colors['surface-dark'])).toBeGreaterThanOrEqual(3);
});

// IconButton `badge`: the count passes AA on its fill, and the fill stands out from the card (3:1).
describe.each([
  { theme: 'light', fill: colors.danger, text: colors.onPrimary, card: colors.surface },
  { theme: 'dark', fill: colors['danger-light'], text: colors.text, card: colors['surface-dark'] },
])('count badge, $theme', ({ fill, text, card }) => {
  it('count on the fill passes AA', () => {
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
  });
  it('fill against the card is at least 3:1', () => {
    expect(contrast(fill, card)).toBeGreaterThanOrEqual(3);
  });
});

// XpBar: the fill stands out from its track (3:1, WCAG 1.4.11).
it.each([
  ['light', colors.primary, colors.border],
  ['dark', colors['primary-light'], colors['border-dark']],
])('xp bar fill against the track, %s', (_theme, fill, track) => {
  expect(contrast(fill, track)).toBeGreaterThanOrEqual(3);
});
