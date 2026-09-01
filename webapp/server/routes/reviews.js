const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../db");
const { CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN } = require("../cloudflare");

const router = express.Router();

const SLUG_FORMAT = /^[a-z0-9-]+$/;

// adres, pod ktorym ten serwer jest publicznie dostepny (patrz .env) - potrzebny, zeby
// logo_url bylo pelnym URL-em: Worker obslugujacy mmates.pl/r/:slug pobiera obrazek z
// internetu, nie z dysku tego serwera, wiec sciezka wzgledna (jak np. /avatars/...) tu nie starczy
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

const LOGOS_DIR = path.join(__dirname, "..", "..", "data", "review-logos");
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

// SVG celowo NIE jest dozwolone: plik laduje z naszej domeny, a SVG potrafi niesc <script>.
const LOGO_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype in LOGO_MIME_EXT),
});

// usuwa stary plik logo (jesli byl lokalnie wgrany), zeby podmiana/usuniecie nie
// zostawialy sierot na dysku - dziala tylko dla URLi wskazujacych na nasz /review-logos/
function deleteOldLogoFile(row) {
  if (!row.logo_url || !row.logo_url.includes("/review-logos/")) return;
  fs.unlink(path.join(LOGOS_DIR, path.basename(row.logo_url)), () => {}); // best-effort
}

function kvUrl(slug) {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(slug)}`;
}

// Po kazdym zapisie/usunieciu karty synchronizujemy jej stan do Cloudflare KV - stamtad
// czyta go Worker obslugujacy mmates.pl/r/:slug, nie z tej bazy bezposrednio.
async function syncToKV(slug, row) {
  const body = JSON.stringify({
    business_name: row.business_name,
    tagline: row.tagline,
    google_url: row.google_review_url,
    emoji: row.logo_emoji,
    logo_url: row.logo_url,
  });
  const res = await fetch(kvUrl(slug), {
    method: "PUT",
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Cloudflare KV PUT ${res.status}`);
}

async function deleteFromKV(slug) {
  const res = await fetch(kvUrl(slug), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Cloudflare KV DELETE ${res.status}`);
}

function getBySlug(slug) {
  return db.prepare("SELECT * FROM review_links WHERE slug = ?").get(slug);
}

// GET /api/reviews - kolejnosc reczna (patrz PATCH /reorder), nie chronologiczna
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM review_links ORDER BY sort_order ASC, created_at DESC").all());
});

// PATCH /api/reviews/reorder - przeciagnij i upusc w panelu. Body: { slugs: [...] } w nowej
// kolejnosci od gory. Nie dotyka Cloudflare KV - to czysto kolejnosc widoku admina.
router.patch("/reorder", (req, res) => {
  const slugs = Array.isArray(req.body.slugs) ? req.body.slugs : [];
  if (!slugs.length) return res.status(400).json({ error: "Brak listy slugow" });

  const setOrder = db.prepare("UPDATE review_links SET sort_order = ? WHERE slug = ?");
  db.transaction(() => slugs.forEach((slug, i) => setOrder.run(i, slug)))();

  res.json(db.prepare("SELECT * FROM review_links ORDER BY sort_order ASC, created_at DESC").all());
});

// POST /api/reviews
router.post("/", async (req, res) => {
  const slug = String(req.body.slug || "").trim().toLowerCase();
  if (!SLUG_FORMAT.test(slug)) {
    return res.status(400).json({ error: "Slug moze zawierac tylko male litery, cyfry i myslniki" });
  }
  if (getBySlug(slug)) {
    return res.status(409).json({ error: `Slug "${slug}" juz istnieje` });
  }

  const business_name = String(req.body.business_name || "").trim();
  if (!business_name) return res.status(400).json({ error: "Nazwa firmy jest wymagana" });

  const google_review_url = String(req.body.google_url ?? req.body.google_review_url ?? "").trim();

  // nowa karta ląduje na górze listy (jak dawniej przy sortowaniu po dacie)
  const minOrder = db.prepare("SELECT MIN(sort_order) m FROM review_links").get().m ?? 0;

  db.prepare(
    `INSERT INTO review_links (slug, business_name, tagline, google_review_url, logo_emoji, logo_url, sort_order)
     VALUES (@slug, @business_name, @tagline, @google_review_url, @logo_emoji, @logo_url, @sort_order)`
  ).run({
    slug,
    sort_order: minOrder - 1,
    business_name,
    tagline: String(req.body.tagline || "").trim(),
    google_review_url,
    logo_emoji: String(req.body.emoji ?? req.body.logo_emoji ?? "").trim(),
    logo_url: String(req.body.logo_url || "").trim(),
  });

  const saved = getBySlug(slug);
  let kv_synced = true;
  try {
    await syncToKV(slug, saved);
  } catch (err) {
    kv_synced = false;
    console.error("Cloudflare KV sync (POST /api/reviews):", err.message);
  }
  res.status(201).json({ ...saved, kv_synced });
});

// PATCH /api/reviews/:slug
router.patch("/:slug", async (req, res) => {
  const existing = getBySlug(req.params.slug);
  if (!existing) return res.status(404).json({ error: "Nie znaleziono karty" });

  const fields = {
    business_name: req.body.business_name !== undefined ? String(req.body.business_name).trim() : existing.business_name,
    tagline: req.body.tagline !== undefined ? String(req.body.tagline).trim() : existing.tagline,
    google_review_url:
      req.body.google_url !== undefined
        ? String(req.body.google_url).trim()
        : req.body.google_review_url !== undefined
        ? String(req.body.google_review_url).trim()
        : existing.google_review_url,
    logo_emoji:
      req.body.emoji !== undefined
        ? String(req.body.emoji).trim()
        : req.body.logo_emoji !== undefined
        ? String(req.body.logo_emoji).trim()
        : existing.logo_emoji,
    logo_url: req.body.logo_url !== undefined ? String(req.body.logo_url).trim() : existing.logo_url,
    active: req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active,
  };
  if (!fields.business_name) return res.status(400).json({ error: "Nazwa firmy jest wymagana" });

  db.prepare(
    `UPDATE review_links SET business_name=@business_name, tagline=@tagline, google_review_url=@google_review_url,
     logo_emoji=@logo_emoji, logo_url=@logo_url, active=@active, updated_at=datetime('now') WHERE slug=@slug`
  ).run({ ...fields, slug: existing.slug });

  const saved = getBySlug(existing.slug);
  let kv_synced = true;
  try {
    await syncToKV(existing.slug, saved);
  } catch (err) {
    kv_synced = false;
    console.error("Cloudflare KV sync (PATCH /api/reviews):", err.message);
  }
  res.json({ ...saved, kv_synced });
});

// POST /api/reviews/:slug/logo - wgranie pliku logo (JPG/PNG/WEBP, max 2 MB). Ustawia
// logo_url na pelny publiczny URL i od razu synchronizuje karte do Cloudflare KV.
router.post(
  "/:slug/logo",
  (req, res, next) => {
    uploadLogo.single("logo")(req, res, (err) => {
      if (!err) return next();
      const message = err.code === "LIMIT_FILE_SIZE" ? "Plik za duży (max 2 MB)" : "Nie udało się wgrać pliku";
      res.status(400).json({ error: message });
    });
  },
  async (req, res) => {
    const existing = getBySlug(req.params.slug);
    if (!existing) return res.status(404).json({ error: "Nie znaleziono karty" });
    if (!req.file) return res.status(400).json({ error: "Dozwolone pliki: JPG, PNG, WEBP (max 2 MB)" });
    if (!PUBLIC_BASE_URL) return res.status(500).json({ error: "Brak PUBLIC_BASE_URL w konfiguracji serwera" });

    deleteOldLogoFile(existing);
    const filename = `${existing.slug}-${Date.now()}.${LOGO_MIME_EXT[req.file.mimetype]}`;
    fs.writeFileSync(path.join(LOGOS_DIR, filename), req.file.buffer);
    const logo_url = `${PUBLIC_BASE_URL}/review-logos/${filename}`;
    db.prepare("UPDATE review_links SET logo_url = ?, updated_at = datetime('now') WHERE slug = ?").run(
      logo_url,
      existing.slug
    );

    const saved = getBySlug(existing.slug);
    let kv_synced = true;
    try {
      await syncToKV(existing.slug, saved);
    } catch (err) {
      kv_synced = false;
      console.error("Cloudflare KV sync (POST /api/reviews/:slug/logo):", err.message);
    }
    res.json({ ...saved, kv_synced });
  }
);

// DELETE /api/reviews/:slug/logo - powrot do emoji (kasuje plik i czysci logo_url)
router.delete("/:slug/logo", async (req, res) => {
  const existing = getBySlug(req.params.slug);
  if (!existing) return res.status(404).json({ error: "Nie znaleziono karty" });

  deleteOldLogoFile(existing);
  db.prepare("UPDATE review_links SET logo_url = '', updated_at = datetime('now') WHERE slug = ?").run(existing.slug);

  const saved = getBySlug(existing.slug);
  let kv_synced = true;
  try {
    await syncToKV(existing.slug, saved);
  } catch (err) {
    kv_synced = false;
    console.error("Cloudflare KV sync (DELETE /api/reviews/:slug/logo):", err.message);
  }
  res.json({ ...saved, kv_synced });
});

// DELETE /api/reviews/:slug
router.delete("/:slug", async (req, res) => {
  const existing = getBySlug(req.params.slug);
  if (!existing) return res.status(404).json({ error: "Nie znaleziono karty" });

  deleteOldLogoFile(existing);
  db.prepare("DELETE FROM review_links WHERE slug = ?").run(existing.slug);

  let kv_synced = true;
  try {
    await deleteFromKV(existing.slug);
  } catch (err) {
    kv_synced = false;
    console.error("Cloudflare KV sync (DELETE /api/reviews):", err.message);
  }
  res.json({ ok: true, kv_synced });
});

module.exports = router;
