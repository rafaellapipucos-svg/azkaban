import { createClient } from '@supabase/supabase-js';

export function createDataClient(url: string, publishableKey: string) {
  return createClient(url, publishableKey);
}
