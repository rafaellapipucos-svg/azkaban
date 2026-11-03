import { describe, expect, it } from 'vitest';
import { shouldOfferPushSetup } from './pushOffer';

const base = {
  vapidPublicKey: 'key',
  support: 'supported',
  permission: 'default',
  offered: false,
  enabledHere: false,
} as const;

describe('shouldOfferPushSetup', () => {
  it('offers once, with something to do', () => {
    expect(shouldOfferPushSetup(base)).toBe(true);
    expect(shouldOfferPushSetup({ ...base, support: 'needs_install' })).toBe(true);
    expect(shouldOfferPushSetup({ ...base, permission: 'granted' })).toBe(true);
  });

  it('stays out otherwise', () => {
    expect(shouldOfferPushSetup({ ...base, vapidPublicKey: undefined })).toBe(false);
    expect(shouldOfferPushSetup({ ...base, vapidPublicKey: '' })).toBe(false);
    expect(shouldOfferPushSetup({ ...base, offered: true })).toBe(false);
    expect(shouldOfferPushSetup({ ...base, enabledHere: true })).toBe(false);
    expect(shouldOfferPushSetup({ ...base, permission: 'denied' })).toBe(false);
    expect(shouldOfferPushSetup({ ...base, support: 'unsupported' })).toBe(false);
    expect(shouldOfferPushSetup({ ...base, support: 'ios_too_old' })).toBe(false);
  });
});
