/**
 * POST /api/reserve — zapis rezerwacji stolika i mail z potwierdzeniem.
 *
 * Jedyna droga do utworzenia rezerwacji. Klucz publiczny Supabase nie ma prawa
 * wywołać create_reservation; robi to tylko ta funkcja kluczem secret,
 * i to dopiero po weryfikacji Cloudflare Turnstile.
 *
 * Plik routingu to functions/api/reserve.js — dokłada prawdziwą wysyłkę maila.
 * Tutaj logika, którą testy w Node wywołują z atrapą maila.
 *
 * Zmienne środowiskowe (Cloudflare Pages → Settings → Variables and Secrets;
 * lokalnie plik .dev.vars):
 *   SUPABASE_URL          https://<projekt>.supabase.co
 *   SUPABASE_SECRET_KEY   sb_secret_… (albo starszy klucz service_role — działa tak samo)
 *   TURNSTILE_SECRET_KEY  sekret widgetu Turnstile
 *   SMTP_USER             adres Gmail restauracji
 *   SMTP_PASSWORD         „hasło do aplikacji” z konta Google (16 liter)
 * Bez SMTP_* rezerwacje działają, tylko mail nie wychodzi (email: 'failed').
 *
 * Odpowiedź: { ok: true, reservation, email: 'sent'|'failed'|'skipped' }
 * albo { ok: false, error: '<kod>' }. Kody błędów obsługuje js/booking.js (errorMessage).
 */

import { normalizePhone } from '../js/phone.js';
import { normalizeEmail } from '../js/email.js';

export { normalizePhone, normalizeEmail };

const MAX_BODY_BYTES = 4096;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

// Kody z bazy, które oznaczają „tego terminu już nie ma” — dla gościa to ta sama sytuacja.
const UNAVAILABLE = new Set(['slot_taken', 'too_soon', 'outside_hours', 'closed', 'beyond_horizon']);

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function optionalText(value, max) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const v = value.trim();
  if (v.length > max) return { ok: false };
  return { ok: true, value: v || null };
}

/** Sprawdza kształt danych. Reguły terminu (godziny, horyzont, stoliki) sprawdza baza. */
export function parseInput(body) {
  if (!body || typeof body !== 'object') return null;

  const { requestId, date, time, party, duration, name, phone, email, comment, acceptedRules, turnstileToken } = body;

  if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) return null;
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  if (typeof time !== 'string' || !TIME_RE.test(time)) return null;
  if (!Number.isInteger(party) || party < 1 || party > 50) return null;
  if (!Number.isInteger(duration) || duration < 30 || duration > 480) return null;
  if (acceptedRules !== true) return null;
  if (typeof turnstileToken !== 'string' || turnstileToken.length < 10 || turnstileToken.length > 2048) return null;

  if (typeof name !== 'string') return null;
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) return null;

  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return null;

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const c = optionalText(comment, 500);
  if (!c.ok) return null;

  return {
    requestId, date, time, party, duration,
    name: cleanName, phone: cleanPhone, email: cleanEmail, comment: c.value,
    turnstileToken,
  };
}

async function verifyTurnstile(token, ip, requestId, env) {
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  // Ponowiona wysyłka tej samej próby (np. po zerwanym połączeniu) nie zużywa tokenu drugi raz.
  form.append('idempotency_key', requestId);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}

async function callCreateReservation(input, env) {
  const key = env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, 'content-type': 'application/json' };
  // Starszy klucz service_role to JWT i musi też iść w Authorization.
  // Nowe klucze sb_secret_… nie są JWT — wystarczy apikey.
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/create_reservation`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_request_id: input.requestId,
      p_date: input.date,
      p_time: input.time,
      p_party: input.party,
      p_duration: input.duration,
      p_name: input.name,
      p_phone: input.phone,
      p_email: input.email,
      p_comment: input.comment,
    }),
  });

  if (!res.ok) {
    console.error('create_reservation HTTP', res.status, await res.text());
    return null;
  }
  return res.json();
}

/**
 * @param {{ request: Request, env: object }} context
 * @param {{ sendConfirmation: (env: object, mail: { to: string, reservation: object, cancelUrl: string, cancelMinBefore: number, cancellable: boolean }) => Promise<void> }} deps
 */
export async function handleReserve({ request, env }, { sendConfirmation }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.TURNSTILE_SECRET_KEY) {
    console.error('Brak zmiennych środowiskowych rezerwacji');
    return reply(500, { ok: false, error: 'server' });
  }

  // Tylko z własnej strony.
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return reply(403, { ok: false, error: 'forbidden' });
  }
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return reply(415, { ok: false, error: 'invalid' });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return reply(413, { ok: false, error: 'invalid' });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'invalid' });
  }

  const input = parseInput(body);
  if (!input) {
    return reply(400, { ok: false, error: 'invalid' });
  }

  let human = false;
  try {
    human = await verifyTurnstile(input.turnstileToken, request.headers.get('CF-Connecting-IP'), input.requestId, env);
  } catch (err) {
    console.error('Turnstile', err);
    return reply(502, { ok: false, error: 'server' });
  }
  if (!human) {
    return reply(403, { ok: false, error: 'captcha' });
  }

  let result;
  try {
    result = await callCreateReservation(input, env);
  } catch (err) {
    console.error('Supabase', err);
    return reply(502, { ok: false, error: 'server' });
  }
  if (!result) {
    return reply(502, { ok: false, error: 'server' });
  }

  if (result.ok) {
    // Mail tylko przy nowej rezerwacji. Ponowiona wysyłka (created: false) nie dubluje maila.
    let email = 'skipped';
    if (result.created === true && typeof result.cancel_token === 'string' && TOKEN_RE.test(result.cancel_token)) {
      try {
        await sendConfirmation(env, {
          to: input.email,
          reservation: result.reservation,
          cancelUrl: `${origin}/odwolaj/#${result.cancel_token}`,
          cancelMinBefore: result.cancel_min_before,
          cancellable: result.cancellable !== false,
        });
        email = 'sent';
      } catch (err) {
        // Rezerwacja jest zapisana — brak maila nie może jej cofnąć.
        console.error('Mail z potwierdzeniem', err?.message);
        email = 'failed';
      }
    }
    return reply(200, { ok: true, reservation: result.reservation, email });
  }
  if (UNAVAILABLE.has(result.error)) {
    return reply(409, { ok: false, error: result.error === 'slot_taken' ? 'slot_taken' : 'unavailable' });
  }
  if (result.error === 'limit') {
    return reply(429, { ok: false, error: 'limit' });
  }
  return reply(422, { ok: false, error: 'invalid' });
}

// Każda inna metoda niż POST. Bez tego Pages oddałby stronę główną z kodem 200.
export function methodNotAllowed() {
  return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
    status: 405,
    headers: { allow: 'POST', 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
