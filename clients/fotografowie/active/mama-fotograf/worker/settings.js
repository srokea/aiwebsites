/**
 * worker/settings.js — ustawienia strony spoza hierarchii folder/album/item.
 *
 * Dziś: tło hero na komputer i na telefon (osobne kadry), plus tryb hero
 * (static/slideshow, patrz hero.js). Prosty klucz-wartość w D1, żeby
 * dorzucenie kolejnego ustawienia w przyszłości nie wymagało migracji.
 *
 * PER KLIENT: nic tu nie zmieniasz.
 */

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const SLOTS = ['desktop', 'mobile'];

/** Wszystkie ustawienia jako { hero_desktop: url, hero_mobile: url, ... }. */
export async function getSettings(env) {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const row of rows.results) out[row.key] = row.value;
  return out;
}

async function setSetting(env, key, value) {
  await env.DB
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

/**
 * Upload zdjęcia hero. FormData: `file` (WebP, konwersja jak przy zdjęciach
 * portfolio). `slot` to 'desktop' albo 'mobile'.
 *
 * Klucz w R2 jest STAŁY (settings/hero-{slot}.webp) — każda kolejna podmiana
 * nadpisuje ten sam plik, więc w bazie zawsze jest tylko jeden rekord na slot,
 * bez śmieci po starych zdjęciach. Cache jest celowo krótki i URL ma doklejony
 * znacznik czasu — inaczej przeglądarki i CDN trzymałyby stare zdjęcie mimo
 * podmiany (ten sam adres = "ten sam plik" z punktu widzenia cache'u).
 */
export async function uploadHeroImage(env, formData, slot) {
  if (!SLOTS.includes(slot)) throw new Error('Nieprawidłowy slot (desktop albo mobile)');

  const file = formData.get('file');
  if (!file || typeof file === 'string') throw new Error('Brak pliku w polu `file`');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Plik jest za duży (limit 15 MB)');

  const r2Key = `settings/hero-${slot}.webp`;
  await env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=300' },
  });

  const base = String(env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  const url = `${base}/${r2Key}?v=${Date.now()}`;
  await setSetting(env, `hero_${slot}`, url);
  return { slot, url };
}

/**
 * Tryb tła hero: 'static' (domyślnie, zdjęcia z uploadHeroImage powyżej) albo
 * 'slideshow' (slajdy z hero.js). Osobny przełącznik, żeby klient mógł wrócić
 * do statycznego zdjęcia jednym klikiem bez utraty niczego — oba tryby
 * trzymają swoje dane niezależnie.
 */
export async function setHeroMode(env, mode) {
  if (!['static', 'slideshow'].includes(mode)) throw new Error('Nieprawidłowy tryb hero (static albo slideshow)');
  await setSetting(env, 'hero_mode', mode);
  return { mode };
}
