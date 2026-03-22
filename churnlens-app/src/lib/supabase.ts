import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    // Support both NEXT_PUBLIC_ prefixed and plain env var names
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) {
      throw new Error('Supabase env vars not set');
    }
    _client = createClient(url, key);
  }
  return _client;
}

// Keep a named export for convenience (throws if env vars missing)
export const supabase = {
  from: (table: string) => getSupabase().from(table),
};
