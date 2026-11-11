// RSaaS. Wszystko, co widget rezerwacji robi z siecią: Supabase (odczyt + realtime),
// funkcja /api/reserve (zapis) i Cloudflare Turnstile.
// js/booking.js dostaje ten obiekt z zewnątrz, więc UI nie wie nic o Supabase.

import { makeClient } from './supabase-client.js';
import { TURNSTILE_SITE_KEY, RESTAURANT_SLUG } from '../config.js';

let turnstileScript;

const TIMEOUT_MS = 12000;
// Rezerwacja czeka też na Turnstile i wysyłkę maila (limit SMTP w funkcji: 8 s).
const RESERVE_TIMEOUT_MS = 25000;

/** Zawieszone połączenie (np. wstrzymany projekt Supabase) ma skończyć się błędem, nie wiecznym „Sprawdzam…”. */
function withTimeout(promise, label, ms = TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: brak odpowiedzi po ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function loadTurnstile() {
  turnstileScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => reject(new Error('Turnstile nie wczytał się'));
    document.head.appendChild(s);
  });
  return turnstileScript;
}

export function createBookingApi() {
  const supabase = makeClient({ persistSession: false });

  return {
    async loadConfig() {
      const { data, error } = await withTimeout(
        supabase.rpc('get_public_config', { p_slug: RESTAURANT_SLUG }),
        'konfiguracja',
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(`konfiguracja: ${data?.error ?? 'brak danych'} (slug „${RESTAURANT_SLUG}”)`);
      return { restaurant: data.restaurant, settings: data.settings, hours: data.hours };
    },

    async getSlots(date, party, duration) {
      const { data, error } = await withTimeout(supabase.rpc('get_available_slots', {
        p_slug: RESTAURANT_SLUG,
        p_date: date,
        p_party: party,
        p_duration: duration,
      }), 'wolne godziny');
      if (error) throw error;
      return data.map((row) => row.start_time);
    },

    /** Zawsze zwraca { ok, reservation } albo { ok: false, error }. Nigdy nie rzuca. */
    async reserve(payload) {
      let res;
      try {
        res = await withTimeout(fetch('/api/reserve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }), 'rezerwacja', RESERVE_TIMEOUT_MS);
      } catch {
        return { ok: false, error: 'network' };
      }
      try {
        return await res.json();
      } catch {
        return { ok: false, error: 'server' };
      }
    },

    /** cb(dateIso) przy każdej zmianie dostępności. Zwraca funkcję wyrejestrowującą. */
    onAvailabilityChange(cb) {
      const channel = supabase
        .channel(`availability:${RESTAURANT_SLUG}`)
        .on('broadcast', { event: 'changed' }, ({ payload }) => cb(payload?.date))
        .subscribe();
      return () => supabase.removeChannel(channel);
    },

    async mountCaptcha(el, { onToken, onExpire, onError }) {
      const turnstile = await loadTurnstile();
      const id = turnstile.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        language: 'pl',
        size: 'flexible',
        callback: onToken,
        'expired-callback': onExpire,
        'error-callback': onError,
      });
      return { reset: () => turnstile.reset(id) };
    },
  };
}
