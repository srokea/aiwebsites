const express = require("express");
const db = require("../db");

const router = express.Router();
const LIMIT = 12;

// google_term jest typu datetime-local ("YYYY-MM-DDTHH:mm"), callback_when typu date
// ("YYYY-MM-DD") - to jedyne formaty jakie moglo tam zapisac UI. Stare importy czasem
// maja tam za to wolny tekst wpisany przez scraper (np. "12:00 poniedzialek", "08.02") -
// a Date() potrafi taki tekst "sparsowac" na bez sensu losowy rok (np. 2001), wiec samo
// isNaN nie wystarczy - wymagamy wprost jednego z dwóch prawdziwych formatow.
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// Zwraca { items, total }: items przyciete do LIMIT, total = wszystkie zaplanowane
// (z poprawna data) - do licznika "(N)" w naglowku sekcji na stronie glownej.
function onlyValidDates(rows) {
  const valid = rows
    .filter((r) => DATE_FORMAT.test(r.when_at))
    .map((r) => ({ ...r, _when: new Date(r.when_at) }))
    .sort((a, b) => a._when - b._when);
  return { items: attachNotes(valid.slice(0, LIMIT).map(({ _when, ...r }) => r)), total: valid.length };
}

// Dokleja notatki leada (najnowsza pierwsza) do kazdej pozycji - dashboard pokazuje przy nich
// pinezke z podgladem, zeby przed oddzwonieniem nie trzeba bylo wchodzic w nisze.
function attachNotes(items) {
  if (!items.length) return items;
  const rows = db
    .prepare(
      `SELECT lead_id, content, created_at FROM lead_notes
       WHERE lead_id IN (${items.map(() => "?").join(",")})
       ORDER BY created_at DESC, id DESC`
    )
    .all(items.map((i) => i.id));
  const byLead = new Map();
  for (const { lead_id, ...note } of rows) {
    if (!byLead.has(lead_id)) byLead.set(lead_id, []);
    byLead.get(lead_id).push(note);
  }
  return items.map((i) => ({ ...i, notes: byLead.get(i.id) || [] }));
}

// GET /api/upcoming - najblizsze Google Meety (google_term) i callbacki (callback_when)
// ze wszystkich nisz naraz. Przeterminowane tez sie pokazuja (na gorze, jako najpilniejsze) -
// to zamierzone, nie filtrujemy "tylko przyszlosc".
router.get("/", (req, res) => {
  const meetsRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.city, leads.caller, leads.google_term AS when_at,
              niches.slug AS niche_slug, niches.name AS niche_name
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.google_term <> ''`
    )
    .all();

  const callbacksRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.city, leads.caller, leads.callback_when AS when_at,
              niches.slug AS niche_slug, niches.name AS niche_name
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.callback_when <> ''`
    )
    .all();

  const meets = onlyValidDates(meetsRaw);
  const callbacks = onlyValidDates(callbacksRaw);
  res.json({
    meets: meets.items,
    meetsTotal: meets.total,
    callbacks: callbacks.items,
    callbacksTotal: callbacks.total,
  });
});

module.exports = router;
