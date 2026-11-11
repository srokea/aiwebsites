// Wspólne dla przeglądarki (js/booking.js) i funkcji Pages (lib/reserve-handler.js).
// Tylko zwykłe adresy: bez cudzysłowów, spacji i nawiasów, bo adres trafia prosto do SMTP.
const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Adres małymi literami, bez spacji na brzegach. Zły albo pusty → null. */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}
