const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, ANSWERED_OPTIONS, WEBSITE_STATUS_OPTIONS, QUALITY_OPTIONS, SITE_PROGRESS_OPTIONS } = require("../constants");
const { computeCalledAt, computeDopieteAt } = require("../leadStatus");
const { getCallerNames } = require("../callers");
const { localDateTime } = require("../time");

const router = express.Router();

// #4 - format "YYYY-MM-DDTHH:MM" albo sama data "YYYY-MM-DD" (godzina opcjonalna w UI historii)
const ATTEMPT_WHEN_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// Wpisy prob dzwonienia leada, najnowsza pierwsza - w tej kolejnosci pokazuje je popover
// w kolumnie "Proby". Liczba w kolumnie = dlugosc tej listy.
function attemptsForLead(leadId) {
  return db
    .prepare(
      "SELECT id, happened_at, created_by FROM lead_call_attempts WHERE lead_id = ? ORDER BY happened_at DESC, id DESC"
    )
    .all(leadId);
}

// "notes" celowo nieobecne - notatki zyja w osobnej tabeli lead_notes (POST/DELETE ponizej),
// stara kolumna leads.notes jest martwa po migracji w db.js.
const TEXT_FIELDS = [
  "company_name",
  "city",
  "phone",
  "website_url",
  "reminder",
  "callback_when",
  "google_term",
  "research_notes",
];
const BOOL_FIELDS = ["tag_instagram", "tag_facebook", "tag_booksy", "tag_youtube", "tag_tiktok", "social_verified"];

// Godziny otwarcia (#11) - albo "HH:MM" prosto z <input type="time">, albo pusty string
// ("nie wiemy"). Trzymane jako tekst, bo tak sortuja sie leksykalnie tak samo jak czasowo.
const TIME_FIELDS = ["open_time", "close_time"];
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

// Pola z zamknieta lista wartosci - pusty string zawsze dozwolony (= "nie ustawiono").
// "caller" nie jest tu na sztywno - liczba i nazwy kont sie zmieniaja (nowe konto, zmiana
// nazwy), wiec whitelist budujemy swiezo przy kazdym requescie (patrz getCallerNames ponizej).
const ENUM_FIELDS_STATIC = {
  interested: INTERESTED_OPTIONS.map((o) => o.value),
  answered: ANSWERED_OPTIONS.map((o) => o.value),
  has_social: WEBSITE_STATUS_OPTIONS.map((o) => o.value),
  quality: QUALITY_OPTIONS.map((o) => o.value),
};

// Notatki leada, najnowsza pierwsza - w tej kolejnosci pokazuje je frontend
// (podglad w komorce tabeli = pierwszy element tej listy). updated_at ustawione = notatka
// byla edytowana (patrz PATCH ponizej); historia starych tresci zyje w lead_note_edits
// i jest doladowywana osobno, dopiero gdy ktos ja rozwinie na froncie.
function notesForLead(leadId) {
  return db
    .prepare(
      "SELECT id, content, created_at, updated_at FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC, id DESC"
    )
    .all(leadId);
}

// GET /api/leads/search?q= - globalne wyszukiwanie leada (wszystkie nisze) po numerze
// telefonu, nazwie firmy albo miescie. Zasila sticky wyszukiwarke na dashboardzie; klik w
// wynik prowadzi prosto do scheme rozmowy (/script.html?leadId=). MUSI byc zdefiniowane przed
// "/:id" - inaczej Express potraktowalby "search" jako id leada.
router.get("/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);

  const like = `%${q.toLowerCase()}%`;
  const prefix = `${q.toLowerCase()}%`;
  const digits = q.replace(/\D/g, "");

  const rows = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.city, leads.phone,
              niches.name AS niche_name, niches.slug AS niche_slug
         FROM leads JOIN niches ON niches.id = leads.niche_id
        WHERE lower(leads.company_name) LIKE @like
           OR lower(leads.city) LIKE @like
           OR (@digits <> '' AND digits_only(leads.phone) LIKE '%' || @digits || '%')
        ORDER BY CASE
                   WHEN @digits <> '' AND digits_only(leads.phone) = @digits THEN 0
                   WHEN lower(leads.company_name) LIKE @prefix THEN 1
                   ELSE 2
                 END,
                 leads.company_name COLLATE NOCASE
        LIMIT 20`
    )
    .all({ like, prefix, digits });

  res.json(rows);
});

router.get("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });
  res.json({ ...lead, notes_list: notesForLead(lead.id) });
});

// POST /api/leads/:id/notes - nowa notatka; zwraca pelna, aktualna liste notatek leada
router.post("/:id/notes", (req, res) => {
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Notatka nie moze byc pusta" });

  db.prepare("INSERT INTO lead_notes (lead_id, content) VALUES (?, ?)").run(lead.id, content);
  res.status(201).json(notesForLead(lead.id));
});

// PATCH /api/leads/:id/notes/:noteId - edytuje tresc notatki; stara tresc trafia do
// lead_note_edits (nic nie ginie), zwraca pelna, aktualna liste notatek leada.
router.patch("/:id/notes/:noteId", (req, res) => {
  const note = db.prepare("SELECT * FROM lead_notes WHERE id = ? AND lead_id = ?").get(req.params.noteId, req.params.id);
  if (!note) return res.status(404).json({ error: "Nie znaleziono notatki" });

  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Notatka nie moze byc pusta" });

  if (content !== note.content) {
    db.transaction(() => {
      db.prepare("INSERT INTO lead_note_edits (note_id, content) VALUES (?, ?)").run(note.id, note.content);
      db.prepare("UPDATE lead_notes SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, note.id);
    })();
  }

  res.json(notesForLead(req.params.id));
});

// GET /api/leads/:id/notes/:noteId/history - poprzednie tresci notatki (najnowsza zmiana pierwsza)
router.get("/:id/notes/:noteId/history", (req, res) => {
  const note = db.prepare("SELECT id FROM lead_notes WHERE id = ? AND lead_id = ?").get(req.params.noteId, req.params.id);
  if (!note) return res.status(404).json({ error: "Nie znaleziono notatki" });

  const history = db
    .prepare("SELECT content, replaced_at FROM lead_note_edits WHERE note_id = ? ORDER BY replaced_at DESC, id DESC")
    .all(note.id);
  res.json(history);
});

// DELETE /api/leads/:id/notes/:noteId - usuwa notatke; zwraca aktualna liste
router.delete("/:id/notes/:noteId", (req, res) => {
  const info = db
    .prepare("DELETE FROM lead_notes WHERE id = ? AND lead_id = ?")
    .run(req.params.noteId, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Nie znaleziono notatki" });
  res.json(notesForLead(req.params.id));
});

// ===== #4 Proby (tracker telefonow) =====

// GET /api/leads/:id/attempts - historia prob dzwonienia (godzina + data), najnowsza pierwsza
router.get("/:id/attempts", (req, res) => {
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });
  res.json(attemptsForLead(lead.id));
});

// POST /api/leads/:id/attempts - dodaje jedna probe; happened_at opcjonalne (domyslnie teraz).
// Zwraca pelna, aktualna liste prob leada.
router.post("/:id/attempts", (req, res) => {
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const happenedAt = req.body.happened_at ? String(req.body.happened_at) : localDateTime();
  if (!ATTEMPT_WHEN_FORMAT.test(happenedAt)) {
    return res.status(400).json({ error: `Nieprawidlowa data proby: "${happenedAt}"` });
  }

  db.prepare("INSERT INTO lead_call_attempts (lead_id, happened_at, created_by) VALUES (?, ?, ?)").run(
    lead.id,
    happenedAt,
    req.user?.display_name || ""
  );
  res.status(201).json(attemptsForLead(lead.id));
});

// DELETE /api/leads/:id/attempts/:attemptId - usuwa jedna probe z historii; zwraca aktualna liste
router.delete("/:id/attempts/:attemptId", (req, res) => {
  const info = db
    .prepare("DELETE FROM lead_call_attempts WHERE id = ? AND lead_id = ?")
    .run(req.params.attemptId, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Nie znaleziono proby" });
  res.json(attemptsForLead(req.params.id));
});

// PUT /api/leads/:id/attempts/count - reczna edycja LICZBY prob (inline w tabeli). Uzgadnia
// liczbe wierszy do podanej wartosci: brakujace dodaje z godzina "teraz", nadmiarowe kasuje
// od najnowszych. Historia (popover) pozostaje zrodlem prawdy. Zwraca aktualna liste.
router.put("/:id/attempts/count", (req, res) => {
  const lead = db.prepare("SELECT id FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const target = Number(req.body.count);
  if (!Number.isInteger(target) || target < 0 || target > 999) {
    return res.status(400).json({ error: `Nieprawidlowa liczba prob: "${req.body.count}"` });
  }

  const current = db.prepare("SELECT COUNT(*) c FROM lead_call_attempts WHERE lead_id = ?").get(lead.id).c;
  const by = req.user?.display_name || "";

  db.transaction(() => {
    if (target > current) {
      const insert = db.prepare(
        "INSERT INTO lead_call_attempts (lead_id, happened_at, created_by) VALUES (?, ?, ?)"
      );
      const when = localDateTime();
      for (let i = 0; i < target - current; i++) insert.run(lead.id, when, by);
    } else if (target < current) {
      db.prepare(
        `DELETE FROM lead_call_attempts WHERE id IN (
           SELECT id FROM lead_call_attempts WHERE lead_id = ?
           ORDER BY happened_at DESC, id DESC LIMIT ?
         )`
      ).run(lead.id, current - target);
    }
  })();

  res.json(attemptsForLead(lead.id));
});

router.patch("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const updates = {};

  for (const field of TEXT_FIELDS) {
    if (field in req.body) updates[field] = req.body[field] == null ? "" : String(req.body[field]);
  }
  for (const field of BOOL_FIELDS) {
    if (field in req.body) updates[field] = req.body[field] ? 1 : 0;
  }
  // "czas do decyzji" z panelu na scheme rozmowy (script.js) - system'owa wartosc, nie ma
  // pola do jej recznego wpisania w UI; null = reset stopera (patrz resetPanelTimer)
  if ("decision_seconds" in req.body) {
    const raw = req.body.decision_seconds;
    if (raw === null) {
      updates.decision_seconds = null;
    } else {
      const seconds = Number(raw);
      if (!Number.isInteger(seconds) || seconds < 0) {
        return res.status(400).json({ error: "Nieprawidlowa wartosc decision_seconds" });
      }
      updates.decision_seconds = seconds;
    }
  }
  for (const field of TIME_FIELDS) {
    if (!(field in req.body)) continue;
    const value = req.body[field] == null ? "" : String(req.body[field]);
    if (value !== "" && !TIME_FORMAT.test(value)) {
      return res.status(400).json({ error: `Nieprawidlowa godzina ${field}: "${value}"` });
    }
    updates[field] = value;
  }

  // etap budowy strony (#14) - klikany w kolku przy pozycji w "Najblizsze Google Meety"
  if ("site_progress" in req.body) {
    const stage = Number(req.body.site_progress);
    if (!SITE_PROGRESS_OPTIONS.some((o) => o.value === stage)) {
      return res.status(400).json({ error: `Nieprawidlowy etap strony: "${req.body.site_progress}"` });
    }
    updates.site_progress = stage;
  }

  const enumFields = { ...ENUM_FIELDS_STATIC, caller: getCallerNames() };
  for (const [field, allowed] of Object.entries(enumFields)) {
    if (!(field in req.body)) continue;
    const value = req.body[field] == null ? "" : String(req.body[field]);
    // "interested" nie ma sensownego stanu pustego - kazdy lead ma jakis status
    const emptyAllowed = field !== "interested";
    if (value === "" ? !emptyAllowed : !allowed.includes(value)) {
      return res.status(400).json({ error: `Nieprawidlowa wartosc ${field}: "${value}"` });
    }
    updates[field] = value;
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: "Brak pol do aktualizacji" });

  const calledAt = computeCalledAt({ ...lead, ...updates }, lead.called_at);
  const dopieteAt = computeDopieteAt({ ...lead, ...updates }, lead.dopiete_at);

  const setClauses = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");

  db.prepare(
    `UPDATE leads SET ${setClauses}, called_at = @called_at, dopiete_at = @dopiete_at, updated_at = datetime('now') WHERE id = @id`
  ).run({ ...updates, called_at: calledAt, dopiete_at: dopieteAt, id: req.params.id });

  const updated = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  res.json({ ...updated, notes_list: notesForLead(updated.id) });
});

// DELETE /api/leads/:id - usuwa leada razem z jego notatkami (ON DELETE CASCADE).
// Nieodwracalne, wiec front pyta o potwierdzenie nazwa firmy (patrz niche.js).
router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Nie znaleziono leada" });
  res.json({ ok: true });
});

module.exports = router;
