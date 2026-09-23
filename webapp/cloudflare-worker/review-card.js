// Cloudflare Worker dla kart NFC: mmates.pl/r/:slug
//
// Ten plik NIE jest uruchamiany przez serwer coldcall - to kod do wklejenia w Cloudflare
// (Workers & Pages -> worker obslugujacy mmates.pl/r/* -> Edit code -> Deploy). Trzymamy go
// w repo, zeby zrodlo Workera nie zylo tylko w panelu Cloudflare.
//
// Dane karty czyta z Cloudflare KV (klucz = slug). Zapisuje je tam panel /reviews.html
// (server/routes/reviews.js -> syncToKV):
//   { business_name, tagline, google_url, emoji, logo_url,
//     show_logo, bg, bg_light, bg_image, bg_blur }
//
// Trasy:
//   GET /r/:slug        -> strona karty (logo/emoji, nazwa, tagline, przycisk do opinii)
//   GET /r/:slug/click  -> przekierowanie na link do opinii Google (albo 404 "Brak linku.")
// Wszystko inne przepuszczamy dalej bez zmian.

const DEFAULT_BG = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

// Binding KV wykrywamy sam (pierwszy obiekt w env z get/put), zeby nie trzeba bylo znac
// jego nazwy z ustawien Workera.
function findKV(env) {
  for (const v of Object.values(env || {})) {
    if (v && typeof v.get === "function" && typeof v.put === "function") return v;
  }
  return null;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// tlo przychodzi z serwera jako gotowa wartosc CSS (kolor albo linear-gradient) - i tak
// przepuszczamy tylko bezpieczne znaki, zeby nic nie wyszlo poza deklaracje CSS
const safeCss = (s) => (/^[#a-z0-9(),.%\s-]*$/i.test(String(s || "")) ? String(s || "") : "");
const safeUrl = (s) => (/^https:\/\/[^\s"'()<>]+$/i.test(String(s || "")) ? String(s) : "");

function renderCard(slug, d) {
  const name = d.business_name || "";
  const bg = safeCss(d.bg) || DEFAULT_BG;
  const bgImage = safeUrl(d.bg_image);
  const blur = Math.max(0, Math.min(20, Number(d.bg_blur) || 0));
  // przycisk w kolorze tla karty; na jasnym tle (bialy, bez) ciemny, zeby byl widoczny na bialej karcie
  const btnBg = d.bg_light ? "#1a1a2e" : bg;
  const btnShadow = d.bg ? "0 6px 20px rgba(0,0,0,0.25)" : "0 6px 20px rgba(102,126,234,0.5)";

  let logo = "";
  if (d.show_logo !== false) {
    if (safeUrl(d.logo_url)) {
      logo = `<img src="${esc(d.logo_url)}" alt="${esc(name)}" style="max-width:120px;max-height:80px;object-fit:contain;margin-bottom:16px;">`;
    } else if (d.emoji) {
      logo = `<div class="emoji">${esc(d.emoji)}</div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} – Opinie Google</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    background: ${bg};
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 20px;
    position: relative;
    overflow-x: hidden;
  }
  ${
    bgImage
      ? `body::before {
    content: "";
    position: fixed;
    inset: -${blur * 2}px;
    background: url("${bgImage}") center / cover no-repeat;
    filter: blur(${blur}px);
    z-index: -1;
  }`
      : ""
  }
  .card {
    background: white;
    border-radius: 24px;
    padding: 48px 36px;
    text-align: center;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .emoji { font-size: 64px; margin-bottom: 16px; }
  h1 { font-size: 26px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
  .tagline { font-size: 16px; color: #666; margin-bottom: 28px; }
  .stars { font-size: 36px; margin-bottom: 28px; letter-spacing: 4px; }
  .btn {
    display: block;
    background: ${btnBg};
    color: white;
    text-decoration: none;
    padding: 18px 32px;
    border-radius: 14px;
    font-size: 18px;
    font-weight: 700;
    box-shadow: ${btnShadow};
  }
  .powered { margin-top: 24px; font-size: 12px; color: #bbb; }
</style>
</head>
<body>
<div class="card">
  ${logo}
  <h1>${esc(name)}</h1>
  ${d.tagline ? `<p class="tagline">${esc(d.tagline)}</p>` : ""}
  <div class="stars">⭐⭐⭐⭐⭐</div>
  <a href="/r/${esc(slug)}/click" class="btn">Napisz opinię w Google</a>
  <p class="powered">Powered by MMates</p>
</div>
</body>
</html>`;
}

const text = (body, status) =>
  new Response(body, { status, headers: { "content-type": "text/plain;charset=UTF-8", "cache-control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/r\/([a-z0-9-]+)(\/click)?\/?$/);
    if (!m) return fetch(request); // nie nasza trasa - przepuszczamy

    const kv = findKV(env);
    if (!kv) return text("Brak konfiguracji KV.", 500);

    const slug = m[1];
    const raw = await kv.get(slug);
    if (!raw) return text("Nie znaleziono strony.", 404);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return text("Nie znaleziono strony.", 404);
    }

    if (m[2]) {
      const target = String(data.google_url || "").trim();
      if (!/^https?:\/\//i.test(target)) return text("Brak linku.", 404);
      return Response.redirect(target, 302);
    }

    return new Response(renderCard(slug, data), {
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
    });
  },
};
