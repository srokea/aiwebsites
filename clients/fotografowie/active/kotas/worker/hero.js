/**
 * worker/hero.js — opcjonalny slideshow tla hero (zamiast jednego statycznego
 * zdjecia na komputer/telefon, patrz settings.js). Zdjecia trzymane OSOBNO od
 * folder/album/item — to tresc USTAWIEN strony, nie portfolio, i nigdy nie
 * pojawia sie w publicznej galerii.
 *
 * Kazdy slajd ma `is_portrait`: front pokazuje pionowe zdjecia na telefonie,
 * poziome na komputerze (zeby pionowe "z telefonu" nie rozjezdzaly sie na
 * szerokim ekranie i odwrotnie).
 */

import { deleteR2Keys } from './items.js';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function photoUrl(env, r2Key) {
  const base = String(env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  return `${base}/${r2Key}`;
}

function toPublic(env, row) {
  return {
    id: row.id,
    url: photoUrl(env, row.r2_key),
    isPortrait: !!row.is_portrait,
    position: row.position,
  };
}

/** Wszystkie slajdy w kolejnosci — front sam dzieli je wg isPortrait. */
export async function listHeroSlides(env) {
  const { results } = await env.DB
    .prepare('SELECT * FROM hero_slides ORDER BY position ASC')
    .all();
  return (results || []).map((row) => toPublic(env, row));
}

/** Upload slajdu. FormData: `file` (WebP), `portrait` ('1' jesli pionowe). */
export async function uploadHeroSlide(env, formData) {
  const file = formData.get('file');
  if (!file || typeof file === 'string') throw new Error('Brak pliku w polu `file`');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Plik jest za duży (limit 15 MB)');

  const isPortrait = formData.get('portrait') === '1' ? 1 : 0;
  const id = crypto.randomUUID();
  const r2Key = `hero-slides/${id}.webp`;

  await env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
  });

  const row = await env.DB
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPosition FROM hero_slides')
    .first();
  const position = (row?.maxPosition ?? -1) + 1;

  try {
    await env.DB
      .prepare('INSERT INTO hero_slides (id, r2_key, is_portrait, position) VALUES (?, ?, ?, ?)')
      .bind(id, r2Key, isPortrait, position)
      .run();
  } catch (error) {
    await env.BUCKET.delete(r2Key);
    throw error;
  }

  return toPublic(env, { id, r2_key: r2Key, is_portrait: isPortrait, position });
}

/** Zmiana kolejności — jedyne pole slajdu, które ma sens edytować po fakcie. */
export async function updateHeroSlide(env, id, patch) {
  if (!Number.isInteger(patch.position)) throw new Error('Brak pól do aktualizacji');
  const result = await env.DB
    .prepare('UPDATE hero_slides SET position = ? WHERE id = ?')
    .bind(patch.position, id)
    .run();
  if (!result.meta.changes) return null;
  const updated = await env.DB.prepare('SELECT * FROM hero_slides WHERE id = ?').bind(id).first();
  return toPublic(env, updated);
}

export async function deleteHeroSlide(env, id) {
  const row = await env.DB.prepare('SELECT r2_key FROM hero_slides WHERE id = ?').bind(id).first();
  if (!row) return false;
  await deleteR2Keys(env, [row.r2_key]);
  await env.DB.prepare('DELETE FROM hero_slides WHERE id = ?').bind(id).run();
  return true;
}
