import { describe, expect, it } from 'vitest';
import {
  expoPushTokenSchema,
  internalPathSchema,
  nativePushMessageSchema,
  nativePushSubscriptionInputSchema,
  notificationItemSchema,
  pushPayloadMaxBytes,
  pushPayloadSchema,
  pushSubscriptionInputSchema,
  quietHoursSchema,
} from './notifications';
import { materializeResponseSchema } from './tasks';

const id = '11111111-1111-4111-8111-111111111111';

// The runtime has it; the lib of this package (es2023, no DOM, no Node types) does not.
declare const URL: new (url: string, base: string) => { origin: string };

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

  it.each([
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    'tasks',
    '/',
    // The URL parser drops tab, LF and CR anywhere: each of these resolves to https://evil.com/.
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    '/tasks/\t/x',
    '/\u0000/evil.com',
    '/\u007f/evil.com',
  ])('opens only paths of the app, not %j', (url) => {
    expect(pushPayloadSchema.safeParse(payload).success).toBe(true);
    expect(pushPayloadSchema.safeParse({ ...payload, url }).success).toBe(false);
  });

  it('keeps every path that stays in the app, and the regex agrees with the URL parser', () => {
    const origin = 'https://app.example';
    for (const url of [`/tasks/${id}`, `/proofs/${id}`, '/notifications?x=1#y', '/ /evil.com']) {
      expect(internalPathSchema.safeParse(url).success).toBe(true);
      expect(new URL(url, origin).origin).toBe(origin);
    }
    for (const url of [
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '//evil.com',
      '/\\evil.com',
    ]) {
      expect(new URL(url, origin).origin).not.toBe(origin);
      expect(internalPathSchema.safeParse(url).success).toBe(false);
    }
  });

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

describe('expoPushTokenSchema', () => {
  it.each(['ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', 'ExpoPushToken[aB3_-9]'])(
    'takes %s',
    (token) => {
      expect(
        nativePushSubscriptionInputSchema.safeParse({ token, userAgent: 'Pixel 7' }).success,
      ).toBe(true);
    },
  );

  it.each([
    'ExponentPushToken[]',
    'ExponentPushToken[abc',
    'ExponentPushToken[a b]',
    'ExponentPushToken[abc]x',
    'xExponentPushToken[abc]',
    'https://exp.host/--/api/v2/push/send',
    // The legacy bare UUID is not taken: getExpoPushTokenAsync never gives it.
    id,
    `ExponentPushToken[${'a'.repeat(201)}]`,
  ])('refuses %s', (token) => {
    expect(expoPushTokenSchema.safeParse(token).success).toBe(false);
  });
});

describe('nativePushMessageSchema', () => {
  const message = {
    to: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    title: 'Academia',
    body: 'Começa em 30 minutos',
    data: { v: 1, notificationId: id, type: 'task_reminder', url: `/tasks/${id}/proof` },
    channelId: 'default',
    ttl: 86_400,
  };

  it('opens only paths of the app, as the Web Push', () => {
    expect(nativePushMessageSchema.safeParse(message).success).toBe(true);
    for (const url of ['//evil.example', 'https://evil.example', '/\t/evil.com']) {
      const data = { ...message.data, url };
      expect(nativePushMessageSchema.safeParse({ ...message, data }).success).toBe(false);
    }
  });

  it('names the channel the app creates', () => {
    expect(nativePushMessageSchema.safeParse({ ...message, channelId: 'other' }).success).toBe(
      false,
    );
  });

  it('fits the 4096 bytes of the Expo push API at its largest', () => {
    const largest = {
      ...message,
      to: `ExponentPushToken[${'a'.repeat(200)}]`,
      title: '😀'.repeat(60),
      body: '😀'.repeat(150),
      data: { ...message.data, type: 'occurrence_resolved', url: `/${'a'.repeat(199)}` },
    };
    expect(nativePushMessageSchema.safeParse(largest).success).toBe(true);
    const bytes = encodeURIComponent(JSON.stringify(largest)).replace(/%[0-9A-F]{2}/g, '.').length;
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
