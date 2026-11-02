import { describe, expect, it } from 'vitest';
import {
  notificationItemSchema,
  pushPayloadMaxBytes,
  pushPayloadSchema,
  pushSubscriptionInputSchema,
  quietHoursSchema,
} from './notifications';
import { materializeResponseSchema } from './tasks';

const id = '11111111-1111-4111-8111-111111111111';

describe('quietHoursSchema', () => {
  it('takes a window across midnight, or none', () => {
    expect(quietHoursSchema.safeParse({ start: '22:00', end: '07:00' }).success).toBe(true);
    expect(quietHoursSchema.safeParse(null).success).toBe(true);
  });

  it.each([
    { start: '22:00', end: '22:00' },
    { start: '24:00', end: '07:00' },
    { start: '22:00:00', end: '07:00' },
    { start: '7:00', end: '22:00' },
  ])('refuses %o', (value) => {
    expect(quietHoursSchema.safeParse(value).success).toBe(false);
  });
});

describe('pushSubscriptionInputSchema', () => {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: `B${'a'.repeat(86)}`, auth: 'a'.repeat(22) },
    userAgent: 'Chrome no Android',
  };

  it('takes what PushSubscription.toJSON() gives', () => {
    expect(pushSubscriptionInputSchema.safeParse(subscription).success).toBe(true);
  });

  // The host allow-list is the database's (notificationRules.pushEndpointHosts); this is the shape.
  it.each(['http://fcm.googleapis.com/x', 'javascript:alert(1)', 'not a url'])(
    'refuses the endpoint %s',
    (endpoint) => {
      expect(pushSubscriptionInputSchema.safeParse({ ...subscription, endpoint }).success).toBe(
        false,
      );
    },
  );

  it('refuses keys of the wrong size', () => {
    const keys = { ...subscription.keys, auth: 'a'.repeat(21) };
    expect(pushSubscriptionInputSchema.safeParse({ ...subscription, keys }).success).toBe(false);
  });
});

describe('pushPayloadSchema', () => {
  const payload = {
    v: 1,
    notificationId: id,
    type: 'task_reminder',
    title: 'Academia',
    body: 'Começa em 30 minutos',
    url: `/tasks/${id}/proof`,
    tag: id,
  };

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example', 'tasks'])(
    'opens only paths of the app, not %s',
    (url) => {
      expect(pushPayloadSchema.safeParse(payload).success).toBe(true);
      expect(pushPayloadSchema.safeParse({ ...payload, url }).success).toBe(false);
    },
  );

  it('fits the encrypted record at its largest, with four-byte characters', () => {
    const largest = {
      ...payload,
      type: 'occurrence_resolved',
      title: '😀'.repeat(60),
      body: '😀'.repeat(150),
      url: `/${'a'.repeat(199)}`,
      tag: 'a'.repeat(64),
    };
    expect(pushPayloadSchema.safeParse(largest).success).toBe(true);
    // UTF-8 length without the DOM lib: each %XX of encodeURIComponent is one byte.
    const bytes = encodeURIComponent(JSON.stringify(largest)).replace(/%[0-9A-F]{2}/g, '.').length;
    expect(bytes).toBeGreaterThan(840);
    expect(bytes).toBeLessThanOrEqual(pushPayloadMaxBytes);
  });
});

describe('notificationItemSchema', () => {
  const base = {
    id,
    occurrenceId: id,
    createdAt: '2026-11-02T12:00:00+00:00',
    readAt: null,
    taskTitle: null,
  };

  it('ties the data to the type', () => {
    const disputed = { ...base, type: 'proof_disputed', data: { proofId: id, toStatus: 'missed' } };
    expect(notificationItemSchema.safeParse(disputed).success).toBe(true);
    expect(notificationItemSchema.safeParse({ ...disputed, type: 'proof_in_review' }).success).toBe(
      false,
    );
  });
});

describe('materializeResponseSchema', () => {
  it('reads a function from before F4-8 as nothing failed and nothing deferred', () => {
    expect(materializeResponseSchema.parse({ inserted: 3 })).toEqual({
      inserted: 3,
      failed: 0,
      deferred: 0,
    });
  });
});
