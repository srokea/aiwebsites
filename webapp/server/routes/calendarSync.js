const express = require("express");
const db = require("../db");
const sync = require("../calendarSync");
const { CalDavError } = require("../caldav");

const router = express.Router();

// Parowanie kalendarza iCloud - kazdy endpoint dziala TYLKO na koncie zalogowanej osoby
// (req.user.id), nikt nie widzi ani nie zmienia cudzego parowania. Haslo do aplikacji nigdy
// nie wraca w odpowiedzi (publicAccount w calendarSync.js).

// adres appki, ktory trafia do opisu wydarzenia ("Lead w appce: ...") - z naglowkow requestu,
// bo za Cloudflare Tunnel serwer sam nie wie, pod jaka publiczna domena go widac
function appUrlOf(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function handle(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req, res));
    } catch (err) {
      if (err instanceof sync.SyncError) return res.status(err.status).json({ error: err.message });
      if (err instanceof CalDavError) {
        const status = err.code === "auth" ? 400 : err.code === "forbidden" ? 403 : 502;
        return res.status(status).json({ error: err.message, code: err.code });
      }
      console.error("[kalendarz]", err);
      res.status(500).json({ error: err.message || "Błąd serwera" });
    }
  };
}

// GET /api/calendar-sync - stan parowania zalogowanej osoby + kto jeszcze w zespole ma
// podpiety kalendarz (zeby przy wyborze terminu bylo wiadomo, czy Meet gdzies trafi)
router.get(
  "/",
  handle((req) => {
    const team = db
      .prepare(
        `SELECT users.display_name AS name FROM calendar_accounts
           JOIN users ON users.id = calendar_accounts.user_id WHERE calendar_accounts.calendar_url <> ''`
      )
      .all()
      .map((r) => r.name);
    return { account: sync.publicAccount(sync.accountFor(req.user.id)), team };
  })
);

// POST /api/calendar-sync/connect { username, password } -> { account, calendars }
router.post(
  "/connect",
  handle((req) =>
    sync.connect(req.user.id, {
      username: req.body.username,
      password: req.body.password,
      appUrl: appUrlOf(req),
      // tylko do lokalnych testow (atrapa CalDAV) - na produkcji zmienna nie istnieje = iCloud
      serverUrl: process.env.CALDAV_SERVER_URL || undefined,
    })
  )
);

// GET /api/calendar-sync/calendars - swieza lista kalendarzy (zmiana kalendarza docelowego)
router.get(
  "/calendars",
  handle(async (req) => ({ calendars: await sync.listCalendarsFor(req.user.id) }))
);

// POST /api/calendar-sync/calendar { url } albo { create: "nazwa" }
router.post(
  "/calendar",
  handle((req) =>
    sync.chooseCalendar(req.user.id, {
      url: req.body.url,
      createName: req.body.create,
      color: req.user.color,
    })
  )
);

// PATCH /api/calendar-sync/settings { scope, durationMin, alarmMin }
router.patch(
  "/settings",
  handle((req) => sync.updateSettings(req.user.id, req.body || {}, appUrlOf(req)))
);

// POST /api/calendar-sync/sync - "Synchronizuj teraz" (dziala tez po bledzie logowania)
router.post(
  "/sync",
  handle((req) => sync.syncNow(req.user.id))
);

// POST /api/calendar-sync/flush { leadId } - po zmianie terminu w kalendarzyku: sync od razu
// i informacja, w czyich kalendarzach ten Meet teraz jest
router.post(
  "/flush",
  handle((req) => {
    const leadId = Number(req.body.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) throw new sync.SyncError("Brak leadId");
    return sync.flushForLead(leadId);
  })
);

router.post(
  "/test",
  handle((req) => sync.sendTestEvent(req.user.id))
);

router.delete(
  "/test",
  handle((req) => sync.removeTestEvent(req.user.id))
);

// DELETE /api/calendar-sync?removeEvents=1 - rozlaczenie (opcjonalnie ze sprzataniem
// nadchodzacych Meetow z kalendarza)
router.delete(
  "/",
  handle((req) => sync.disconnect(req.user.id, { removeEvents: req.query.removeEvents === "1" }))
);

module.exports = router;
