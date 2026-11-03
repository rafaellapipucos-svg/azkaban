import { pushPayloadMaxBytes, pushPayloadSchema } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import {
  actorLabel,
  buildPushPayload,
  missedLateUntil,
  notificationText,
  notificationUrl,
  type PushSource,
  type Translate,
} from './pushPayload';

const id = '11111111-1111-4111-8111-111111111111';
const occurrenceId = '22222222-2222-4222-8222-222222222222';
const proofId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

// Echoes the key and the values, so a test sees which text was picked and with what.
const t: Translate = (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key);

const reminder = (leadMinutes: number, taskTitle: string | null = 'Academia'): PushSource => ({
  id,
  type: 'task_reminder',
  occurrenceId,
  taskTitle,
  data: { leadMinutes, anchorAt: '2026-11-03T09:00:00.000Z' },
});

// UTF-8 length without the DOM lib: each %XX of encodeURIComponent is one byte.
const bytes = (value: unknown) =>
  encodeURIComponent(JSON.stringify(value)).replace(/%[0-9A-F]{2}/g, '.').length;

describe('buildPushPayload', () => {
  it('builds a reminder that opens the task, tagged with the notification', () => {
    const payload = buildPushPayload(reminder(0), false, t);
    expect(payload).toEqual({
      v: 1,
      notificationId: id,
      type: 'task_reminder',
      title: 'push.task_reminder.title {"task":"Academia"}',
      body: 'push.task_reminder.now',
      url: `/tasks/${occurrenceId}`,
      tag: id,
    });
  });

  it('sends a reminder of a photo task straight to the camera, and only a reminder', () => {
    expect(buildPushPayload(reminder(15), true, t).url).toBe(`/tasks/${occurrenceId}/proof`);
    const missed: PushSource = {
      ...reminder(0),
      type: 'occurrence_missed',
      data: { byUserId: null },
    };
    expect(buildPushPayload(missed, true, t).url).toBe(`/tasks/${occurrenceId}`);
  });

  it('says the lead in the largest whole unit', () => {
    const unit: Translate = (key, values) => String(values?.lead ?? `${key} ${values?.count}`);
    const lead = (minutes: number) => buildPushPayload(reminder(minutes), false, unit).body;
    expect(lead(15)).toBe('push.lead.minutes 15');
    expect(lead(90)).toBe('push.lead.minutes 90');
    expect(lead(120)).toBe('push.lead.hours 2');
    expect(lead(1440)).toBe('push.lead.days 1');
    expect(lead(43200)).toBe('push.lead.days 30');
  });

  it('tells a red by the job from a red by a person', () => {
    const missed = (byUserId: string | null): PushSource => ({
      ...reminder(0),
      type: 'occurrence_missed',
      data: { byUserId },
    });
    expect(buildPushPayload(missed(null), false, t).body).toMatch(
      /^push\.occurrence_missed\.auto /,
    );
    expect(buildPushPayload(missed(userId), false, t).body).toMatch(
      /^push\.occurrence_missed\.byUser /,
    );
  });

  it('titles a resolved task by its status', () => {
    for (const status of ['done', 'partial', 'missed'] as const) {
      const source: PushSource = {
        ...reminder(0),
        type: 'occurrence_resolved',
        data: { status, byUserId: userId },
      };
      const payload = buildPushPayload(source, false, t);
      expect(payload.title).toBe(`push.occurrence_resolved.title.${status}`);
      expect(payload.url).toBe(`/tasks/${occurrenceId}`);
    }
  });

  it('opens the review of the proof waiting for it', () => {
    const source: PushSource = {
      ...reminder(0),
      type: 'proof_in_review',
      data: { proofId, groupId: userId },
    };
    expect(buildPushPayload(source, true, t)).toMatchObject({
      title: 'push.proof_in_review.title',
      url: `/proofs/${proofId}`,
    });
  });

  it('says where a disputed proof left the task', () => {
    for (const toStatus of ['partial', 'missed'] as const) {
      const source: PushSource = {
        ...reminder(0),
        type: 'proof_disputed',
        data: { proofId, toStatus },
      };
      const payload = buildPushPayload(source, true, t);
      expect(payload.body).toMatch(new RegExp(`^push\\.proof_disputed\\.body\\.${toStatus} `));
      expect(payload.url).toBe(`/tasks/${occurrenceId}`);
    }
  });

  it('uses the generic line when the title is gone or blank', () => {
    for (const title of [null, '   ']) {
      expect(buildPushPayload(reminder(0, title), false, t).title).toBe(
        'push.task_reminder.title {"task":"push.genericTask"}',
      );
    }
  });

  it('opens the bell when the occurrence is gone', () => {
    expect(buildPushPayload({ ...reminder(0), occurrenceId: null }, true, t).url).toBe(
      '/notifications',
    );
  });

  it('cuts a long title by code point, never splitting a four-byte character', () => {
    const plain: Translate = (key, values) => String(values?.task ?? key);
    const title = '😀'.repeat(200);
    const payload = buildPushPayload(reminder(0, title), false, plain);
    expect(payload.title.endsWith('…')).toBe(true);
    expect(payload.title.length).toBeLessThanOrEqual(80);
    expect(payload.title.slice(0, -1)).toBe('😀'.repeat(39));
  });

  it('keeps accented and escaped text within the limits whatever the translation does', () => {
    // A translation that repeats the title, with accents, quotes and control characters that JSON
    // escapes to six bytes each.
    const long: Translate = (key, values) =>
      `${'ção"\u0001'.repeat(100)}${String(values?.task ?? key)}`;
    const sources: PushSource[] = [
      reminder(15, 'Lição de piano à tarde, com café e pão de queijo '.repeat(10)),
      reminder(0, '\u0002'.repeat(500)),
      reminder(0, '𝔸'.repeat(500)),
    ];
    for (const source of sources) {
      const payload = buildPushPayload(source, true, long);
      expect(pushPayloadSchema.safeParse(payload).success).toBe(true);
      expect(payload.title.length).toBeLessThanOrEqual(120);
      expect(payload.body.length).toBeLessThanOrEqual(300);
      expect(bytes(payload)).toBeLessThanOrEqual(pushPayloadMaxBytes);
    }
  });
});

describe('missedLateUntil', () => {
  const overdueAt = '2026-11-02T03:00:00.000Z';
  const red = (byUserId: string | null, occurrenceStatus: 'missed' | 'done' = 'missed') => ({
    id,
    type: 'occurrence_missed' as const,
    occurrenceId,
    taskTitle: 'Academia',
    data: { byUserId },
    overdueAt,
    occurrenceStatus,
  });
  const now = new Date('2026-11-03T12:00:00.000Z');

  it('is the end of the late window for an automatic red still missed', () => {
    expect(missedLateUntil(red(null), 72, now)?.toISOString()).toBe('2026-11-05T03:00:00.000Z');
  });

  it('is null when a person marked it, it was resolved since, or the window closed', () => {
    expect(missedLateUntil(red(userId), 72, now)).toBeNull();
    expect(missedLateUntil(red(null, 'done'), 72, now)).toBeNull();
    expect(missedLateUntil(red(null), 72, new Date('2026-11-05T03:00:00.001Z'))).toBeNull();
    expect(
      missedLateUntil({ ...reminder(10), overdueAt, occurrenceStatus: 'missed' }, 72, now),
    ).toBeNull();
  });
});

describe('the deadline of an automatic red (ADR-0009, section 9)', () => {
  const late = {
    locale: 'pt-BR',
    lateCompletionWindowHours: 72,
    now: new Date('2026-11-03T12:00:00.000Z'),
  };
  const red = (byUserId: string | null): PushSource => ({
    id,
    type: 'occurrence_missed',
    occurrenceId,
    taskTitle: 'Academia',
    data: { byUserId },
    timezone: 'America/Sao_Paulo',
    overdueAt: '2026-11-02T03:00:00.000Z',
    occurrenceStatus: 'missed',
  });
  const plain = 'push.occurrence_missed.auto {"task":"Academia"}';

  it('says until when, in the zone of the profile', () => {
    // 2026-11-05T03:00Z is midnight of the 5th in São Paulo, and noon in Tokyo.
    expect(buildPushPayload(red(null), false, t, late).body).toBe(
      `${plain} lateUntil {"when":"5 de nov., 00:00"}`,
    );
    const tokyo = buildPushPayload({ ...red(null), timezone: 'Asia/Tokyo' }, false, t, late);
    expect(tokyo.body).toBe(`${plain} lateUntil {"when":"5 de nov., 12:00"}`);
  });

  it('says nothing without the new fields, the context, or a window still open', () => {
    // As the claim of Phase 4 sends it.
    const old: PushSource = {
      id,
      type: 'occurrence_missed',
      occurrenceId,
      taskTitle: 'Academia',
      data: { byUserId: null },
    };
    expect(buildPushPayload(old, false, t, late).body).toBe(plain);
    expect(buildPushPayload({ ...red(null), timezone: undefined }, false, t, late).body).toBe(
      plain,
    );
    expect(buildPushPayload({ ...red(null), overdueAt: null }, false, t, late).body).toBe(plain);
    expect(buildPushPayload(red(null), false, t).body).toBe(plain);
    expect(buildPushPayload({ ...red(null), occurrenceStatus: 'done' }, false, t, late).body).toBe(
      plain,
    );
    const closed = { ...late, now: new Date('2026-11-06T00:00:00.000Z') };
    expect(buildPushPayload(red(null), false, t, closed).body).toBe(plain);
  });

  it('never gives a deadline to a red marked by a person', () => {
    expect(buildPushPayload(red(userId), false, t, late).body).toBe(
      'push.occurrence_missed.byUser {"task":"Academia"}',
    );
  });
});

describe('daily_summary', () => {
  const summary: PushSource = {
    id,
    type: 'daily_summary',
    occurrenceId: null,
    taskTitle: null,
    data: { localDate: '2026-11-03' },
  };

  it('is a line of the bell that opens Today, never a push', () => {
    expect(notificationText(summary, t)).toEqual({
      title: 'push.daily_summary.title',
      body: 'push.daily_summary.body',
    });
    expect(notificationUrl(summary, false)).toBe('/');
    expect(() => buildPushPayload(summary, false, t)).toThrow();
  });
});

describe('actorLabel', () => {
  const resolved = (byUserId: string) =>
    ({ type: 'occurrence_resolved', data: { status: 'done', byUserId } }) as const;
  const names = new Map([[userId, 'Ana']]);

  it('names who acted', () => {
    expect(actorLabel(resolved(userId), names, t)).toBe('Ana');
  });

  it('says the account was deleted when the id has no name', () => {
    expect(actorLabel(resolved(id), names, t)).toBe('actor.deletedAccount');
    expect(actorLabel(resolved(userId), new Map([[userId, '  ']]), t)).toBe('actor.deletedAccount');
  });

  it('says nothing for the job, a type without actor, or names still loading', () => {
    expect(
      actorLabel({ type: 'occurrence_missed', data: { byUserId: null } }, names, t),
    ).toBeNull();
    expect(actorLabel(reminder(0), names, t)).toBeNull();
    expect(actorLabel(resolved(userId), undefined, t)).toBeNull();
  });
});
