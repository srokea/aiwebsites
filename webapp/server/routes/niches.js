const express = require("express");
const multer = require("multer");
const Papa = require("papaparse");
const db = require("../db");
const { mapRowsToLeads } = require("../csvImport");
const { computeCalledAt, STATS_ELIGIBLE_SQL } = require("../leadStatus");
const { listScriptFiles } = require("./scripts");
const { stripDiacritics } = require("../text");
const { NICHE_COLORS, INTERESTED_OPTIONS, PLATFORM_TAGS, PLATFORM_META } = require("../constants");
const { getCallerNames } = require("../callers");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function slugify(name) {
  return stripDiacritics(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// "called"/"eligible" pomijaja leady ze Strona = "Tak" (patrz STATS_ELIGIBLE_SQL) -
// "total" to pelna liczba leadow w niszy.
function nicheStats(nicheId) {
  return db
    .prepare(
      `SELECT COUNT(*) total,
              COALESCE(SUM(${STATS_ELIGIBLE_SQL}), 0) eligible,
              COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}), 0) called
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
      `SELECT niche_id, COUNT(*) total,
              COALESCE(SUM(${STATS_ELIGIBLE_SQL}), 0) eligible,
              COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}), 0) called
       FROM leads GROUP BY niche_id`
    )
    .all();
  const statsByNiche = new Map(statsRows.map((r) => [r.niche_id, r]));

  res.json(
    niches.map((n) => {
      const s = statsByNiche.get(n.id);
      return { ...n, total: s?.total || 0, eligible: s?.eligible || 0, called: s?.called || 0 };
    })
  );
});

// GET /api/niches/:slug - szczegoly niszy + statystyki per osoba + dzienny licznik
router.get("/:slug", (req, res) => {
  const niche = db.prepare("SELECT * FROM niches WHERE slug = ?").get(req.params.slug);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });

  const { total, eligible, called } = nicheStats(niche.id);
  const byCaller = db
    .prepare(
      `SELECT caller, COUNT(*) c FROM leads
       WHERE niche_id = ? AND called_at IS NOT NULL AND caller <> '' AND ${STATS_ELIGIBLE_SQL}
       GROUP BY caller`
    )
    .all(niche.id);
  // called_at trzymamy w UTC (ISO), wiec obie strony porownania musza byc w czasie lokalnym,
  // inaczej licznik "dzisiaj" resetuje sie o 01:00/02:00 zamiast o polnocy.
  const calledToday = db
    .prepare(
      `SELECT COUNT(*) c FROM leads
       WHERE niche_id = ? AND called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}
         AND date(called_at, 'localtime') = date('now', 'localtime')`
    )
    .get(niche.id).c;

  res.json({ ...niche, total, eligible, called, todo: eligible - called, byCaller, calledToday });
});

// GET /api/niches/:slug/leads - leady danej niszy, kazdy z lista notatek (najnowsza pierwsza)
router.get("/:slug/leads", (req, res) => {
  const niche = db.prepare("SELECT id FROM niches WHERE slug = ?").get(req.params.slug);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });

  const leads = db.prepare("SELECT * FROM leads WHERE niche_id = ? ORDER BY id ASC").all(niche.id);
  const noteRows = db
    .prepare(
      `SELECT lead_notes.id, lead_notes.lead_id, lead_notes.content, lead_notes.created_at
       FROM lead_notes JOIN leads ON leads.id = lead_notes.lead_id
       WHERE leads.niche_id = ? ORDER BY lead_notes.created_at DESC, lead_notes.id DESC`
    )
    .all(niche.id);
  const notesByLead = new Map();
  for (const { lead_id, ...note } of noteRows) {
    if (!notesByLead.has(lead_id)) notesByLead.set(lead_id, []);
    notesByLead.get(lead_id).push(note);
  }

  res.json(leads.map((l) => ({ ...l, notes_list: notesByLead.get(l.id) || [] })));
});

// POST /api/niches/:slug/leads - recznie dodany lead (#15). Wymagana jest tylko nazwa firmy;
// reszta pol startuje z tymi samymi wartosciami domyslnymi co przy imporcie CSV (m.in.
// interested = "nieruszone"), zeby recznie dodany lead nie rozni sie niczym od wgranego z pliku.
router.post("/:slug/leads", (req, res) => {
  const niche = db.prepare("SELECT id FROM niches WHERE slug = ?").get(req.params.slug);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });

  const companyName = String(req.body.company_name || "").trim();
  if (!companyName) return res.status(400).json({ error: "Podaj nazwe firmy" });

  // "interested" ustawiamy JAWNIE: w bazach zalozonych przed zmiana defaultu kolumna nadal ma
  // DEFAULT 'nie' (patrz migracja w db.js), wiec swiezy lead wygladalby jak juz odrzucony.
  const info = db
    .prepare("INSERT INTO leads (niche_id, company_name, city, phone, interested) VALUES (?, ?, ?, ?, 'nieruszone')")
    .run(niche.id, companyName, String(req.body.city || "").trim(), String(req.body.phone || "").trim());

  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...lead, notes_list: [] });
});

// GET /api/niches/:slug/export.csv - zrzut AKTUALNEGO stanu tabeli (po wszystkich edycjach),
// nie oryginalnego importu. Naglowki celowo pokrywaja sie z aliasami z csvImport.js, zeby taki
// plik dal sie z powrotem zaimportowac bez recznego mapowania kolumn.
router.get("/:slug/export.csv", (req, res) => {
  const niche = db.prepare("SELECT * FROM niches WHERE slug = ?").get(req.params.slug);
  if (!niche) return res.status(404).json({ error: "Nie znaleziono niszy" });

  const leads = db.prepare("SELECT * FROM leads WHERE niche_id = ? ORDER BY id ASC").all(niche.id);
  const noteRows = db
    .prepare(
      `SELECT lead_notes.* FROM lead_notes
       JOIN leads ON leads.id = lead_notes.lead_id
       WHERE leads.niche_id = ? ORDER BY lead_notes.created_at ASC, lead_notes.id ASC`
    )
    .all(niche.id);
  const notesByLead = new Map();
  for (const n of noteRows) {
    if (!notesByLead.has(n.lead_id)) notesByLead.set(n.lead_id, []);
    notesByLead.get(n.lead_id).push(`[${n.created_at.slice(0, 10)}] ${n.content}`);
  }

  const interestedLabel = (value) => INTERESTED_OPTIONS.find((o) => o.value === value)?.label || value;

  const rows = leads.map((l) => {
    const row = {
      "Firma": l.company_name,
      "Czy mają własną stronę?": l.has_social,
      "Miasto": l.city,
      "Telefon": l.phone,
      "Jakość": l.quality,
    };
    for (const tag of PLATFORM_TAGS) row[PLATFORM_META[tag].name] = l[`tag_${tag}`] ? "Tak" : "";
    row["Godzina otwarcia"] = l.open_time;
    row["Godzina zamknięcia"] = l.close_time;
    row["Odebrał?"] = l.answered;
    row["Zainteresowany?"] = interestedLabel(l.interested);
    row["Kto dzwonił"] = l.caller;
    row["Kiedy oddzwonić"] = l.callback_when;
    row["Termin Google Meet"] = l.google_term;
    row["Notatki"] = (notesByLead.get(l.id) || []).join(" | ");
    row["Notatki scrapera"] = l.research_notes;
    row["Strona WWW"] = l.website_url;
    return row;
  });

  const csv = Papa.unparse(rows);
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${niche.slug}-${today}.csv"`);
  // BOM na poczatku - bez tego Excel otwiera polskie znaki jako krzaki
  res.send("\uFEFF" + csv);
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

  const leads = mapRowsToLeads(parsed.data, getCallerNames());
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
      answered, interested, caller, reminder, callback_when, google_term, notes, research_notes, called_at,
      open_time, close_time
    ) VALUES (
      @niche_id, @company_name, @city, @phone, @quality, @has_social, @website_url,
      @tag_instagram, @tag_facebook, @tag_booksy, @tag_youtube,
      @answered, @interested, @caller, @reminder, @callback_when, @google_term, @notes, @research_notes, @called_at,
      @open_time, @close_time
    )
  `);

  const insertNote = db.prepare("INSERT INTO lead_notes (lead_id, content) VALUES (?, ?)");

  const nicheId = db.transaction(() => {
    const id = insertNiche.run(name.trim(), slug).lastInsertRowid;
    for (const lead of leads) {
      // ta sama regula "zadzwoniony" co przy recznej edycji leada
      const leadId = insertLead.run({ ...lead, niche_id: id, called_at: computeCalledAt(lead) }).lastInsertRowid;
      // anomalie importu (nierozpoznane wartosci itp.) laduja jako pierwsza notatka leada,
      // bo kolumna leads.notes jest martwa po przejsciu na lead_notes
      if (lead.notes) insertNote.run(leadId, lead.notes);
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
  if ("script_file" in req.body) {
    const scriptFile = String(req.body.script_file || "");
    if (!listScriptFiles().includes(scriptFile)) {
      return res.status(400).json({ error: `Nie ma takiego pliku schematu: ${scriptFile}` });
    }
    updates.script_file = scriptFile;
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
