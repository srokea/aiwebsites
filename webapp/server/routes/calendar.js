const express = require("express");
const db = require("../db");
const { getCallerNames } = require("../callers");
const { localDate } = require("../time");

const router = express.Router();

const MONTH_FORMAT = /^\d{4}-\d{2}$/;
// google_term: "YYYY-MM-DDTHH:MM"; callback_when: "YYYY-MM-DD" albo (po #8) "YYYY-MM-DDTHH:MM".
// Stare importy miewaja tam wolny tekst - wymagamy wprost prawdziwego formatu daty.
const WHEN_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// GET /api/calendar?month=YYYY-MM - pozycje kalendarza na dany miesiac: Google Meety
// (google_term) i oddzwonienia (callback_when) ze wszystkich nisz. Front sam grupuje po dniu
// i maluje znaczniki (dzien z Meetem = czerwony, oddzwonienie = niebieska kropka).
router.get("/", (req, res) => {
  const month = MONTH_FORMAT.test(req.query.month || "") ? String(req.query.month) : localDate().slice(0, 7);
  const caller = req.query.caller && getCallerNames().includes(String(req.query.caller)) ? String(req.query.caller) : null;
  const callerClause = caller ? "AND leads.caller = ?" : "";
  const params = caller ? [`${month}-%`, caller] : [`${month}-%`];

  const meets = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.city, leads.caller, leads.google_term AS when_at,
              niches.slug AS niche_slug, niches.name AS niche_name
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.google_term LIKE ? ${callerClause}`
    )
    .all(...params);

  const callbacks = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.city, leads.caller, leads.callback_when AS when_at,
              niches.slug AS niche_slug, niches.name AS niche_name
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE leads.callback_when LIKE ? ${callerClause}`
    )
    .all(...params);

  const toItem = (kind) => (r) => ({
    kind,
    date: r.when_at.slice(0, 10),
    time: r.when_at.length > 10 ? r.when_at.slice(11, 16) : "",
    lead_id: r.id,
    company: r.company_name,
    city: r.city,
    caller: r.caller,
    niche_slug: r.niche_slug,
    niche_name: r.niche_name,
  });

  const items = [
    ...meets.filter((r) => WHEN_FORMAT.test(r.when_at)).map(toItem("meet")),
    ...callbacks.filter((r) => WHEN_FORMAT.test(r.when_at)).map(toItem("callback")),
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  res.json({ month, items });
});

module.exports = router;
