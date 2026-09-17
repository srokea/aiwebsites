/**
 * worker/auth.js — logowanie hasłem + JWT podpisany HMAC-SHA256.
 *
 * Zero zewnętrznych bibliotek: wszystko na Web Crypto API (SubtleCrypto),
 * które jest dostępne w runtime Cloudflare Workers.
 *
 * PER KLIENT: nic tu nie zmieniasz. Hasło (ADMIN_PASSWORD) i sekret podpisu
 * (JWT_SECRET) ustawiasz przez `wrangler secret put`.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ---------- base64url (ręcznie, bo atob/btoa robią zwykłe base64) ---------- */

function base64urlFromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromString(text) {
  return base64urlFromBytes(encoder.encode(text));
}

function bytesFromBase64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function stringFromBase64url(text) {
  return decoder.decode(bytesFromBase64url(text));
}

/* ---------- podpis ---------- */

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Porównanie stringów w stałym czasie — żeby po czasie odpowiedzi nie dało się
 * zgadywać hasła znak po znaku.
 */
function safeEqual(a, b) {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  // Różna długość też musi kosztować tyle samo, więc lecimy po dłuższym.
  const length = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < length; i++) {
    diff |= (bytesA[i] || 0) ^ (bytesB[i] || 0);
  }
  return diff === 0;
}

/* ---------- API modułu ---------- */

/** Sprawdza hasło z formularza logowania przeciwko env.ADMIN_PASSWORD. */
export function checkPassword(password, env) {
  if (typeof password !== 'string' || !env.ADMIN_PASSWORD) return false;
  return safeEqual(password, env.ADMIN_PASSWORD);
}

/** Tworzy podpisany JWT ważny domyślnie 24 h. */
export async function createToken(env, ttlSeconds = 60 * 60 * 24) {
  // Krótki albo brakujący sekret = tokeny do podrobienia. Lepiej głośno paść.
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET nie jest ustawiony (min. 32 znaki)');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: 'admin', iat: now, exp: now + ttlSeconds };

  const body = base64urlFromString(JSON.stringify(header))
    + '.' + base64urlFromString(JSON.stringify(payload));

  const key = await hmacKey(env.JWT_SECRET);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));

  return body + '.' + base64urlFromBytes(signature);
}

/**
 * Weryfikuje token: poprawny podpis + nie wygasł.
 * Zwraca payload albo null (nigdy nie rzuca).
 */
export async function verifyToken(token, env) {
  try {
    if (!token || !env.JWT_SECRET) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerPart, payloadPart, signaturePart] = parts;
    const body = headerPart + '.' + payloadPart;

    const key = await hmacKey(env.JWT_SECRET);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      bytesFromBase64url(signaturePart),
      encoder.encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(stringFromBase64url(payloadPart));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Middleware auth: czyta nagłówek `Authorization: Bearer <token>`.
 * Zwraca payload gdy token jest ważny, w przeciwnym razie null.
 */
export async function authenticate(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifyToken(match[1].trim(), env);
}
