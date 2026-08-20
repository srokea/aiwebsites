const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, SITE_PROGRESS_OPTIONS } = require("../constants");
const { STATS_ELIGIBLE_SQL } = require("../leadStatus");

const router = express.Router();

// Status = leads.interested, dokladnie te same wartosci co w reszcie appki (dropdown w
// niszy/panelu, wykres kolowy, stat-bary) - patrz constants.js. Zero osobnego tlumaczenia
// na wlasny enum: Jarvis uczy sie tych samych nazw, ktorych Sylwester/Nikodem juz uzywaja
// na co dzien, wiec nie ma szans na rozjazd znaczenia (np. mylenie "dopiete" z "zamkniete").
const STATUS_VALUES = new Set(INTERESTED_OPTIONS.map((o) => o.value));
const STATUS_LABELS = Object.fromEntries(INTERESTED_OPTIONS.map((o) => [o.value, o.label]));

// callback_when jest typu date ("YYYY-MM-DD"), google_term typu datetime-local
// ("YYYY-MM-DDTHH:mm") - jedyne formaty jakie mogl tam zapisac frontend. Stare importy CSV
// czasem maja tam wolny tekst scrapera - odrzucamy go zamiast pozwolic Date() zgadywac
// bzdurny rok (patrz identyczny problem/komentarz w upcoming.js).
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const DATE_ONLY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function toDateOnly(value) {
  return DATE_FORMAT.test(value || "") ? value.slice(0, 10) : null;
}

// next_followup = wczesniejsza z dwoch dat "kolejnego kroku" na leadzie (oddzwonienie albo
// Google Meet) - te same dwa pola, ktore panel "Najblizsze" na dashboardzie pokazuje jako
// dwie osobne listy (patrz upcoming.js); tutaj scalone w jedna date, bo Jarvis pyta
// per-lead, nie per-typ-wydarzenia.
function nextFollowup(lead) {
  const dates = [toDateOnly(lead.callback_when), toDateOnly(lead.google_term)].filter(Boolean);
  return dates.length ? dates.sort()[0] : null;
}

// Najnowsza notatka per lead w jednym zapytaniu (zamiast N+1) - ROW_NUMBER + PARTITION BY,
// ten sam porzadek "najnowsza pierwsza" co wszedzie indziej (patrz notesForLead w leads.js).
function latestNotesByLead(leadIds) {
  if (!leadIds.length) return new Map();
  const rows = db
    .prepare(
      `SELECT lead_id, content FROM (
         SELECT lead_id, content,
                ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC, id DESC) rn
         FROM lead_notes WHERE lead_id IN (${leadIds.map(() => "?").join(",")})
       ) WHERE rn = 1`
    )
    .all(leadIds);
  return new Map(rows.map((r) => [r.lead_id, r.content]));
}

// GET /api/jarvis/calls - plaska lista leadow ze wszystkich nisz, do wykorzystania przez
// asystenta (Jarvis) bez wchodzenia na strone. Read-only (patrz plan w pamieci Claude:
// zapis dostanie Jarvis pozniej przez te sama trase auth, jak realnie zacznie pisac dane) -
// klucz API doklada sie jak zwykle konto (patrz server/scripts/createApiKey.js), wiec
// requireAuth w index.js obsluguje to bez zadnych zmian.
router.get("/calls", (req, res) => {
  const { status, next_followup_before } = req.query;

  if (status !== undefined && !STATUS_VALUES.has(status)) {
    return res.status(400).json({
      error: `Nieprawidlowy status: "${status}". Dozwolone: ${[...STATUS_VALUES].join(", ")}`,
    });
  }
  if (next_followup_before !== undefined && !DATE_ONLY_FORMAT.test(next_followup_before)) {
    return res.status(400).json({ error: "next_followup_before musi byc w formacie YYYY-MM-DD" });
  }

  const rows = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.caller, leads.interested,
              leads.called_at, leads.callback_when, leads.google_term,
              niches.name AS niche, niches.slug AS niche_slug
       FROM leads JOIN niches ON niches.id = leads.niche_id
       ${status ? "WHERE leads.interested = @status" : ""}
       ORDER BY leads.id ASC`
    )
    .all(status ? { status } : {});

  const notesByLead = latestNotesByLead(rows.map((r) => r.id));

  let calls = rows.map((r) => ({
    id: r.id,
    client: r.company_name,
    phone: r.phone,
    caller: r.caller || null,
    niche: r.niche,
    niche_slug: r.niche_slug,
    status: r.interested,
    status_label: STATUS_LABELS[r.interested] || r.interested,
    last_contact: r.called_at ? r.called_at.slice(0, 10) : null,
    next_followup: nextFollowup(r),
    notes: notesByLead.get(r.id) || "",
  }));

  if (next_followup_before) {
    calls = calls.filter((c) => c.next_followup && c.next_followup <= next_followup_before);
  }

  res.json(calls);
});

const SITE_PROGRESS_LABELS = Object.fromEntries(SITE_PROGRESS_OPTIONS.map((o) => [o.value, o.label]));

// Te same 4 kategorie co panel "Najblizsze" na dashboardzie (patrz upcoming.js: meets,
// callbacks, sms, closing) + piata, "mail" (leady ze statusem Mail, dla ktorych rowniez nie
// ma osobnej daty w UI - jak Closing, sortujemy po tym, kiedy lead byl ostatnio ruszony).
// UWAGA na "mail" vs "callback": status "my_dzwonimy" ma etykiete "Oddzwonic - Poczta" w UI,
// ale to jeden status, nie dwa - "callback" nizej odpowiada oddzwonieniu (callback_when),
// a "mail" osobnemu statusowi "Mail". Popraw ten podzial, jesli Jarvis mial na mysli co innego.
function buildUpcoming() {
  const meetsRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.caller, leads.google_term AS when_at,
              leads.site_progress, niches.slug AS niche_slug, niches.name AS niche
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.google_term <> ''`
    )
    .all();

  const callbacksRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.caller, leads.callback_when AS when_at,
              niches.slug AS niche_slug, niches.name AS niche
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.callback_when <> ''`
    )
    .all();

  // Meety na jutro - ta sama definicja co panel "SMS do wyslania" (patrz upcoming.js)
  const smsRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.caller, leads.google_term AS when_at,
              niches.slug AS niche_slug, niches.name AS niche
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE substr(leads.google_term, 1, 10) = date('now', 'localtime', '+1 day')`
    )
    .all();

  const closingRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.caller,
              date(leads.updated_at, 'localtime') AS when_at,
              niches.slug AS niche_slug, niches.name AS niche
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.interested = 'closing'`
    )
    .all();

  const mailRaw = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.caller,
              date(leads.updated_at, 'localtime') AS when_at,
              niches.slug AS niche_slug, niches.name AS niche
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.interested = 'mail'`
    )
    .all();

  const toItems = (rows, type, checkDateFormat) =>
    rows
      .filter((r) => !checkDateFormat || DATE_FORMAT.test(r.when_at))
      .map((r) => ({
        type,
        id: r.id,
        client: r.company_name,
        phone: r.phone,
        caller: r.caller || null,
        niche: r.niche,
        niche_slug: r.niche_slug,
        when: r.when_at,
        // tylko przy Meetach - postep budowy strony (#14), zeby dalo sie samemu wychwycic
        // "spotkanie juz blisko, a strona wciaz na 0%" bez kolejnego zapytania
        ...(type === "meet"
          ? { site_progress: r.site_progress, site_progress_label: SITE_PROGRESS_LABELS[r.site_progress] ?? null }
          : {}),
      }))
      .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));

  return [
    ...toItems(meetsRaw, "meet", true),
    ...toItems(callbacksRaw, "callback", true),
    ...toItems(smsRaw, "sms", true),
    ...toItems(closingRaw, "closing", false),
    ...toItems(mailRaw, "mail", false),
  ];
}

const UPCOMING_TYPES = new Set(["meet", "callback", "sms", "closing", "mail"]);

// GET /api/jarvis/upcoming - splaszczona wersja panelu "Najblizsze" z dashboardu (4 listy +
// status stron przy Meetach), plus piata kategoria "mail". ?type= zawezia do jednej kategorii.
router.get("/upcoming", (req, res) => {
  const { type } = req.query;
  if (type !== undefined && !UPCOMING_TYPES.has(type)) {
    return res.status(400).json({ error: `Nieprawidlowy type: "${type}". Dozwolone: ${[...UPCOMING_TYPES].join(", ")}` });
  }
  const items = buildUpcoming();
  res.json(type ? items.filter((i) => i.type === type) : items);
});

// GET /api/jarvis/todo?niche=<slug> - leady "do zrobienia" (jeszcze niezadzwonione, licza sie
// do statystyk "do zrobienia") z pelnym info i telefonem. Ta sama definicja co reszta appki:
// STATS_ELIGIBLE_SQL (bez wlasnej strony, jakosc != 0) + called_at IS NULL (patrz leadStatus.js) -
// zeby liczba pozycji zgadzala sie z tym, co widac w kafelku "Do zrobienia" na dashboardzie.
router.get("/todo", (req, res) => {
  const { niche } = req.query;
  let nicheRow = null;
  if (niche !== undefined) {
    nicheRow = db.prepare("SELECT id, slug, name FROM niches WHERE slug = ?").get(niche);
    if (!nicheRow) return res.status(404).json({ error: `Nie ma niszy: "${niche}"` });
  }

  const rows = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.phone, leads.city, leads.quality, leads.interested,
              leads.open_time, leads.close_time, leads.callback_when, leads.google_term,
              niches.slug AS niche_slug, niches.name AS niche
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE ${STATS_ELIGIBLE_SQL} AND leads.called_at IS NULL
       ${nicheRow ? "AND leads.niche_id = @nicheId" : ""}
       ORDER BY niches.name ASC, leads.id ASC`
    )
    .all(nicheRow ? { nicheId: nicheRow.id } : {});

  const notesByLead = latestNotesByLead(rows.map((r) => r.id));

  res.json(
    rows.map((r) => ({
      id: r.id,
      client: r.company_name,
      phone: r.phone,
      city: r.city,
      niche: r.niche,
      niche_slug: r.niche_slug,
      status: r.interested,
      status_label: STATUS_LABELS[r.interested] || r.interested,
      quality: r.quality || null,
      open_time: r.open_time || null,
      close_time: r.close_time || null,
      callback_when: r.callback_when || null,
      google_term: r.google_term || null,
      notes: notesByLead.get(r.id) || "",
    }))
  );
});

module.exports = router;
