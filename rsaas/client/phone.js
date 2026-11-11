// Wspólne dla przeglądarki (js/booking.js) i funkcji Pages (functions/api/reserve.js).
const E164_RE = /^\+[1-9]\d{7,14}$/;

/** Numer w formacie E.164. Polskie 9 cyfr bez kierunkowego → +48. Zły numer → null. */
export function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (/^\d{9}$/.test(p)) p = '+48' + p;
  return E164_RE.test(p) ? p : null;
}
