// Strona /odwolaj/ rozmawia z bazą tylko przez te dwie funkcje. Token jest jedynym „hasłem”.
import { makeClient } from './supabase-client.js';

const TIMEOUT_MS = 12000;

export function createCancelApi() {
  const supabase = makeClient({ persistSession: false });

  async function rpc(name, args) {
    let timer;
    const { data, error } = await Promise.race([
      supabase.rpc(name, args),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name}: brak odpowiedzi po ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    if (error) throw error;
    return data;
  }

  return {
    lookup: (token) => rpc('reservation_by_token', { p_token: token }),
    cancel: (token) => rpc('cancel_reservation_by_token', { p_token: token }),
  };
}
