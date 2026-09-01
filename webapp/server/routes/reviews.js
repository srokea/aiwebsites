// PUBLICZNY route kart NFC do zbierania opinii Google. Montowany w server/index.js PRZED
// globalnym `app.use("/api", requireAuth)` - klienci koncowi NIE sa zalogowani, wiec te trzy
// endpointy musza dzialac bez sesji:
//   GET /r/:slug            -> brandowana strona-ladowania (liczy skan)
//   GET /r/:slug/click      -> redirect na Google Reviews (liczy klikniecie)
//   GET /r/:slug/stats.json -> liczniki do "X osob tu trafilo" na stronie
// Panel zarzadzania (CRUD) jest osobno w server/routes/reviewsAdmin.js, za auth-gate.
const express = require("express");
const db = require("../db");

const router = express.Router();

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const getActiveLink = db.prepare("SELECT * FROM review_links WHERE slug = ? AND active = 1");

// Cala strona w jednym pliku - zero zewnetrznych zaleznosci (fontow, CSS, JS z CDN), zeby
// dzialala nawet przy slabym zasiegu w salonie. Motyw JASNY: to strona dla klienta, nie panel.
function renderLanding(link) {
  const slug = escapeHtml(link.slug);
  const bizName = escapeHtml(link.business_name || "Zostaw opinię");
  const tagline = escapeHtml(link.tagline || "Dziękujemy za wizytę!");
  const emoji = escapeHtml(link.logo_emoji || "⭐");
  // wgrane logo (jesli jest) wygrywa z emotka
  const logoHtml = link.logo_path
    ? `<img class="logo-img" src="${escapeHtml(link.logo_path)}" alt="${bizName}">`
    : `<span class="emoji">${emoji}</span>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="theme-color" content="#f8f9fa">
<meta name="robots" content="noindex">
<title>${bizName} — zostaw opinię</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.card { background: white; border-radius: 24px; padding: 40px 32px; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 4px 32px rgba(0,0,0,0.10); }
.emoji { font-size: 64px; margin-bottom: 16px; display: block; }
.logo-img { display: block; max-width: 200px; max-height: 110px; width: auto; height: auto; margin: 0 auto 20px; object-fit: contain; }
.biz-name { font-size: 24px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
.tagline { font-size: 16px; color: #6b7280; margin-bottom: 32px; }
.stars { font-size: 32px; margin-bottom: 32px; letter-spacing: 4px; }
.stars span { display: inline-block; opacity: 0; transform: scale(0.6); animation: starPop 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.stars span:nth-child(1) { animation-delay: 0.05s; }
.stars span:nth-child(2) { animation-delay: 0.13s; }
.stars span:nth-child(3) { animation-delay: 0.21s; }
.stars span:nth-child(4) { animation-delay: 0.29s; }
.stars span:nth-child(5) { animation-delay: 0.37s; }
@keyframes starPop { to { opacity: 1; transform: scale(1); } }
.cta-btn { display: block; background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; text-decoration: none; padding: 0 24px; height: 56px; line-height: 56px; border-radius: 28px; font-size: 17px; font-weight: 700; margin-bottom: 24px; transition: transform 0.1s, box-shadow 0.1s; box-shadow: 0 4px 16px rgba(239,68,68,0.35); }
.cta-btn:active { transform: scale(0.97); }
.scan-count { font-size: 13px; color: #9ca3af; margin-bottom: 20px; min-height: 16px; }
.powered { font-size: 12px; color: #9ca3af; }
@media (prefers-reduced-motion: reduce) { .stars span { animation: none; opacity: 1; transform: none; } }
</style>
</head>
<body>
<div class="card">
  ${logoHtml}
  <div class="biz-name">${bizName}</div>
  <div class="tagline">${tagline}</div>
  <div class="stars" aria-hidden="true"><span>⭐</span><span>⭐</span><span>⭐</span><span>⭐</span><span>⭐</span></div>
  <a class="cta-btn" href="/r/${slug}/click">Zostaw opinię na Google</a>
  <div class="scan-count" id="scan-count"></div>
  <div class="powered">Powered by MMates</div>
</div>
<script>
  fetch("/r/${slug}/stats.json")
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (s && typeof s.scan_count === "number" && s.scan_count > 0) {
        document.getElementById("scan-count").textContent = "👁 " + s.scan_count + " osób tu trafiło";
      }
    })
    .catch(function () {});
</script>
</body>
</html>`;
}

// GET /r/:slug - brandowana strona-ladowania. Kazde wejscie liczy sie jako skan.
router.get("/:slug", (req, res) => {
  const link = getActiveLink.get(req.params.slug);
  if (!link) return res.status(404).send("Nie znaleziono");

  db.prepare("UPDATE review_links SET scan_count = scan_count + 1 WHERE id = ?").run(link.id);

  res.set("Cache-Control", "no-store");
  res.send(renderLanding(link));
});

// GET /r/:slug/click - liczy klikniecie i przekierowuje na Google Reviews. Redirect robi
// serwer (a nie <a href> prosto na Google), zeby klikniecie w ogole dalo sie policzyc.
router.get("/:slug/click", (req, res) => {
  const link = getActiveLink.get(req.params.slug);
  if (!link) return res.redirect("/");

  db.prepare("UPDATE review_links SET click_count = click_count + 1 WHERE id = ?").run(link.id);
  res.redirect(link.google_review_url || "/");
});

// GET /r/:slug/stats.json - liczniki dla dyskretnego "X osob tu trafilo" na stronie.
// BEZ auth: strona-ladowania jest publiczna i sama to wola po zaladowaniu.
router.get("/:slug/stats.json", (req, res) => {
  const link = getActiveLink.get(req.params.slug);
  if (!link) return res.status(404).json({ error: "Nie znaleziono" });

  res.json({
    slug: link.slug,
    business_name: link.business_name,
    scan_count: link.scan_count,
    click_count: link.click_count,
  });
});

module.exports = router;
