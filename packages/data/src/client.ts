import { isWeb, storage } from '@azkaban/platform';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let client: SupabaseClient<Database> | undefined;
let apiUrl = '';

export function initData(url: string, publishableKey: string) {
  apiUrl = url;
  client = createClient<Database>(url, publishableKey, {
    auth: { storage, detectSessionInUrl: isWeb },
  });
}

export function db() {
  if (!client) throw new Error('initData must run before any repository call');
  return client;
}

/** The address this device reaches the API at. */
export const publicApiUrl = () => apiUrl;

export async function currentUserId() {
  const { data } = await db().auth.getSession();
  if (!data.session) throw new Error('not_authenticated');
  return data.session.user.id;
}
