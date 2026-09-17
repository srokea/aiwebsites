/**
 * worker/albums.js — albumy, czyli sekcje wyświetlane jedna pod drugą w folderze
 * (np. folder "Śluby" → albumy "Ślub Gosi", "Ślub Asi").
 *
 * PER KLIENT: nic tu nie zmieniasz.
 */

import { deleteR2Keys } from './items.js';

const SELECT_ALBUM = 'SELECT id, folder_id, name, position, created_at FROM albums WHERE id = ?';

/** Nowy album na końcu folderu. Nazwa może być pusta (sekcja bez nagłówka). */
export async function createAlbum(env, { folderId, name } = {}) {
  const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(folderId || '').first();
  if (!folder) throw new Error('Folder nie istnieje');

  const row = await env.DB
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPosition FROM albums WHERE folder_id = ?')
    .bind(folder.id)
    .first();

  const id = crypto.randomUUID();
  await env.DB
    .prepare('INSERT INTO albums (id, folder_id, name, position) VALUES (?, ?, ?, ?)')
    .bind(id, folder.id, String(name ?? '').trim().slice(0, 200), (row?.maxPosition ?? -1) + 1)
    .run();

  return env.DB.prepare(SELECT_ALBUM).bind(id).first();
}

/** Zmiana nazwy i/lub pozycji albumu. */
export async function updateAlbum(env, id, patch) {
  const fields = [];
  const values = [];

  if (typeof patch.name === 'string') {
    fields.push('name = ?');
    values.push(patch.name.trim().slice(0, 200));
  }
  if (Number.isInteger(patch.position)) {
    fields.push('position = ?');
    values.push(patch.position);
  }
  if (!fields.length) throw new Error('Brak pól do aktualizacji');

  values.push(id);
  const result = await env.DB
    .prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return result.meta.changes ? env.DB.prepare(SELECT_ALBUM).bind(id).first() : null;
}

/** Usuwa album razem z kafelkami — z D1 i plikami z R2. */
export async function deleteAlbum(env, id) {
  const album = await env.DB.prepare('SELECT id FROM albums WHERE id = ?').bind(id).first();
  if (!album) return false;

  const { results } = await env.DB
    .prepare("SELECT r2_key FROM items WHERE album_id = ? AND type = 'photo'")
    .bind(id)
    .all();
  await deleteR2Keys(env, (results || []).map((row) => row.r2_key));

  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE album_id = ?').bind(id),
    env.DB.prepare('DELETE FROM albums WHERE id = ?').bind(id),
  ]);
  return true;
}
