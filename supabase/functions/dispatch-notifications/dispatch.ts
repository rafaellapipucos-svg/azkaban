// The loop of dispatch-notifications (ADR-0008, section 6): claim, send, report, until the budget.
// A channel is one implementation of NotificationChannel; WhatsApp joins in Phase 5 as another one,
// without touching the claim, the report, the backoff or the quiet hours. No imports, so Node runs the
// tests: the database calls and the channels come in as arguments.

export type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

/** One claimed outbox row, as `claim_notification_batch` returns it, after validation. */
export type OutboundMessage = {
  outboxId: string;
  notificationId: string;
  channel: string;
  type: string;
  data: Record<string, unknown>;
  occurrenceId: string | null;
  locale: string;
  taskTitle: string | null;
  requiresPhotoProof: boolean;
  /** Already counts this attempt. */
  attempts: number;
  scheduledFor: string;
  /** Empty outside `web_push`. */
  subscriptions: Subscription[];
};

type Subscriptions = { delivered?: string[]; gone?: string[] };
/** The four results of ADR-0008, section 6, with what each subscription did when there are many. */
export type SendResult =
  | ({ kind: 'sent' } & Subscriptions)
  | ({ kind: 'retry'; code: string; retryAfterSeconds?: number } & Subscriptions)
  | ({ kind: 'failed'; code: string } & Subscriptions)
  | { kind: 'gone'; subscriptionIds: string[] };

export interface NotificationChannel {
  readonly channel: string;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** One element of the argument of `report_notification_results`. */
export type Report = {
  outboxId: string;
  status: 'sent' | 'retry' | 'failed';
  code?: string;
  retryAfterSeconds?: number;
  deliveredSubscriptionIds?: string[];
  goneSubscriptionIds?: string[];
};

export type RetryRules = { maxAttempts: number; baseDelaySeconds: number; maxDelaySeconds: number };

/** The n-th retry waits base × 2^(n−1), or a longer Retry-After, both capped. */
export function backoffSeconds(
  attempts: number,
  retryAfter: number | undefined,
  retry: RetryRules,
) {
  const exponential = retry.baseDelaySeconds * 2 ** (Math.max(attempts, 1) - 1);
  return Math.min(retry.maxDelaySeconds, Math.max(exponential, retryAfter ?? 0));
}

export function toReport(message: OutboundMessage, result: SendResult, retry: RetryRules): Report {
  const { outboxId } = message;
  if (result.kind === 'gone') {
    return {
      outboxId,
      status: 'failed',
      code: 'push_gone',
      goneSubscriptionIds: result.subscriptionIds,
    };
  }
  const lists = {
    ...(result.delivered?.length ? { deliveredSubscriptionIds: result.delivered } : {}),
    ...(result.gone?.length ? { goneSubscriptionIds: result.gone } : {}),
  };
  if (result.kind === 'sent') return { outboxId, status: 'sent', ...lists };
  if (result.kind === 'failed' || message.attempts >= retry.maxAttempts) {
    return { outboxId, status: 'failed', code: result.code, ...lists };
  }
  return {
    outboxId,
    status: 'retry',
    code: result.code,
    retryAfterSeconds: backoffSeconds(message.attempts, result.retryAfterSeconds, retry),
    ...lists,
  };
}

export type Batch = {
  messages: OutboundMessage[];
  /** Outbox ids of claimed rows that did not pass validation: reported as failed, never sent. */
  invalid: string[];
  expired: number;
  cancelled: number;
  deferred: number;
};

export type DispatchOptions = {
  claim: () => Promise<Batch>;
  report: (reports: Report[]) => Promise<unknown>;
  channels: NotificationChannel[];
  batchSize: number;
  budgetMs: number;
  retry: RetryRules;
  /** Messages sent at the same time, so a batch is bounded by I/O and not by one slow service. */
  concurrency: number;
  now?: () => number;
};

export type Totals = {
  batches: number;
  sent: number;
  retried: number;
  failed: number;
  subscriptionsGone: number;
  expired: number;
  cancelled: number;
  deferred: number;
};

/**
 * Repeats claim, send and report while the budget lasts and the last claim was full. A run that dies
 * between sending and reporting leaves its rows in `sending`; they come back when the lease runs out
 * and go out again, with the same `tag`, so the browser shows one. Counts only, never content.
 */
export async function runDispatch(options: DispatchOptions): Promise<Totals> {
  const now = options.now ?? Date.now;
  const began = now();
  const byChannel = new Map(options.channels.map((c) => [c.channel, c]));
  const totals: Totals = {
    batches: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    subscriptionsGone: 0,
    expired: 0,
    cancelled: 0,
    deferred: 0,
  };

  const sendOne = async (message: OutboundMessage): Promise<Report> => {
    const channel = byChannel.get(message.channel);
    if (!channel) return { outboxId: message.outboxId, status: 'failed', code: 'no_channel' };
    try {
      return toReport(message, await channel.send(message), options.retry);
    } catch {
      // A defect of ours, such as a payload the contract refuses: repeating would not fix it.
      return { outboxId: message.outboxId, status: 'failed', code: 'send_error' };
    }
  };

  while (now() - began < options.budgetMs) {
    const batch = await options.claim();
    totals.batches += 1;
    totals.expired += batch.expired;
    totals.cancelled += batch.cancelled;
    totals.deferred += batch.deferred;

    const reports: Report[] = batch.invalid.map((outboxId) => ({
      outboxId,
      status: 'failed',
      code: 'invalid_item',
    }));
    for (let i = 0; i < batch.messages.length; i += options.concurrency) {
      reports.push(
        ...(await Promise.all(batch.messages.slice(i, i + options.concurrency).map(sendOne))),
      );
    }
    if (reports.length > 0) await options.report(reports);
    for (const r of reports) {
      if (r.status === 'sent') totals.sent += 1;
      else if (r.status === 'retry') totals.retried += 1;
      else totals.failed += 1;
      totals.subscriptionsGone += r.goneSubscriptionIds?.length ?? 0;
    }

    // Fewer rows than asked for means the queue is empty for now.
    const handled =
      batch.messages.length +
      batch.invalid.length +
      batch.expired +
      batch.cancelled +
      batch.deferred;
    if (handled < options.batchSize) break;
  }
  return totals;
}
