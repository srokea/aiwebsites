// Jedno miejsce z przypiętą wersją supabase-js.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export function makeClient({ persistSession }) {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession, autoRefreshToken: persistSession, detectSessionInUrl: persistSession },
  });
}
