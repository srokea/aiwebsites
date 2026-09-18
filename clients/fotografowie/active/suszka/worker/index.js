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
 *   GET    /api/settings               → { hero_desktop?, hero_mobile?, hero_mode?, ... }
 *   GET    /api/hero-slides            → lista slajdów tła hero (patrz hero_mode)
 *   GET    /api/trusted                → lista wpisów "Zaufali mi"
 *
 * Endpointy chronione (Authorization: Bearer <JWT>):
 *   POST   /api/folders                { name }
 *   PUT    /api/folders/:id            { name?, position?, grp? (1|2) }
 *   DELETE /api/folders/:id
 *   POST   /api/albums                 { folderId, name? }
 *   PUT    /api/albums/:id             { name?, position? }
 *   DELETE /api/albums/:id
 *   POST   /api/items/upload           FormData: file, albumId, portrait?
 *   POST   /api/items/upload-video     FormData: file, poster?, albumId, caption?
 *   POST   /api/items/text             { albumId, html?, style? }
 *   PUT    /api/items/:id              { grid_w?, grid_h?, position?, album_id?, display_name?, html?, style? }
 *   DELETE /api/items/:id
 *   POST   /api/settings/hero-desktop  FormData: file (WebP)
 *   POST   /api/settings/hero-mobile   FormData: file (WebP)
 *   POST   /api/settings/hero-mode     { mode: 'static' | 'slideshow' }
 *   POST   /api/settings/groups        { group1_name?, group2_name? }
 *   POST   /api/hero-slides            FormData: file, portrait?
 *   PUT    /api/hero-slides/:id        { position }
 *   DELETE /api/hero-slides/:id
 *   POST   /api/trusted                → nowy pusty wpis
 *   PUT    /api/trusted/:id            { name?, link?, position? }
 *   POST   /api/trusted/:id/avatar     FormData: file (WebP)
 *   DELETE /api/trusted/:id
 *
 * Logowanie:
 *   POST   /api/auth                   { password } → { token }
 */

import { authenticate, checkPassword, createToken } from './auth.js';
import { createAlbum, deleteAlbum, updateAlbum } from './albums.js';
import { createFolder, deleteFolder, getFolderContent, listFolders, updateFolder } from './folders.js';
import { createText, deleteItem, updateItem, uploadPhoto, uploadVideo } from './items.js';
import { getSettings, setGroupNames, setHeroMode, uploadHeroImage } from './settings.js';
import { deleteHeroSlide, listHeroSlides, updateHeroSlide, uploadHeroSlide } from './hero.js';
import { createTrusted, deleteTrusted, listTrusted, updateTrusted, uploadTrustedAvatar } from './trusted.js';

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

  if (resource === 'settings' && method === 'GET' && !param) {
    return ok(await getSettings(env), request, env);
  }

  if (resource === 'hero-slides' && method === 'GET' && !param) {
    return ok(await listHeroSlides(env), request, env);
  }

  if (resource === 'trusted' && method === 'GET' && !param) {
    return ok(await listTrusted(env), request, env);
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
    if (method === 'POST' && param === 'upload-video') {
      return ok(await uploadVideo(env, await request.formData()), request, env);
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

  if (resource === 'settings' && method === 'POST' && (param === 'hero-desktop' || param === 'hero-mobile')) {
    const slot = param === 'hero-desktop' ? 'desktop' : 'mobile';
    return ok(await uploadHeroImage(env, await request.formData(), slot), request, env);
  }

  if (resource === 'settings' && method === 'POST' && param === 'groups') {
    return ok(await setGroupNames(env, await readJson(request)), request, env);
  }

  if (resource === 'settings' && method === 'POST' && param === 'hero-mode') {
    const { mode } = await readJson(request);
    return ok(await setHeroMode(env, mode), request, env);
  }

  if (resource === 'hero-slides' && !action) {
    if (method === 'POST' && !param) {
      return ok(await uploadHeroSlide(env, await request.formData()), request, env);
    }
    if (method === 'PUT' && param) {
      const slide = await updateHeroSlide(env, param, await readJson(request));
      return slide ? ok(slide, request, env) : notFound('Slajd');
    }
    if (method === 'DELETE' && param) {
      return (await deleteHeroSlide(env, param)) ? ok({ id: param }, request, env) : notFound('Slajd');
    }
  }

  if (resource === 'trusted') {
    if (method === 'POST' && !param) {
      return ok(await createTrusted(env), request, env);
    }
    if (method === 'PUT' && param && !action) {
      const entry = await updateTrusted(env, param, await readJson(request));
      return entry ? ok(entry, request, env) : notFound('Wpis');
    }
    if (method === 'POST' && param && action === 'avatar') {
      return ok(await uploadTrustedAvatar(env, param, await request.formData()), request, env);
    }
    if (method === 'DELETE' && param && !action) {
      return (await deleteTrusted(env, param)) ? ok({ id: param }, request, env) : notFound('Wpis');
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

    // Lokalny zamiennik publicznego bucketu R2 — `wrangler dev` nie wystawia
    // R2 pod prawdziwym adresem HTTP tak jak produkcja. Do testow lokalnych
    // R2_PUBLIC_URL w .dev.vars wskazuje na ten wlasnie adres. U Magdy tak
    // samo na produkcji (wrangler.toml): zdjecia ida przez worker, bucket
    // nie jest publiczny.
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.startsWith('/r2/')) {
      const key = decodeURIComponent(url.pathname.slice('/r2/'.length));
      const object = await env.BUCKET.get(key);
      if (!object) return new Response('Nie znaleziono', { status: 404 });
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    try {
      return await route(request, env);
    } catch (error) {
      // Komunikat błędu leci do panelu admina — to narzędzie wewnętrzne, nie strona publiczna.
      return fail(error?.message || 'Błąd serwera', request, env, 500);
    }
  },
};
