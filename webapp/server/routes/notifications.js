const express = require("express");
const db = require("../db");
const { getCallerNames } = require("../callers");
const { localDate } = require("../time");

const router = express.Router();

const WHEN_FORMAT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function shiftDate(iso, deltaDays) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return localDate(d);
}

// GET /api/notifications?days=N - zadania "na dany dzien" (Google Meet / oddzwonienie / SMS)
// dla dzisiaj + N dni wstecz, zgrupowane po dacie (dzis pierwsze). Alerty NIE sa nigdzie
// zapisywane - liczymy je z biezacego stanu leadow. "Przeczytane" ogarnia front (localStorage).
router.get("/", (req, res) => {
  const today = localDate();
  const days = Math.min(60, Math.max(1, parseInt(req.query.days, 10) || 14));
  const from = shiftDate(today, -(days - 1));
  const caller = req.query.caller && getCallerNames().includes(String(req.query.caller)) ? String(req.query.caller) : null;
  const callerClause = caller ? "AND leads.caller = ?" : "";
  const args = caller ? [caller] : [];

  const rows = db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.caller, leads.google_term, leads.callback_when,
              niches.slug AS niche_slug, niches.name AS niche_name
       FROM leads JOIN niches ON niches.id = leads.niche_id
       WHERE (leads.google_term <> '' OR leads.callback_when <> '') ${callerClause}`
    )
    .all(...args);

  // date -> [items]
  const byDate = new Map();
  const push = (date, item) => {
    if (date < from || date > today) return;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(item);
  };

  for (const r of rows) {
    const base = {
      lead_id: r.id,
      company: r.company_name,
      caller: r.caller,
      niche_slug: r.niche_slug,
      niche_name: r.niche_name,
    };

    if (WHEN_FORMAT.test(r.google_term)) {
      const day = r.google_term.slice(0, 10);
      const time = r.google_term.slice(11, 16);
      push(day, { ...base, kind: "meet", time, label: `Google Meet${time ? ` o ${time}` : ""}` });
      // SMS potwierdzajacy wysylamy dzien PRZED spotkaniem
      push(shiftDate(day, -1), { ...base, kind: "sms", time: "", label: `SMS potwierdzający (Meet ${day}${time ? ` ${time}` : ""})` });
    }

    if (WHEN_FORMAT.test(r.callback_when)) {
      const day = r.callback_when.slice(0, 10);
      const time = r.callback_when.length > 10 ? r.callback_when.slice(11, 16) : "";
      push(day, { ...base, kind: "callback", time, label: `Oddzwonić${time ? ` o ${time}` : ""}` });
    }
  }

  const daysOut = [...byDate.entries()]
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  res.json({ today, days: daysOut });
});

module.exports = router;
