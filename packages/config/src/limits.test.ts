import { describe, expect, it } from 'vitest';
import { defaults } from './defaults';
import { offlineDefaults, privacyRules, rateLimitRules } from './limits';

describe('privacyRules', () => {
  // A run of account-delete stops at 400 s; the hold must outlast it, or a retry races an invite.
  it('holds an open deletion longer than any run of the function', () => {
    expect(Number.isInteger(privacyRules.openDeletionHoldMinutes)).toBe(true);
    expect(privacyRules.openDeletionHoldMinutes * 60).toBeGreaterThan(400);
  });
});

describe('defaults.functionRetryDelaysMs', () => {
  it('retries a few times, briefly, so a cold function does not look like a failure', () => {
    const delays = defaults.functionRetryDelaysMs;
    expect(delays.length).toBeGreaterThan(0);
    expect(delays.length).toBeLessThanOrEqual(3);
    expect(delays.every((ms) => Number.isInteger(ms) && ms > 0)).toBe(true);
    expect(delays.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(5000);
  });
});

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
