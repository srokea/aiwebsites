const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, ANSWERED_OPTIONS, CALLERS, WEBSITE_STATUS_OPTIONS } = require("../constants");
const { computeCalledAt } = require("../leadStatus");

const router = express.Router();

const TEXT_FIELDS = [
  "company_name",
  "city",
  "phone",
  "quality",
  "website_url",
  "reminder",
  "callback_when",
  "google_term",
  "notes",
  "research_notes",
];
const BOOL_FIELDS = ["tag_instagram", "tag_facebook", "tag_booksy", "tag_youtube"];

// Pola z zamknieta lista wartosci - pusty string zawsze dozwolony (= "nie ustawiono").
const ENUM_FIELDS = {
  interested: INTERESTED_OPTIONS.map((o) => o.value),
  answered: ANSWERED_OPTIONS.map((o) => o.value),
  caller: CALLERS,
  has_social: WEBSITE_STATUS_OPTIONS.map((o) => o.value),
};

router.get("/:id", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });
  res.json(lead);
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
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
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

  const setClauses = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");

  db.prepare(
    `UPDATE leads SET ${setClauses}, called_at = @called_at, updated_at = datetime('now') WHERE id = @id`
  ).run({ ...updates, called_at: calledAt, id: req.params.id });

  res.json(db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id));
});

module.exports = router;
