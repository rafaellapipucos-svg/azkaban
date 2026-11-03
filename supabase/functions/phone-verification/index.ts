// Starts a phone verification (ADR-0009, section 3): a one-time code sent through WhatsApp itself, in
// the authentication template. The database applies the limits and makes the code
// (`start_phone_verification`, service role only); this function sends it and records the delivery
// line. The app confirms with the `confirm_phone_verification` RPC. Never a phone or a code in a log.
import {
  phoneVerificationRequestSchema,
  phoneVerificationStartedSchema,
  type PhoneVerificationError,
} from '@azkaban/contracts';
import { z } from 'zod';
import { whatsappDefaults } from '../../../packages/config/src/whatsapp.ts';
import { readLimited } from '../_shared/body.ts';
import { responder, serviceClient, signedInUser } from '../_shared/http.ts';
import { whatsappEnv, whatsappProvider } from '../_shared/whatsapp/runtime.ts';

const MAX_BODY_BYTES = 1024;
const READ_TIMEOUT_MS = 10_000;
// ponytail: one template language for now; read the profile's locale when a second one exists.
const LANGUAGE = Object.values(whatsappDefaults.templateLanguages)[0];

const reply = responder();

const startedSchema = z.union([
  z.object({
    verificationId: z.guid(),
    code: z.string(),
    expiresAt: z.string(),
    resendAt: z.string(),
  }),
  z.object({ error: z.literal('phone_rate_limited'), retryAfterSeconds: z.int().min(0) }),
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  try {
    const admin = serviceClient();
    const user = await signedInUser(admin, req.headers.get('authorization') ?? '');
    if (!user) return reply(401, { error: 'unauthorized' });

    const read = await readLimited(req.body, MAX_BODY_BYTES, READ_TIMEOUT_MS);
    if (read.kind !== 'ok') return reply(400, { error: 'invalid_request' });
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch {
      return reply(400, { error: 'invalid_request' });
    }
    const input = phoneVerificationRequestSchema.safeParse(raw);
    if (!input.success) return reply(400, { error: 'invalid_request' });
    const { phone } = input.data;

    const env = whatsappEnv();
    if (!env) return reply(500, { error: 'whatsapp_not_configured' });
    const provider = whatsappProvider(env, admin);

    const started = await admin.rpc('start_phone_verification', {
      p_user_id: user.id,
      p_phone: phone,
    });
    const result = startedSchema.safeParse(started.data);
    if (started.error || !result.success) {
      console.error(
        JSON.stringify({
          event: 'phone_verification_failed',
          stage: 'start',
          code: started.error?.code,
        }),
      );
      return reply(500, { error: 'internal' });
    }
    if ('error' in result.data) {
      console.log(
        JSON.stringify({ event: 'phone_verification_refused', code: 'phone_rate_limited' }),
      );
      return reply(429, result.data);
    }
    const { code, expiresAt, resendAt } = result.data;

    // A provider that throws (the console's insert) is a failed send too. The code still counts.
    const sent = await provider
      .send({
        kind: 'code',
        to: phone,
        template: whatsappDefaults.templates.phoneCode,
        language: LANGUAGE,
        code,
      })
      .catch(() => ({ kind: 'failed' as const, code: 'wa_provider_error' }));
    if (sent.kind !== 'accepted') {
      console.error(
        JSON.stringify({ event: 'phone_verification_failed', stage: 'send', code: sent.code }),
      );
      const error: PhoneVerificationError = { error: 'whatsapp_send_failed' };
      return reply(502, error);
    }

    const line = await admin.from('whatsapp_messages').insert({
      user_id: user.id,
      purpose: 'phone_code',
      template: whatsappDefaults.templates.phoneCode,
      provider: provider.name,
      provider_message_id: sent.providerMessageId,
      recipient_wa_id: sent.waId,
    });
    // The code is out already: a 500 would only make the user ask again and hit the resend wait.
    if (line.error) {
      console.error(
        JSON.stringify({
          event: 'phone_verification_failed',
          stage: 'record',
          code: line.error.code,
        }),
      );
    }

    console.log(JSON.stringify({ event: 'phone_verification_sent', provider: provider.name }));
    return reply(
      200,
      phoneVerificationStartedSchema.parse({
        expiresAt: new Date(expiresAt).toISOString(),
        resendAt: new Date(resendAt).toISOString(),
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
