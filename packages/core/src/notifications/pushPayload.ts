import {
  pushPayloadSchema,
  type NotificationItem,
  type OccurrenceStatus,
  type PushPayload,
} from '@azkaban/contracts';
import { lateWindowEnd } from '../tasks/late';

/**
 * i18next semantics, namespace `notifications`: `count` picks the plural form. The dispatcher passes
 * one bound to the profile's language.
 */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

type SourceOf<Item> = Item extends NotificationItem
  ? Pick<Item, 'id' | 'type' | 'data' | 'occurrenceId' | 'taskTitle'>
  : never;
/**
 * What the dispatcher knows of a notification when it sends it, one shape per type. The three
 * optional fields come from the claim at send time (ADR-0009, section 9): with them, an automatic red
 * says until when it can still be done.
 */
export type PushSource = SourceOf<NotificationItem> & {
  /** The profile's zone, for the date of that deadline. */
  timezone?: string;
  overdueAt?: string | null;
  occurrenceStatus?: OccurrenceStatus | null;
};

/** What the deadline of an automatic red needs besides the source. Without it, no deadline. */
export type LateContext = { locale: string; lateCompletionWindowHours: number; now: Date };

/** A task title longer than this is cut, so title and body always fit the payload. */
const taskTitleMaxLength = 80;
const titleMaxLength = 120;
const bodyMaxLength = 300;

/** Cuts by code point, so an emoji is never split in half, and marks the cut with an ellipsis. */
export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max - 1) break;
    out += char;
  }
  return `${out}…`;
}

/** Tap target (ADR-0008, section 8), shared by the push and the bell. */
export function notificationUrl(source: PushSource, requiresPhoto: boolean) {
  // Today. `internalPathSchema` refuses a bare `/`, so this one is never a push: the summary goes
  // only by WhatsApp (ADR-0009, section 5), and only the bell opens it.
  if (source.type === 'daily_summary') return '/';
  if (source.type === 'proof_in_review') return `/proofs/${source.data.proofId}`;
  if (!source.occurrenceId) return '/notifications';
  const task = `/tasks/${source.occurrenceId}`;
  return source.type === 'task_reminder' && requiresPhoto ? `${task}/proof` : task;
}

function leadText(minutes: number, t: Translate) {
  if (minutes % 1440 === 0) return t('push.lead.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('push.lead.hours', { count: minutes / 60 });
  return t('push.lead.minutes', { count: minutes });
}

function texts(source: PushSource, task: string, t: Translate) {
  switch (source.type) {
    case 'task_reminder': {
      const { leadMinutes } = source.data;
      return {
        title: t('push.task_reminder.title', { task }),
        body:
          leadMinutes === 0
            ? t('push.task_reminder.now')
            : t('push.task_reminder.soon', { lead: leadText(leadMinutes, t) }),
      };
    }
    case 'occurrence_missed':
      return {
        title: t('push.occurrence_missed.title'),
        body: t(
          source.data.byUserId ? 'push.occurrence_missed.byUser' : 'push.occurrence_missed.auto',
          {
            task,
          },
        ),
      };
    case 'occurrence_resolved':
      return {
        title: t(`push.occurrence_resolved.title.${source.data.status}`),
        body: t('push.occurrence_resolved.body', { task }),
      };
    case 'proof_in_review':
      return {
        title: t('push.proof_in_review.title'),
        body: t('push.proof_in_review.body', { task }),
      };
    case 'proof_disputed':
      return {
        title: t('push.proof_disputed.title'),
        body: t(`push.proof_disputed.body.${source.data.toStatus}`, { task }),
      };
    case 'daily_summary':
      return { title: t('push.daily_summary.title'), body: t('push.daily_summary.body') };
  }
}

/**
 * Title and body of a notification, in the language `t` speaks: what the push says, and the bell's
 * line. A missing title (the user no longer sees the task) becomes the generic one, and a long one is
 * cut. An automatic red still in its late window adds until when, in the profile's zone.
 */
export function notificationText(source: PushSource, t: Translate, late?: LateContext) {
  const task = clip(source.taskTitle?.trim() || t('push.genericTask'), taskTitleMaxLength);
  const { title, body } = texts(source, task, t);
  const until =
    late && source.timezone
      ? missedLateUntil(source, late.lateCompletionWindowHours, late.now)
      : null;
  const when =
    until && late
      ? new Intl.DateTimeFormat(late.locale, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: source.timezone,
        }).format(until)
      : null;
  return {
    title: clip(title, titleMaxLength),
    body: clip(when ? `${body} ${t('lateUntil', { when })}` : body, bodyMaxLength),
  };
}

/**
 * Body of a Web Push, with the text of `notificationText`. Pure, so the dispatcher and the tests
 * share it. Throws for `daily_summary`, which is never a push (see `notificationUrl`).
 */
export function buildPushPayload(
  source: PushSource,
  requiresPhoto: boolean,
  t: Translate,
  late?: LateContext,
): PushPayload {
  // The caps keep any payload under `pushPayloadMaxBytes`: 420 code units at most, even at the 6
  // bytes a JSON-escaped control character takes.
  return pushPayloadSchema.parse({
    v: 1,
    notificationId: source.id,
    type: source.type,
    ...notificationText(source, t, late),
    url: notificationUrl(source, requiresPhoto),
    // A second delivery of the same notification replaces the first on screen.
    tag: source.id,
  });
}

/**
 * Until when an automatic red can still be done (ADR-0008, section 10): the end of the late window,
 * from the occurrence as it is now, so a reschedule moves it. Null for a red by a person, once it was
 * resolved or the window closed, and without the occurrence's fields.
 */
export function missedLateUntil(
  source: PushSource,
  lateCompletionWindowHours: number,
  now: Date,
): Date | null {
  if (source.type !== 'occurrence_missed' || source.data.byUserId) return null;
  if (source.occurrenceStatus !== 'missed' || !source.overdueAt) return null;
  const end = lateWindowEnd(source.overdueAt, lateCompletionWindowHours);
  return end.getTime() >= now.getTime() ? end : null;
}
