import { whatsappErrorCodeSchema } from '@azkaban/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  phoneFormSchema,
  secondsUntil,
  waitParts,
  whatsappErrorKey,
  whatsappStep,
} from './whatsappFlow';

const packages = join(import.meta.dirname, '..', '..', '..');
const messages = JSON.parse(
  readFileSync(join(packages, 'i18n', 'src', 'pt-BR', 'notifications.json'), 'utf8'),
) as { whatsapp: { errors: Record<string, string> } };

const none = {
  phoneE164: null,
  phoneVerifiedAt: null,
  optInAt: null,
  optInVersion: null,
  optOutAt: null,
};
const verified = { ...none, phoneE164: '+5511987654321', phoneVerifiedAt: '2026-11-03T10:00:00Z' };
const on = { ...verified, optInAt: '2026-11-03T10:01:00Z', optInVersion: 1 };

describe('whatsappStep', () => {
  it('asks for the number, then the code while one is on screen', () => {
    expect(whatsappStep(none, false, 1)).toBe('phone');
    expect(whatsappStep(none, true, 1)).toBe('code');
  });

  it('a verified number goes to the notice, even with a code left on screen', () => {
    expect(whatsappStep(verified, true, 1)).toBe('consent');
  });

  it('is on after the opt-in, and back to the notice after an opt-out', () => {
    expect(whatsappStep(on, false, 1)).toBe('on');
    expect(whatsappStep({ ...on, optOutAt: '2026-11-03T11:00:00Z' }, false, 1)).toBe('consent');
    // Opted in again after the opt-out
    expect(whatsappStep({ ...on, optOutAt: '2026-11-03T09:00:00Z' }, false, 1)).toBe('on');
  });

  it('a newer notice asks for the opt-in again', () => {
    expect(whatsappStep(on, false, 2)).toBe('consent');
  });
});

describe('phoneFormSchema', () => {
  const errorPath = (form: { country: string; number: string }) =>
    phoneFormSchema.safeParse(form).error?.issues.map((issue) => issue.path.join('.'));

  it('takes a Brazilian number, also typed with +55 or 0055', () => {
    expect(errorPath({ country: '55', number: '(11) 98765-4321' })).toBeUndefined();
    expect(errorPath({ country: '55', number: '+55 11 98765-4321' })).toBeUndefined();
    expect(errorPath({ country: '55', number: '0055 11 98765-4321' })).toBeUndefined();
  });

  it('refuses another country in its field or in the number, before asking (SEG5-5)', () => {
    expect(errorPath({ country: '351', number: '912 345 678' })).toEqual(['country']);
    expect(errorPath({ country: '55', number: '+351 912 345 678' })).toEqual(['country']);
    expect(errorPath({ country: '55', number: '00351 912 345 678' })).toEqual(['country']);
  });

  it('a number that is not a phone is the number field', () => {
    expect(errorPath({ country: '55', number: 'abc' })).toEqual(['number']);
  });
});

describe('secondsUntil', () => {
  const now = Date.parse('2026-11-03T10:00:00.000Z');
  it('rounds up and never goes below zero', () => {
    expect(secondsUntil('2026-11-03T10:01:00.000Z', now)).toBe(60);
    expect(secondsUntil('2026-11-03T10:00:00.200Z', now)).toBe(1);
    expect(secondsUntil('2026-11-03T09:59:00.000Z', now)).toBe(0);
    expect(secondsUntil(null, now)).toBe(0);
  });
});

describe('waitParts', () => {
  it('picks the unit and rounds up', () => {
    expect(waitParts(59)).toEqual({ unit: 'seconds', count: 59 });
    expect(waitParts(60)).toEqual({ unit: 'minutes', count: 1 });
    expect(waitParts(90)).toEqual({ unit: 'minutes', count: 2 });
    expect(waitParts(3600)).toEqual({ unit: 'hours', count: 1 });
    expect(waitParts(7260)).toEqual({ unit: 'hours', count: 3 });
  });
});

describe('whatsappErrorKey', () => {
  it('maps the codes of the contract, as a string or as the message of a raised error', () => {
    expect(whatsappErrorKey('phone_code_invalid')).toBe('whatsapp.errors.phone_code_invalid');
    expect(whatsappErrorKey('phone_rate_limited')).toBe('whatsapp.errors.phone_rate_limited');
    expect(whatsappErrorKey({ message: 'invalid_consent_version', code: '22023' })).toBe(
      'whatsapp.errors.invalid_consent_version',
    );
  });

  it('every code of the contract has its own message, so none falls to the generic one', () => {
    for (const code of whatsappErrorCodeSchema.options) {
      expect(messages.whatsapp.errors[code], code).toBeTruthy();
    }
    expect(whatsappErrorKey('phone_country_not_allowed')).toBe(
      'whatsapp.errors.phone_country_not_allowed',
    );
  });

  it('anything else is generic', () => {
    expect(whatsappErrorKey(new Error('Failed to fetch'))).toBe('whatsapp.errors.generic');
    expect(whatsappErrorKey({ message: 'forbidden' })).toBe('whatsapp.errors.generic');
    expect(whatsappErrorKey(null)).toBe('whatsapp.errors.generic');
  });
});
