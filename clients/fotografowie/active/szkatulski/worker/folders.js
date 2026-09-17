/**
 * worker/folders.js — foldery (zakładki portfolio) + odczyt całej zawartości folderu.
 *
 * PER KLIENT: nic tu nie zmieniasz.
 *
 * Uwaga przy usuwaniu: kasujemy albumy i kafelki jawnie (a nie licząc na
 * ON DELETE CASCADE), bo i tak musimy zebrać klucze R2 (zdjęcia, rolki
 * i ich plakaty), żeby wyczyścić pliki z bucketu.
 */

import { deleteR2Keys, toPublicItem } from './items.js';

const SELECT_FOLDER = 'SELECT id, name, position, created_at FROM folders WHERE id = ?';

/** Wszystkie foldery, w kolejności ustawionej w panelu. */
export async function listFolders(env) {
  const { results } = await env.DB
    .prepare('SELECT id, name, position, created_at FROM folders ORDER BY position ASC')
    .all();
  return results || [];
}

/**
 * Zawartość folderu dla strony publicznej i panelu — jednym zapytaniem z frontu:
 *   [{ id, name, position, items: [{ type: 'photo' | 'text', ... }] }]
 * Zwraca null, gdy folder nie istnieje.
 */
export async function getFolderContent(env, folderId) {
  const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(folderId).first();
  if (!folder) return null;

  const [albumsResult, itemsResult] = await env.DB.batch([
    env.DB
      .prepare('SELECT id, name, position FROM albums WHERE folder_id = ? ORDER BY position ASC')
      .bind(folderId),
    env.DB
      .prepare(`SELECT items.* FROM items
                JOIN albums ON albums.id = items.album_id
                WHERE albums.folder_id = ?
                ORDER BY items.position ASC`)
      .bind(folderId),
  ]);

  const albums = (albumsResult.results || []).map((album) => ({ ...album, items: [] }));
  const byId = new Map(albums.map((album) => [album.id, album]));
  for (const row of itemsResult.results || []) {
    byId.get(row.album_id)?.items.push(toPublicItem(env, row));
  }
  return albums;
}

/**
 * Nowy folder na końcu listy. Od razu dostaje jeden album bez nazwy,
 * żeby dało się wrzucać zdjęcia bez dodatkowego kroku.
 */
export async function createFolder(env, name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Nazwa folderu jest wymagana');

  const row = await env.DB
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPosition FROM folders')
    .first();

  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB
      .prepare('INSERT INTO folders (id, name, position) VALUES (?, ?, ?)')
      .bind(id, cleanName.slice(0, 200), (row?.maxPosition ?? -1) + 1),
    env.DB
      .prepare("INSERT INTO albums (id, folder_id, name, position) VALUES (?, ?, '', 0)")
      .bind(crypto.randomUUID(), id),
  ]);

  return env.DB.prepare(SELECT_FOLDER).bind(id).first();
}

/** Zmiana nazwy i/lub pozycji. Pola nieprzysłane zostają bez zmian. */
export async function updateFolder(env, id, patch) {
  const fields = [];
  const values = [];

  if (typeof patch.name === 'string' && patch.name.trim()) {
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
    .prepare(`UPDATE folders SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return result.meta.changes ? env.DB.prepare(SELECT_FOLDER).bind(id).first() : null;
}

/** Usuwa folder razem z albumami i zdjęciami — z D1 i z R2. */
export async function deleteFolder(env, id) {
  const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(id).first();
  if (!folder) return false;

  const { results } = await env.DB
    .prepare(`SELECT items.r2_key, items.poster_key FROM items
              JOIN albums ON albums.id = items.album_id
              WHERE albums.folder_id = ? AND items.type IN ('photo', 'video')`)
    .bind(id)
    .all();
  await deleteR2Keys(env, (results || []).flatMap((row) => [row.r2_key, row.poster_key]));

  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE album_id IN (SELECT id FROM albums WHERE folder_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM albums WHERE folder_id = ?').bind(id),
    env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id),
  ]);
  return true;
}
