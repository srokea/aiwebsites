/**
 * worker/trusted.js — sekcja "Zaufali mi": avatar + nazwa firmy + link,
 * edytowalne z panelu zamiast wpisywane na sztywno w public/index.html.
 */

import { deleteR2Keys } from './items.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_NAME_LENGTH = 100;
const MAX_LINK_LENGTH = 500;

function photoUrl(env, r2Key) {
  const base = String(env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  return `${base}/${r2Key}`;
}

/**
 * Link musi być bezpiecznym adresem http(s) — to pole trafia prosto do
 * atrybutu href na stronie publicznej. Bez tej walidacji dałoby się wkleić
 * "javascript:..." i uruchomić dowolny kod w przeglądarce odwiedzającego
 * (ten sam powód co sanitizeHtml w items.js dla bloków tekstu).
 */
function sanitizeLink(link) {
  const value = String(link || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value.slice(0, MAX_LINK_LENGTH);
}

function toPublic(env, row) {
  return {
    id: row.id,
    url: row.r2_key ? photoUrl(env, row.r2_key) : null,
    name: row.name || '',
    link: row.link || '',
    position: row.position,
  };
}

export async function listTrusted(env) {
  const { results } = await env.DB
    .prepare('SELECT * FROM trusted_entries ORDER BY position ASC')
    .all();
  return (results || []).map((row) => toPublic(env, row));
}

/** Nowy, pusty wpis (bez avatara) na końcu listy. */
export async function createTrusted(env) {
  const row = await env.DB
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPosition FROM trusted_entries')
    .first();
  const position = (row?.maxPosition ?? -1) + 1;
  const id = crypto.randomUUID();

  await env.DB
    .prepare('INSERT INTO trusted_entries (id, name, link, position) VALUES (?, ?, ?, ?)')
    .bind(id, '', '', position)
    .run();

  return toPublic(env, { id, r2_key: null, name: '', link: '', position });
}

/** Zmiana nazwy / linku / kolejności — wszystkie pola opcjonalne. */
export async function updateTrusted(env, id, patch) {
  const fields = [];
  const values = [];

  if (typeof patch.name === 'string') { fields.push('name = ?'); values.push(patch.name.trim().slice(0, MAX_NAME_LENGTH)); }
  if (typeof patch.link === 'string') { fields.push('link = ?'); values.push(sanitizeLink(patch.link)); }
  if (Number.isInteger(patch.position)) { fields.push('position = ?'); values.push(patch.position); }

  if (!fields.length) throw new Error('Brak pól do aktualizacji');

  values.push(id);
  const result = await env.DB
    .prepare(`UPDATE trusted_entries SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  if (!result.meta.changes) return null;
  const updated = await env.DB.prepare('SELECT * FROM trusted_entries WHERE id = ?').bind(id).first();
  return toPublic(env, updated);
}

/** Upload/podmiana avatara. FormData: `file` (WebP, kwadrat). */
export async function uploadTrustedAvatar(env, id, formData) {
  const existing = await env.DB.prepare('SELECT r2_key FROM trusted_entries WHERE id = ?').bind(id).first();
  if (!existing) throw new Error('Wpis nie istnieje');

  const file = formData.get('file');
  if (!file || typeof file === 'string') throw new Error('Brak pliku w polu `file`');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Plik jest za duży (limit 5 MB)');

  // Klucz jest STAŁY (jeden na wpis) — kolejna podmiana nadpisuje ten sam
  // plik, więc URL dostaje znacznik czasu (ten sam wzorzec co hero_desktop/
  // hero_mobile w settings.js), inaczej cache trzymałby stary avatar.
  const r2Key = `trusted/${id}.webp`;
  await env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'image/webp', cacheControl: 'public, max-age=300' },
  });

  await env.DB.prepare('UPDATE trusted_entries SET r2_key = ? WHERE id = ?').bind(r2Key, id).run();
  const updated = await env.DB.prepare('SELECT * FROM trusted_entries WHERE id = ?').bind(id).first();
  return { ...toPublic(env, updated), url: `${photoUrl(env, r2Key)}?v=${Date.now()}` };
}

export async function deleteTrusted(env, id) {
  const row = await env.DB.prepare('SELECT r2_key FROM trusted_entries WHERE id = ?').bind(id).first();
  if (!row) return false;
  if (row.r2_key) await deleteR2Keys(env, [row.r2_key]);
  await env.DB.prepare('DELETE FROM trusted_entries WHERE id = ?').bind(id).run();
  return true;
}
