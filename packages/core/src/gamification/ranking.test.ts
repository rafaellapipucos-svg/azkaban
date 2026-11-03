import { describe, expect, it } from 'vitest';
import { rankingEnabled } from './ranking';

// Same values as gamificationRules.ranking.defaultEnabledByGroupType in config.
const defaults = { family: true, company: false, other: false };

describe('rankingEnabled (ADR-0010 section 6)', () => {
  it.each([
    ['family', true],
    ['company', false],
    ['other', false],
    ['school', false],
    ['constructor', false],
  ])('follows the default of the type %s when the setting is absent', (type, on) => {
    expect(rankingEnabled({ type }, defaults)).toBe(on);
    expect(rankingEnabled({ type, settings: {} }, defaults)).toBe(on);
    expect(rankingEnabled({ type, settings: null }, defaults)).toBe(on);
  });

  it('lets the setting win over the default, both ways', () => {
    expect(rankingEnabled({ type: 'company', settings: { rankingEnabled: true } }, defaults)).toBe(
      true,
    );
    expect(rankingEnabled({ type: 'family', settings: { rankingEnabled: false } }, defaults)).toBe(
      false,
    );
  });
});
