const express = require("express");
const multer = require("multer");
const Papa = require("papaparse");
const db = require("../db");
const { mapRowsToLeads } = require("../csvImport");
const { computeCalledAt } = require("../leadStatus");
const { stripDiacritics } = require("../text");
const { NICHE_COLORS } = require("../constants");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function slugify(name) {
  return stripDiacritics(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function nicheStats(nicheId) {
  return db
    .prepare(
      `SELECT COUNT(*) total, COALESCE(SUM(called_at IS NOT NULL), 0) called
       FROM leads WHERE niche_id = ?`
    )
    .get(nicheId);
}

// GET /api/niches - lista nisz + statystyki do kafelkow
router.get("/", (req, res) => {
  const niches = db.prepare("SELECT * FROM niches ORDER BY created_at ASC").all();

  // jedno zapytanie zbiorcze zamiast dwoch na kazda nisze
  const statsRows = db
    .prepare(
      `SELECT niche_id, COUNT(*) total, COALESCE(SUM(called_at IS NOT NULL), 0) called
       FROM leads GROUP BY niche_id`
    )
    .all();
  const statsByNiche = new Map(statsRows.map((r) => [r.niche_id, r]));

  res.json(
    niches.map((n) => {
      const s = statsByNiche.get(n.id);
      return { ...n, total: s?.total || 0, called: s?.called || 0 };
    })
  );
});

// GET /api/niches/:slug - szczegoly niszy + statystyki per osoba + dzienny licznik
router.get("/:slug", (req, res) => {
  const niche = db.prepare("SELECT * FROM niches WHERE slug = ?").get(req.params.slug);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });

  const { total, called } = nicheStats(niche.id);
  const byCaller = db
    .prepare(
      "SELECT caller, COUNT(*) c FROM leads WHERE niche_id = ? AND called_at IS NOT NULL AND caller <> '' GROUP BY caller"
    )
    .all(niche.id);
  // called_at trzymamy w UTC (ISO), wiec obie strony porownania musza byc w czasie lokalnym,
  // inaczej licznik "dzisiaj" resetuje sie o 01:00/02:00 zamiast o polnocy.
  const calledToday = db
    .prepare(
      `SELECT COUNT(*) c FROM leads
       WHERE niche_id = ? AND called_at IS NOT NULL
         AND date(called_at, 'localtime') = date('now', 'localtime')`
    )
    .get(niche.id).c;

  res.json({ ...niche, total, called, todo: total - called, byCaller, calledToday });
});

// GET /api/niches/:slug/leads - leady danej niszy
router.get("/:slug/leads", (req, res) => {
  const niche = db.prepare("SELECT id FROM niches WHERE slug = ?").get(req.params.slug);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });
  res.json(db.prepare("SELECT * FROM leads WHERE niche_id = ? ORDER BY id ASC").all(niche.id));
});

// POST /api/niches/import - tworzy nowa nisze z pliku CSV
router.post("/import", upload.single("file"), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Podaj nazwe niszy" });
  if (!req.file) return res.status(400).json({ error: "Brak pliku CSV" });

  const parsed = Papa.parse(req.file.buffer.toString("utf8"), { header: true, skipEmptyLines: true });
  if (parsed.errors.length && !parsed.data.length) {
    return res.status(400).json({ error: "Nie udalo sie odczytac pliku CSV" });
  }

  const leads = mapRowsToLeads(parsed.data);
  if (!leads.length) return res.status(400).json({ error: "Plik CSV nie zawiera zadnych wierszy z danymi" });

  const baseSlug = slugify(name) || "nisza";
  let slug = baseSlug;
  let i = 2;
  while (db.prepare("SELECT id FROM niches WHERE slug = ?").get(slug)) {
    slug = `${baseSlug}-${i++}`;
  }

  const insertNiche = db.prepare("INSERT INTO niches (name, slug) VALUES (?, ?)");
  const insertLead = db.prepare(`
    INSERT INTO leads (
      niche_id, company_name, city, phone, quality, has_social, website_url,
      tag_instagram, tag_facebook, tag_booksy, tag_youtube,
      answered, interested, caller, reminder, callback_when, google_term, notes, research_notes, called_at
    ) VALUES (
      @niche_id, @company_name, @city, @phone, @quality, @has_social, @website_url,
      @tag_instagram, @tag_facebook, @tag_booksy, @tag_youtube,
      @answered, @interested, @caller, @reminder, @callback_when, @google_term, @notes, @research_notes, @called_at
    )
  `);

  const nicheId = db.transaction(() => {
    const id = insertNiche.run(name.trim(), slug).lastInsertRowid;
    for (const lead of leads) {
      // ta sama regula "zadzwoniony" co przy recznej edycji leada
      insertLead.run({ ...lead, niche_id: id, called_at: computeCalledAt(lead) });
    }
    return id;
  })();

  const niche = db.prepare("SELECT * FROM niches WHERE id = ?").get(nicheId);
  res.status(201).json({ ...niche, ...nicheStats(nicheId), imported: leads.length });
});

// PATCH /api/niches/:id - zmiana nazwy i/lub koloru niszy (ustawienia)
router.patch("/:id", (req, res) => {
  const niche = db.prepare("SELECT * FROM niches WHERE id = ?").get(req.params.id);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });

  const updates = {};
  if ("name" in req.body) {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nazwa nie moze byc pusta" });
    updates.name = name;
  }
  if ("color" in req.body) {
    const color = String(req.body.color || "");
    if (color && !NICHE_COLORS.includes(color)) return res.status(400).json({ error: `Nieprawidlowy kolor: ${color}` });
    updates.color = color;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Brak pol do aktualizacji" });

  const setClauses = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");
  db.prepare(`UPDATE niches SET ${setClauses} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const updated = db.prepare("SELECT * FROM niches WHERE id = ?").get(req.params.id);
  res.json({ ...updated, ...nicheStats(updated.id) });
});

// DELETE /api/niches/:id - usuniecie niszy wraz z leadami (ON DELETE CASCADE)
router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM niches WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Nie znaleziono niszy" });
  res.json({ ok: true });
});

module.exports = router;
