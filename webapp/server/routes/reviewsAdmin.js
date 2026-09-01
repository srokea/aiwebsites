// Panel zarzadzania kartami NFC (CRUD). Montowany w server/index.js ZA globalnym
// `app.use("/api", requireAuth)`, wiec kazdy endpoint tu jest chroniony sesja - to jest
// wewnetrzny panel MMates, nie strona klienta. Publiczna strona-ladowania i tracking
// zyja osobno w server/routes/reviews.js.
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../db");

const router = express.Router();

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MAX = 20;

// Pola edytowalne przez PATCH (slug jest niezmienny - zmiana zepsulaby juz wydrukowane karty).
const EDITABLE = ["business_name", "tagline", "google_review_url", "logo_emoji", "active"];

// Wgrane logo klienta - tak jak avatary (patrz server/routes/users.js) trzymamy poza public/,
// bo to dane, nie kod. Serwowane przez app.use("/review-logos", ...) w server/index.js.
const LOGOS_DIR = path.join(__dirname, "..", "..", "data", "review-logos");
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

// SVG celowo NIE jest dozwolone: plik laduje z naszej domeny, a SVG potrafi niesc <script>.
const LOGO_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype in LOGO_MIME_EXT),
});

// kasuje stary plik logo (jesli byl), zeby podmiana / usuniecie nie zostawialy sierot
function deleteOldLogo(link) {
  if (!link.logo_path) return;
  fs.unlink(path.join(LOGOS_DIR, path.basename(link.logo_path)), () => {}); // best-effort
}

function readReviewUrl(value) {
  const url = String(value || "").trim();
  if (!url) return { error: "Podaj link do opinii Google" };
  if (!url.startsWith("https://")) return { error: "Link musi zaczynać się od https://" };
  return { url };
}

// logo_emoji ma byc JEDNA emotka - bierzemy pierwszy grafem (emotka razem z modyfikatorami
// koloru skory / sekwencja ZWJ), zeby na strone-ladowania nie trafil np. wklejony "⭐ tekst".
// Pusto -> '' (serwer i tak podstawi domyslne '⭐' przy zapisie).
const graphemes = new Intl.Segmenter("pl", { granularity: "grapheme" });
function firstEmoji(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  for (const { segment } of graphemes.segment(s)) return segment;
  return "";
}

// GET /api/reviews - wszystkie linki, najnowsze pierwsze
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM review_links ORDER BY created_at DESC").all());
});

// POST /api/reviews - nowy link
router.post("/", (req, res) => {
  const slug = String(req.body.slug || "").trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: "Podaj slug" });
  if (slug.length > SLUG_MAX) return res.status(400).json({ error: `Slug może mieć maksymalnie ${SLUG_MAX} znaków` });
  if (!SLUG_RE.test(slug)) return res.status(400).json({ error: "Slug: tylko małe litery, cyfry i myślnik" });

  const { url, error } = readReviewUrl(req.body.google_review_url);
  if (error) return res.status(400).json({ error });

  if (db.prepare("SELECT id FROM review_links WHERE slug = ?").get(slug)) {
    return res.status(409).json({ error: "Taki slug już istnieje" });
  }

  const info = db
    .prepare(
      `INSERT INTO review_links (slug, business_name, tagline, google_review_url, logo_emoji)
       VALUES (@slug, @business_name, @tagline, @google_review_url, @logo_emoji)`
    )
    .run({
      slug,
      business_name: String(req.body.business_name || "").trim(),
      tagline: String(req.body.tagline || "").trim() || "Dziękujemy za wizytę!",
      google_review_url: url,
      logo_emoji: firstEmoji(req.body.logo_emoji) || "⭐",
    });

  res.status(201).json(db.prepare("SELECT * FROM review_links WHERE id = ?").get(info.lastInsertRowid));
});

// PATCH /api/reviews/:id - edycja (bez slug-a i bez licznikow)
router.patch("/:id", (req, res) => {
  const link = db.prepare("SELECT * FROM review_links WHERE id = ?").get(req.params.id);
  if (!link) return res.status(404).json({ error: "Nie znaleziono linku" });

  const updates = {};
  for (const field of EDITABLE) {
    if (!(field in req.body)) continue;
    if (field === "google_review_url") {
      const { url, error } = readReviewUrl(req.body.google_review_url);
      if (error) return res.status(400).json({ error });
      updates.google_review_url = url;
    } else if (field === "active") {
      updates.active = req.body.active ? 1 : 0;
    } else if (field === "logo_emoji") {
      updates.logo_emoji = firstEmoji(req.body.logo_emoji) || "⭐";
    } else {
      updates[field] = String(req.body[field] || "").trim();
    }
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Brak pól do aktualizacji" });

  updates.updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
  const setClauses = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");
  db.prepare(`UPDATE review_links SET ${setClauses} WHERE id = @id`).run({ ...updates, id: link.id });

  res.json(db.prepare("SELECT * FROM review_links WHERE id = ?").get(link.id));
});

// POST /api/reviews/:id/logo - wgranie pliku logo (JPG/PNG/WEBP, max 2 MB). Gdy ustawione,
// strona-ladowania pokazuje ten obrazek zamiast logo_emoji.
router.post(
  "/:id/logo",
  (req, res, next) => {
    uploadLogo.single("logo")(req, res, (err) => {
      if (!err) return next();
      const message = err.code === "LIMIT_FILE_SIZE" ? "Plik za duży (max 2 MB)" : "Nie udało się wgrać pliku";
      res.status(400).json({ error: message });
    });
  },
  (req, res) => {
    const link = db.prepare("SELECT * FROM review_links WHERE id = ?").get(req.params.id);
    if (!link) return res.status(404).json({ error: "Nie znaleziono linku" });
    if (!req.file) return res.status(400).json({ error: "Dozwolone pliki: JPG, PNG, WEBP (max 2 MB)" });

    deleteOldLogo(link);
    const filename = `${link.id}-${Date.now()}.${LOGO_MIME_EXT[req.file.mimetype]}`;
    fs.writeFileSync(path.join(LOGOS_DIR, filename), req.file.buffer);
    db.prepare("UPDATE review_links SET logo_path = ?, updated_at = datetime('now') WHERE id = ?").run(
      `/review-logos/${filename}`,
      link.id
    );

    res.json(db.prepare("SELECT * FROM review_links WHERE id = ?").get(link.id));
  }
);

// DELETE /api/reviews/:id/logo - powrot do emoji (kasuje plik i czysci logo_path)
router.delete("/:id/logo", (req, res) => {
  const link = db.prepare("SELECT * FROM review_links WHERE id = ?").get(req.params.id);
  if (!link) return res.status(404).json({ error: "Nie znaleziono linku" });

  deleteOldLogo(link);
  db.prepare("UPDATE review_links SET logo_path = '', updated_at = datetime('now') WHERE id = ?").run(link.id);
  res.json(db.prepare("SELECT * FROM review_links WHERE id = ?").get(link.id));
});

// DELETE /api/reviews/:id
router.delete("/:id", (req, res) => {
  const link = db.prepare("SELECT * FROM review_links WHERE id = ?").get(req.params.id);
  if (!link) return res.status(404).json({ error: "Nie znaleziono linku" });

  deleteOldLogo(link);
  db.prepare("DELETE FROM review_links WHERE id = ?").run(link.id);
  res.json({ ok: true });
});

module.exports = router;
