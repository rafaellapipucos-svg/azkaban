// The provider as the functions build it from their secrets (ADR-0009, section 12). Deno only: it
// writes the console's outbox with the service role client. A malformed secret is logged as an event
// name only, never a value, and the caller answers as not configured.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseWhatsAppEnv,
  type WhatsAppEnv,
} from '../../../../packages/config/src/whatsapp-env.ts';
import { createWhatsAppProvider, type WhatsAppProvider } from './provider.ts';

const names = [
  'WHATSAPP_PROVIDER',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
] as const;

/** The WhatsApp secrets, or null when they do not parse (as `meta` without its four). */
export function whatsappEnv(): WhatsAppEnv | null {
  try {
    return parseWhatsAppEnv(Object.fromEntries(names.map((name) => [name, Deno.env.get(name)])));
  } catch {
    console.error(JSON.stringify({ event: 'whatsapp_not_configured' }));
    return null;
  }
}

/** `console` writes the whole message to `whatsapp_console_messages`, and throws if it cannot. */
export function whatsappProvider(env: WhatsAppEnv, admin: SupabaseClient): WhatsAppProvider {
  return createWhatsAppProvider(env, {
    fetch,
    record: async (to, message) => {
      const { error } = await admin
        .from('whatsapp_console_messages')
        .insert({ to_e164: to, message });
      if (error) throw new Error('console_record');
    },
  });
}
