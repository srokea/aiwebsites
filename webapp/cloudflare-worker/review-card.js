// Cloudflare Worker dla kart NFC: mmates.pl/r/:slug
//
// Ten plik NIE jest uruchamiany przez serwer coldcall - to kod do wklejenia w Cloudflare
// (Workers & Pages -> worker obslugujacy mmates.pl/r/* -> Edit code -> Deploy). Trzymamy go
// w repo, zeby zrodlo Workera nie zylo tylko w panelu Cloudflare.
//
// Dane karty czyta z Cloudflare KV (klucz = slug). Zapisuje je tam panel /reviews.html
// (server/routes/reviews.js -> syncToKV):
//   { business_name, tagline, google_url, emoji, logo_url,
//     show_logo, bg, bg_light, bg_image, bg_blur, bg_crop }
// bg_crop = kadr zdjecia: { m: {x,y,z}, d: {x,y,z} } - m dla ekranow pionowych (telefon),
// d dla poziomych (komputer). x/y = punkt zdjecia w %, z = zblizenie w % (100 = brak).
//
// Trasy (jak w poprzedniej wersji - kopia w review-card.old.js):
//   GET /r/:slug        -> strona karty (logo/emoji, nazwa, tagline, przycisk do opinii)
//   GET /r/:slug/click  -> przekierowanie na link do opinii Google (albo 404 "Brak linku.")
// Wszystko inne -> 404 "Not found".

const DEFAULT_BG = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

// Binding KV w Cloudflare nazywa sie CLIENTS_KV. Awaryjnie bierzemy pierwszy obiekt z env,
// ktory ma get/put (gdyby binding zostal kiedys przemianowany).
function findKV(env) {
  if (env && env.CLIENTS_KV) return env.CLIENTS_KV;
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
const safeUrl = (s) => (/^https?:\/\/[^\s"'()<>]+$/i.test(String(s || "")) ? String(s) : "");

// ten sam kadr co podglad w panelu (public/js/reviews.js -> cropLayerStyle): cover +
// background-position x% y% + scale(z) wokol tego samego punktu
function cropCss(c) {
  const n = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : def);
  const x = n(c?.x, 0, 100, 50);
  const y = n(c?.y, 0, 100, 50);
  const z = n(c?.z, 100, 300, 100) / 100;
  return `background-position: ${x}% ${y}%; transform: scale(${z}); transform-origin: ${x}% ${y}%;`;
}

function renderCard(slug, d) {
  const name = d.business_name || "";
  const bg = safeCss(d.bg) || DEFAULT_BG;
  const bgImage = safeUrl(d.bg_image);
  const blur = Math.max(0, Math.min(20, Number(d.bg_blur) || 0));
  // przycisk w kolorze tla karty; na jasnym tle (bialy, bez) ciemny, zeby byl widoczny na bialej karcie
  const btnBg = d.bg_light ? "#1a1a2e" : safeCss(d.bg) || "linear-gradient(135deg, #667eea, #764ba2)";
  const btnShadow = d.bg ? "0 6px 20px rgba(0,0,0,0.25)" : "0 6px 20px rgba(102,126,234,0.5)";

  let logo = "";
  if (d.show_logo !== false) {
    if (safeUrl(d.logo_url)) {
      logo = `<img src="${esc(d.logo_url)}" alt="${esc(name)}" style="max-width:120px;max-height:80px;object-fit:contain;margin-bottom:16px;">`;
    } else {
      logo = `<div class="emoji">${esc(d.emoji || "⭐")}</div>`;
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
    background-image: url("${bgImage}");
    background-size: cover;
    background-repeat: no-repeat;
    ${cropCss(d.bg_crop?.d)}
    filter: blur(${blur}px);
    z-index: -1;
  }
  @media (max-aspect-ratio: 1/1) {
    body::before { ${cropCss(d.bg_crop?.m)} }
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
  <p class="tagline">${esc(d.tagline || "Dziękujemy za wizytę!")}</p>
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
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "r" || !parts[1]) return text("Not found", 404);

    const kv = findKV(env);
    if (!kv) return text("Brak konfiguracji KV.", 500);

    const slug = parts[1];
    const isClick = parts[2] === "click";
    const raw = await kv.get(slug);
    if (!raw) return text(isClick ? "Nie znaleziono." : "Nie znaleziono strony.", 404);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return text("Nie znaleziono strony.", 404);
    }

    if (isClick) {
      const target = String(data.google_url || "").trim();
      if (!/^https?:\/\//i.test(target)) return text("Brak linku.", 404);
      return Response.redirect(target, 302);
    }

    return new Response(renderCard(slug, data), {
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" },
    });
  },
};
