/**
 * worker/items.js — kafelki w siatce albumu: zdjęcia (plik w R2) i bloki tekstu.
 *
 * PER KLIENT: nic tu nie zmieniasz.
 *
 * Ważne:
 * - Zdjęcie przychodzi TU JUŻ JAKO WEBP — konwersję robi przeglądarka (Canvas API
 *   w panelu admina). Worker ma mało RAM-u i nie przetwarza obrazów.
 * - Kolumny `url` nie ma w bazie celowo — składamy ją przy odczycie z
 *   env.R2_PUBLIC_URL + r2_key, żeby zmiana domeny bucketu nie wymagała migracji.
 * - HTML bloków tekstu jest czyszczony przy zapisie (sanitizeHtml), bo strona
 *   publiczna wstawia go przez innerHTML.
 */

// Siatka ma 6 kolumn; kafelek może mieć 1–6 kolumn szerokości i 1–4 wiersze wysokości.
export const GRID_MAX_W = 6;
export const GRID_MAX_H = 4;

// Limit bezpieczeństwa: po konwersji do WebP 2000px zdjęcie ma zwykle 200–600 KB.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_HTML_LENGTH = 20000;

const DEFAULT_TEXT_STYLE = { font: 'Playfair Display', size: 32, align: 'center', color: '', bg: '' };

/* ---------- pomocnicze ---------- */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Publiczny adres pliku w R2. */
export function photoUrl(env, r2Key) {
  const base = String(env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  return `${base}/${r2Key}`;
}

/** Kasuje pliki z R2 partiami (R2 przyjmuje max 1000 kluczy na raz). */
export async function deleteR2Keys(env, keys) {
  const clean = keys.filter(Boolean);
  for (let i = 0; i < clean.length; i += 1000) {
    await env.BUCKET.delete(clean.slice(i, i + 1000));
  }
}

/**
 * Zostawia tylko proste formatowanie z edytora: pogrubienie, kursywa,
 * podkreślenie, nowe linie. Wszystkie atrybuty (style, onclick, href...) wylatują.
 * Tekst między tagami przeglądarka już zakodowała (&lt; itd.), więc jest bezpieczny.
 */
export function sanitizeHtml(html) {
  const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'p']);
  return String(html || '')
    .slice(0, MAX_HTML_LENGTH)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(\/?)\s*([a-z0-9]+)[^>]*>/gi, (match, slash, tag) => {
      const name = tag.toLowerCase();
      if (!allowed.has(name)) return '';
      if (name === 'br') return '<br>';
      return `<${slash}${name}>`;
    })
    // Resztki niedomkniętych tagów typu "<img src=x" bez ">".
    .replace(/<(?![/]?(b|strong|i|em|u|br|div|p)>)/gi, '&lt;');
}

/** Waliduje styl bloku tekstu — do bazy trafiają tylko znane pola i bezpieczne wartości. */
export function sanitizeStyle(input) {
  const source = typeof input === 'object' && input ? input : {};
  const hex = /^#[0-9a-f]{6}$/i;
  const style = { ...DEFAULT_TEXT_STYLE };

  if (typeof source.font === 'string' && /^[A-Za-z0-9 ]{1,60}$/.test(source.font)) style.font = source.font;
  if (Number.isFinite(Number(source.size))) style.size = clamp(Math.round(Number(source.size)), 10, 200);
  if (['left', 'center', 'right'].includes(source.align)) style.align = source.align;
  style.color = hex.test(source.color) ? source.color : '';
  style.bg = hex.test(source.bg) ? source.bg : '';
  return style;
}

function parseStyle(text) {
  try {
    return sanitizeStyle(JSON.parse(text || '{}'));
  } catch {
    return { ...DEFAULT_TEXT_STYLE };
  }
}

/** Wiersz z bazy → obiekt oddawany przez API. Pola zależą od typu kafelka. */
export function toPublicItem(env, row) {
  const base = {
    id: row.id,
    album_id: row.album_id,
    type: row.type,
    grid_w: row.grid_w,
    grid_h: row.grid_h,
    position: row.position,
  };
  if (row.type === 'photo') {
    return { ...base, url: photoUrl(env, row.r2_key), filename: row.filename, display_name: row.display_name };
  }
  return { ...base, html: row.html || '', style: parseStyle(row.style) };
}

async function nextPosition(env, albumId) {
  const row = await env.DB
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPosition FROM items WHERE album_id = ?')
    .bind(albumId)
    .first();
  return (row?.maxPosition ?? -1) + 1;
}

async function findAlbum(env, albumId) {
  if (!albumId) return null;
  return env.DB.prepare('SELECT id, folder_id FROM albums WHERE id = ?').bind(albumId).first();
}

async function getItem(env, id) {
  const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  return row ? toPublicItem(env, row) : null;
}

/* ---------- API modułu ---------- */

/**
 * Upload zdjęcia. FormData: `file` (WebP), `albumId`, opcjonalnie `portrait=1`
 * (panel sprawdza orientację przy konwersji — pionowe dostają wyższy kafelek).
 * Klucz w R2: {folderId}/{itemId}.webp
 */
export async function uploadPhoto(env, formData) {
  const file = formData.get('file');
  const albumId = formData.get('albumId');

  if (!file || typeof file === 'string') throw new Error('Brak pliku w polu `file`');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Plik jest za duży (limit 15 MB)');

  const album = await findAlbum(env, albumId);
  if (!album) throw new Error('Album nie istnieje');

  const id = crypto.randomUUID();
  const r2Key = `${album.folder_id}/${id}.webp`;

  // 1. Najpierw plik do R2 — jak się nie uda, w bazie nie zostanie sierota.
  await env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  // 2. Potem metadane do D1, na koniec albumu.
  const filename = (file.name || 'zdjecie.webp').slice(0, 200);
  const displayName = filename.replace(/\.[^.]+$/, '');
  const height = formData.get('portrait') === '1' ? 3 : 2;

  try {
    await env.DB
      .prepare(`INSERT INTO items (id, album_id, type, grid_w, grid_h, position, filename, r2_key, display_name)
                VALUES (?, ?, 'photo', 2, ?, ?, ?, ?, ?)`)
      .bind(id, album.id, height, await nextPosition(env, album.id), filename, r2Key, displayName)
      .run();
  } catch (error) {
    // Zapis metadanych padł — sprzątamy plik, żeby nie został śmieć w R2.
    await env.BUCKET.delete(r2Key);
    throw error;
  }

  return getItem(env, id);
}

/** Nowy blok tekstu na końcu albumu (pełna szerokość, jeden wiersz). */
export async function createText(env, { albumId, html, style } = {}) {
  const album = await findAlbum(env, albumId);
  if (!album) throw new Error('Album nie istnieje');

  const id = crypto.randomUUID();
  await env.DB
    .prepare(`INSERT INTO items (id, album_id, type, grid_w, grid_h, position, html, style)
              VALUES (?, ?, 'text', ?, 1, ?, ?, ?)`)
    .bind(
      id,
      album.id,
      GRID_MAX_W,
      await nextPosition(env, album.id),
      sanitizeHtml(html ?? 'Nowy tekst'),
      JSON.stringify(sanitizeStyle(style)),
    )
    .run();

  return getItem(env, id);
}

/**
 * Aktualizacja kafelka. Wszystkie pola opcjonalne:
 *   grid_w, grid_h, position, album_id (przeniesienie do innego albumu),
 *   display_name (zdjęcie), html + style (tekst)
 */
export async function updateItem(env, id, patch) {
  const fields = [];
  const values = [];
  const set = (sql, value) => { fields.push(sql); values.push(value); };

  if (Number.isInteger(patch.grid_w)) set('grid_w = ?', clamp(patch.grid_w, 1, GRID_MAX_W));
  if (Number.isInteger(patch.grid_h)) set('grid_h = ?', clamp(patch.grid_h, 1, GRID_MAX_H));
  if (Number.isInteger(patch.position)) set('position = ?', patch.position);
  if (typeof patch.display_name === 'string') set('display_name = ?', patch.display_name.trim().slice(0, 200));
  if (typeof patch.html === 'string') set('html = ?', sanitizeHtml(patch.html));
  if (patch.style && typeof patch.style === 'object') set('style = ?', JSON.stringify(sanitizeStyle(patch.style)));

  if (typeof patch.album_id === 'string') {
    if (!(await findAlbum(env, patch.album_id))) throw new Error('Album docelowy nie istnieje');
    set('album_id = ?', patch.album_id);
  }

  if (!fields.length) throw new Error('Brak pól do aktualizacji');

  values.push(id);
  const result = await env.DB
    .prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return result.meta.changes ? getItem(env, id) : null;
}

/** Usuwa kafelek (dla zdjęcia także plik z R2). */
export async function deleteItem(env, id) {
  const row = await env.DB.prepare('SELECT r2_key FROM items WHERE id = ?').bind(id).first();
  if (!row) return false;

  await deleteR2Keys(env, [row.r2_key]);
  await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
  return true;
}
