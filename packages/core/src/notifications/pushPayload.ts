import { pushPayloadSchema, type NotificationItem, type PushPayload } from '@azkaban/contracts';

/**
 * i18next semantics, namespace `notifications`: `count` picks the plural form. The dispatcher passes
 * one bound to the profile's language.
 */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

type SourceOf<Item> = Item extends NotificationItem
  ? Pick<Item, 'id' | 'type' | 'data' | 'occurrenceId' | 'taskTitle'>
  : never;
/** What the dispatcher knows of a notification when it sends it, one shape per type. */
export type PushSource = SourceOf<NotificationItem>;

/** A task title longer than this is cut, so title and body always fit the payload. */
const taskTitleMaxLength = 80;
const titleMaxLength = 120;
const bodyMaxLength = 300;

/** Cuts by code point, so an emoji is never split in half, and marks the cut with an ellipsis. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max - 1) break;
    out += char;
  }
  return `${out}…`;
}

/** Tap target (ADR-0008, section 8). */
function pushUrl(source: PushSource, requiresPhoto: boolean) {
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
  }
}

/**
 * Body of a Web Push, in the language `t` speaks. Pure, so the dispatcher and the tests share it. A
 * missing title (the user no longer sees the task) becomes the generic one, and a long one is cut.
 */
export function buildPushPayload(
  source: PushSource,
  requiresPhoto: boolean,
  t: Translate,
): PushPayload {
  const task = clip(source.taskTitle?.trim() || t('push.genericTask'), taskTitleMaxLength);
  const { title, body } = texts(source, task, t);
  // The caps keep any payload under `pushPayloadMaxBytes`: 420 code units at most, even at the 6
  // bytes a JSON-escaped control character takes.
  return pushPayloadSchema.parse({
    v: 1,
    notificationId: source.id,
    type: source.type,
    title: clip(title, titleMaxLength),
    body: clip(body, bodyMaxLength),
    url: pushUrl(source, requiresPhoto),
    // A second delivery of the same notification replaces the first on screen.
    tag: source.id,
  });
}
