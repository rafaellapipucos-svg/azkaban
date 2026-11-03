import { describe, expect, it } from 'vitest';
import { offlineDefaults, rateLimitRules } from './limits';

describe('rateLimitRules', () => {
  it('keeps counters at least as long as the longest window', () => {
    const longest = Math.max(...Object.values(rateLimitRules.actions).map((a) => a.windowSeconds));
    expect(rateLimitRules.counterRetentionHours * 3600).toBeGreaterThanOrEqual(longest);
  });

  it('remembers a request id longer than a change may wait offline', () => {
    expect(rateLimitRules.idempotencyRetentionHours).toBeGreaterThan(offlineDefaults.maxAgeHours);
  });

  it('allows every action at least once per window', () => {
    for (const [action, { limit, windowSeconds }] of Object.entries(rateLimitRules.actions)) {
      expect(Number.isInteger(limit) && limit > 0, action).toBe(true);
      expect(Number.isInteger(windowSeconds) && windowSeconds > 0, action).toBe(true);
    }
  });
});
