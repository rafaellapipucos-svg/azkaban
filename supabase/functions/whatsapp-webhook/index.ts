// The WhatsApp webhook (ADR-0009, section 7). Meta calls it, so there is no JWT: the GET is checked by
// the verify token, and every POST by the HMAC of its raw bytes with the app secret. Statuses go to
// `record_whatsapp_statuses`, and a whole-message stop word to `whatsapp_stop_by_wa_id`, both
// idempotent: a repeated event changes nobody and confirms nothing. Logs carry counts and codes, never
// a phone, a wa_id, a text, a signature, a body or a token.
import { whatsappWebhookSchema, type WhatsAppOutbound } from '@azkaban/contracts';
import { whatsappDefaults } from '../../../packages/config/src/whatsapp.ts';
import ptBR from '../../../packages/i18n/src/pt-BR/notifications.json' with { type: 'json' };
import { readLimited } from '../_shared/body.ts';
import { serviceClient } from '../_shared/http.ts';
import { whatsappEnv, whatsappProvider } from '../_shared/whatsapp/runtime.ts';
import { challengeAnswer, readWebhook, validSignature } from '../_shared/whatsapp/webhook.ts';

const READ_TIMEOUT_MS = 10_000;
// ponytail: the number may be in several accounts, each with its language; one file for now.
const STOP_REPLY = ptBR.whatsapp.stopReply;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const empty = (status: number) => new Response(null, { status });

class DatabaseError extends Error {}

Deno.serve(async (req) => {
  // Only the preflight of the test kit, which boots a worker before the tests.
  if (req.method === 'OPTIONS') return empty(204);

  try {
    const env = whatsappEnv();

    if (req.method === 'GET') {
      const answer = await challengeAnswer(
        new URL(req.url).searchParams,
        env?.WHATSAPP_VERIFY_TOKEN,
      );
      return answer === null
        ? empty(403)
        : new Response(answer, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (req.method !== 'POST') return empty(405);

    const secret = env?.WHATSAPP_APP_SECRET;
    if (!env || !secret) {
      console.error(JSON.stringify({ event: 'whatsapp_webhook_failed', stage: 'config' }));
      return json(500, { error: 'whatsapp_not_configured' });
    }

    const read = await readLimited(req.body, whatsappDefaults.webhookMaxBytes, READ_TIMEOUT_MS);
    if (read.kind === 'too_large') return empty(413);
    if (read.kind !== 'ok') return empty(400);
    if (!(await validSignature(read.bytes, req.headers.get('x-hub-signature-256'), secret))) {
      console.error(JSON.stringify({ event: 'whatsapp_webhook_refused', stage: 'signature' }));
      return empty(401);
    }

    // Signed and invalid is 200: a 4xx would make Meta repeat for days what never passes.
    let raw: unknown = null;
    try {
      raw = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch {
      // Falls to the schema below.
    }
    const webhook = whatsappWebhookSchema.safeParse(raw);
    if (!webhook.success) {
      console.error(JSON.stringify({ event: 'whatsapp_webhook_ignored', code: 'invalid_payload' }));
      return empty(200);
    }

    const work = readWebhook(
      webhook.data,
      env.WHATSAPP_PROVIDER === 'meta' ? env.WHATSAPP_PHONE_NUMBER_ID : undefined,
      whatsappDefaults.stopWords,
    );
    const admin = serviceClient();
    const check = <T>(stage: string, result: { data: T; error: { code?: string } | null }): T => {
      if (result.error) {
        console.error(
          JSON.stringify({ event: 'whatsapp_webhook_failed', stage, code: result.error.code }),
        );
        throw new DatabaseError(stage);
      }
      return result.data;
    };

    let statusesChanged = 0;
    if (work.statuses.length > 0) {
      statusesChanged = check(
        'statuses',
        await admin.rpc('record_whatsapp_statuses', { p_events: work.statuses }),
      ) as number;
    }

    const provider = whatsappProvider(env, admin);
    let stopped = 0;
    let replies = 0;
    for (const waId of work.stopWaIds) {
      const changed = check(
        'stop',
        await admin.rpc('whatsapp_stop_by_wa_id', { p_wa_id: waId }),
      ) as number;
      // Nobody changed: a repeated event, or a number that was not receiving. No confirmation.
      if (changed === 0) continue;
      stopped += changed;
      if (await confirmStop(provider, admin, waId)) replies += 1;
    }

    console.log(
      JSON.stringify({
        event: 'whatsapp_webhook_done',
        statuses: work.statuses.length,
        statusesChanged,
        stops: work.stopWaIds.length,
        stopped,
        replies,
        ignored: work.ignored,
      }),
    );
    return empty(200);
  } catch (error) {
    // A database error is 500, so Meta repeats: both RPCs are idempotent.
    if (!(error instanceof DatabaseError)) {
      console.error(JSON.stringify({ event: 'unexpected' }));
    }
    return json(500, { error: 'internal' });
  }
});

/**
 * The short confirmation, as free text inside the window the person opened. One try: the opt-out is
 * already recorded, and a repeated event changes nobody, so it never confirms twice.
 */
async function confirmStop(
  provider: ReturnType<typeof whatsappProvider>,
  admin: ReturnType<typeof serviceClient>,
  waId: string,
): Promise<boolean> {
  const message: WhatsAppOutbound = { kind: 'text', to: `+${waId}`, text: STOP_REPLY };
  const sent = await provider
    .send(message)
    .catch(() => ({ kind: 'failed' as const, code: 'wa_provider_error' }));
  if (sent.kind !== 'accepted') {
    console.error(JSON.stringify({ event: 'whatsapp_stop_reply_failed', code: sent.code }));
    return false;
  }
  const line = await admin.from('whatsapp_messages').insert({
    user_id: null,
    purpose: 'stop_reply',
    template: null,
    provider: provider.name,
    provider_message_id: sent.providerMessageId,
    recipient_wa_id: sent.waId ?? waId,
  });
  if (line.error) {
    console.error(
      JSON.stringify({
        event: 'whatsapp_stop_reply_failed',
        stage: 'record',
        code: line.error.code,
      }),
    );
  }
  return true;
}
