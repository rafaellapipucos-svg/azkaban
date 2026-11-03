// The loop of dispatch-notifications (ADR-0008, section 6): claim, send, report, until the budget.
// A channel is one implementation of NotificationChannel: Web Push, and WhatsApp (ADR-0009, section 2)
// without touching the claim, the report, the backoff or the quiet hours. Only type imports, which
// Node erases, so it runs the tests: the database calls and the channels come in as arguments.
import type {
  DailySummarySource,
  WhatsAppOutbound,
} from '../../../packages/contracts/src/whatsapp.ts';
import type { WhatsAppProvider } from '../_shared/whatsapp/provider.ts';

export type WebSubscription = {
  id: string;
  kind: 'web';
  endpoint: string;
  p256dh: string;
  auth: string;
};
/** A device of the app (ADR-0012, section 11): the token is a capability, never logged. */
export type ExpoSubscription = { id: string; kind: 'expo'; expoToken: string };
export type Subscription = WebSubscription | ExpoSubscription;

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
  /** Empty outside `web_push`. Both kinds go by `web_push`, with one outbox row. */
  subscriptions: Subscription[];
  /** The profile's zone, and the occurrence as it is now (ADR-0009, section 9). */
  timezone: string;
  overdueAt: string | null;
  occurrenceStatus: string | null;
  /** E.164, only on `whatsapp`. */
  phone: string | null;
  /** Only for `daily_summary`. */
  summary: DailySummarySource | null;
};

type Subscriptions = { delivered?: string[]; gone?: string[] };
/** What the report hands to `whatsapp_messages` for a sent WhatsApp row. */
export type WhatsAppSent = {
  providerMessageId: string;
  waId: string | null;
  template: string | null;
  provider: WhatsAppProvider['name'];
};
/** The four results of ADR-0008, section 6, with what each subscription did when there are many. */
export type SendResult =
  | ({ kind: 'sent'; whatsapp?: WhatsAppSent } & Subscriptions)
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
  whatsapp?: WhatsAppSent;
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
  if (result.kind === 'sent') {
    return {
      outboxId,
      status: 'sent',
      ...lists,
      ...(result.whatsapp && { whatsapp: result.whatsapp }),
    };
  }
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

/**
 * The WhatsApp channel (ADR-0009, section 2). `render` turns the claimed row into the message, and
 * throws for a row it cannot render, which the loop fails as `send_error`: repeating would not fix it.
 * A provider that throws (the console's insert, never Meta's, which answers codes) is a retry: nothing
 * reached anyone, and the backoff and `maxAttempts` bound it like a network error.
 */
export class WhatsAppChannel implements NotificationChannel {
  readonly channel = 'whatsapp';
  readonly #provider: WhatsAppProvider;
  readonly #render: (message: OutboundMessage) => WhatsAppOutbound;

  constructor(provider: WhatsAppProvider, render: (message: OutboundMessage) => WhatsAppOutbound) {
    this.#provider = provider;
    this.#render = render;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const outbound = this.#render(message);
    let result: Awaited<ReturnType<WhatsAppProvider['send']>>;
    try {
      result = await this.#provider.send(outbound);
    } catch {
      return { kind: 'retry', code: 'wa_provider_error' };
    }
    if (result.kind !== 'accepted') return result;
    return {
      kind: 'sent',
      whatsapp: {
        providerMessageId: result.providerMessageId,
        waId: result.waId,
        template: outbound.kind === 'text' ? null : outbound.template,
        provider: this.#provider.name,
      },
    };
  }
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
