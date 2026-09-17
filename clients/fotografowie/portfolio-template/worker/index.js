/**
 * worker/index.js — punkt wejścia API. Routing + CORS + obsługa błędów.
 *
 * PER KLIENT: nic tu nie zmieniasz. Cała konfiguracja siedzi w wrangler.toml.
 *
 * Kontrakt odpowiedzi — zawsze JSON:
 *   sukces:  { ok: true,  data: ... }
 *   błąd:    { ok: false, error: "opis" }
 *
 * Endpointy publiczne (bez tokenu):
 *   GET    /api/folders                → lista folderów
 *   GET    /api/folders/:id/content    → albumy folderu z kafelkami
 *
 * Endpointy chronione (Authorization: Bearer <JWT>):
 *   POST   /api/folders                { name }
 *   PUT    /api/folders/:id            { name?, position? }
 *   DELETE /api/folders/:id
 *   POST   /api/albums                 { folderId, name? }
 *   PUT    /api/albums/:id             { name?, position? }
 *   DELETE /api/albums/:id
 *   POST   /api/items/upload           FormData: file, albumId, portrait?
 *   POST   /api/items/text             { albumId, html?, style? }
 *   PUT    /api/items/:id              { grid_w?, grid_h?, position?, album_id?, display_name?, html?, style? }
 *   DELETE /api/items/:id
 *
 * Logowanie:
 *   POST   /api/auth                   { password } → { token }
 */

import { authenticate, checkPassword, createToken } from './auth.js';
import { createAlbum, deleteAlbum, updateAlbum } from './albums.js';
import { createFolder, deleteFolder, getFolderContent, listFolders, updateFolder } from './folders.js';
import { createText, deleteItem, updateItem, uploadPhoto } from './items.js';

/* ---------- CORS ---------- */

/**
 * Zwraca nagłówki CORS. Origin echo-wany tylko wtedy, gdy pasuje do
 * ALLOWED_ORIGIN (można podać kilka po przecinku, np. domena + localhost do testów).
 */
function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  const match = allowed.includes(origin) ? origin : allowed[0] || '';

  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, request, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

const ok = (data, request, env) => json({ ok: true, data }, request, env);
const fail = (error, request, env, status = 400) =>
  json({ ok: false, error }, request, env, status);

/* ---------- pomocnicze ---------- */

/** Bezpieczne czytanie JSON-a z body — pusty/niepoprawny body daje {}. */
async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

/* ---------- router ---------- */

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  // /api/folders/abc/content → ['api', 'folders', 'abc', 'content']
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments[0] !== 'api') return fail('Nie znaleziono', request, env, 404);

  const [, resource, param = null, action = null] = segments;
  const notFound = (what) => fail(`${what} nie istnieje`, request, env, 404);

  /* --- logowanie --- */
  if (resource === 'auth' && method === 'POST') {
    const { password } = await readJson(request);
    if (!checkPassword(password, env)) {
      return fail('Nieprawidłowe hasło', request, env, 401);
    }
    return ok({ token: await createToken(env) }, request, env);
  }

  /* --- odczyt publiczny --- */
  if (resource === 'folders' && method === 'GET') {
    if (!param) return ok(await listFolders(env), request, env);
    if (action === 'content') {
      const content = await getFolderContent(env, param);
      return content ? ok(content, request, env) : notFound('Folder');
    }
  }

  /* --- od tego miejsca wymagany token --- */
  const session = await authenticate(request, env);
  if (!session) return fail('Wymagane logowanie', request, env, 401);

  if (resource === 'folders' && !action) {
    if (method === 'POST' && !param) {
      const { name } = await readJson(request);
      return ok(await createFolder(env, name), request, env);
    }
    if (method === 'PUT' && param) {
      const folder = await updateFolder(env, param, await readJson(request));
      return folder ? ok(folder, request, env) : notFound('Folder');
    }
    if (method === 'DELETE' && param) {
      return (await deleteFolder(env, param)) ? ok({ id: param }, request, env) : notFound('Folder');
    }
  }

  if (resource === 'albums' && !action) {
    if (method === 'POST' && !param) {
      return ok(await createAlbum(env, await readJson(request)), request, env);
    }
    if (method === 'PUT' && param) {
      const album = await updateAlbum(env, param, await readJson(request));
      return album ? ok(album, request, env) : notFound('Album');
    }
    if (method === 'DELETE' && param) {
      return (await deleteAlbum(env, param)) ? ok({ id: param }, request, env) : notFound('Album');
    }
  }

  if (resource === 'items' && !action) {
    if (method === 'POST' && param === 'upload') {
      return ok(await uploadPhoto(env, await request.formData()), request, env);
    }
    if (method === 'POST' && param === 'text') {
      return ok(await createText(env, await readJson(request)), request, env);
    }
    if (method === 'PUT' && param) {
      const item = await updateItem(env, param, await readJson(request));
      return item ? ok(item, request, env) : notFound('Element');
    }
    if (method === 'DELETE' && param) {
      return (await deleteItem(env, param)) ? ok({ id: param }, request, env) : notFound('Element');
    }
  }

  return fail('Nie znaleziono', request, env, 404);
}

export default {
  async fetch(request, env) {
    // Preflight — przeglądarka pyta o zgodę przed PUT/DELETE i przed nagłówkiem Authorization.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      return await route(request, env);
    } catch (error) {
      // Komunikat błędu leci do panelu admina — to narzędzie wewnętrzne, nie strona publiczna.
      return fail(error?.message || 'Błąd serwera', request, env, 500);
    }
  },
};
