const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, INTERESTED_STATS_ORDER, INTERESTED_DONUT_ORDER, DAILY_GOAL, PRICING } = require("../constants");
const { STATS_ELIGIBLE_SQL, STATS_BREAKDOWN_SQL } = require("../leadStatus");
const { getCallers, getCallerNames } = require("../callers");
const { financeSync, summary: financeSummary, fullMonthsElapsed } = require("../finance");

const router = express.Router();

// GET /api/stats - zbiorcze statystyki na strone glowna
// Wszystkie liczniki dzwonienia pomijaja leady ze Strona = "Tak" (patrz STATS_ELIGIBLE_SQL) -
// tylko "total" to pelna liczba leadow w bazie.
router.get("/", (req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) total,
              COALESCE(SUM(${STATS_ELIGIBLE_SQL}), 0) eligible,
              COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}), 0) called,
              COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}
                       AND date(called_at, 'localtime') = date('now', 'localtime')), 0) calledToday
       FROM leads`
    )
    .get();

  const interestedRows = db
    .prepare(`SELECT interested, COUNT(*) c FROM leads WHERE ${STATS_BREAKDOWN_SQL} GROUP BY interested`)
    .all();
  const countByValue = new Map(interestedRows.map((r) => [r.interested, r.c]));

  // "Google Meet" w tym zbiorczym rozkladzie liczy sie INACZEJ niz reszta statusow: nie po tym,
  // co jest wpisane w "Zainteresowany" (bo tam zostaje na zawsze, nawet po odbytym i dawno
  // zapomnianym spotkaniu), tylko po realnie NADCHODZACYCH terminach (google_term w przyszlosci) -
  // dokladnie ta sama definicja co kafelek "Meety przed nami" w statystykach osoby (patrz
  // /caller/:name ponizej), zeby suma osob zawsze zgadzala sie z liczba na dashboardzie.
  const googleMeetAhead = db
    .prepare(
      `SELECT COUNT(*) c FROM leads
       WHERE google_term <> '' AND google_term >= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')`
    )
    .get().c;

  const interestedBreakdown = INTERESTED_STATS_ORDER.map((value) => {
    const opt = INTERESTED_OPTIONS.find((o) => o.value === value);
    const count = value === "google_meet" ? googleMeetAhead : countByValue.get(value) || 0;
    return { ...opt, count };
  });

  const byCallerRows = db
    .prepare(
      `SELECT caller, COUNT(*) c FROM leads
       WHERE called_at IS NOT NULL AND caller <> '' AND ${STATS_ELIGIBLE_SQL} GROUP BY caller`
    )
    .all();
  const countByCaller = new Map(byCallerRows.map((r) => [r.caller, r.c]));
  const byCaller = getCallerNames().map((c) => ({ caller: c, count: countByCaller.get(c) || 0 }));

  // "W grze": leady po odbytej rozmowie, jeszcze nie dopiete, ale najblizej (Meet umowiony/
  // odbyty albo czekaja na podpis) - kontekst do linijki "potencjal" w zmergowanym panelu Kasy.
  const pipelineCount = db
    .prepare("SELECT COUNT(*) c FROM leads WHERE interested IN ('google_meet', 'closing')")
    .get().c;

  // #6 - zmergowana sekcja finansowa: realne liczby z historii transakcji (Bilans / Przychod /
  // Koszty) + kontekst (klienci, potencjalny MRR) + ile naleznosci czeka na potwierdzenie.
  financeSync();
  const finance = { ...financeSummary(), pipelineCount, monthlyRate: PRICING.monthly };

  res.json({
    total: totals.total,
    eligible: totals.eligible,
    called: totals.called,
    todo: totals.eligible - totals.called,
    calledToday: totals.calledToday,
    dailyGoal: DAILY_GOAL,
    interestedBreakdown,
    byCaller,
    finance,
  });
});

// GET /api/stats/caller/:name - statystyki jednej osoby (klik w osobe na dashboardzie).
// Liczymy po kolumnie leads.caller, czyli po tym KTO JEST WPISANY jako dzwoniacy, a nie po
// zalogowanym koncie - czasem dzwoni sie "za" kogos i wtedy telefon liczy sie temu wpisanemu
// (ta sama zasada co w rozkladzie "Zadzwonione wg osoby" na wykresie zbiorczym wyzej).
router.get("/caller/:name", (req, res) => {
  const name = String(req.params.name);
  if (!getCallerNames().includes(name)) {
    return res.status(404).json({ error: `Nie znam dzwoniącego: ${name}` });
  }

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}), 0) called,
              COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}
                       AND date(called_at, 'localtime') = date('now', 'localtime')), 0) calledToday,
              COALESCE(SUM(called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}
                       AND date(called_at, 'localtime') >= date('now', 'localtime', '-6 days')), 0) calledWeek,
              COALESCE(SUM(answered = 'Tak'), 0) answered
       FROM leads WHERE caller = ?`
    )
    .get(name);

  // ile z tego, co zespol wydzwonil w ogole, to zasluga tej osoby
  const teamCalled = db
    .prepare(`SELECT COUNT(*) c FROM leads WHERE called_at IS NOT NULL AND caller <> '' AND ${STATS_ELIGIBLE_SQL}`)
    .get().c;

  const interestedRows = db
    .prepare(`SELECT interested, COUNT(*) c FROM leads WHERE caller = ? AND ${STATS_BREAKDOWN_SQL} GROUP BY interested`)
    .all(name);
  const countByValue = new Map(interestedRows.map((r) => [r.interested, r.c]));
  // te same statusy co na wykresie kolowym dashboardu - zeby oba widoki mowily to samo
  const interestedBreakdown = INTERESTED_DONUT_ORDER.map((value) => {
    const opt = INTERESTED_OPTIONS.find((o) => o.value === value);
    return { ...opt, count: countByValue.get(value) || 0 };
  });

  const byNiche = db
    .prepare(
      `SELECT n.name, n.color, COUNT(*) c FROM leads l JOIN niches n ON n.id = l.niche_id
       WHERE l.caller = ? AND l.called_at IS NOT NULL AND ${STATS_ELIGIBLE_SQL}
       GROUP BY n.id ORDER BY c DESC`
    )
    .all(name);

  // Kasa liczona dokladnie tak samo jak w panelu zbiorczym (patrz wyzej) - tylko z leadow
  // dopietych przez te osobe. Bez filtra "eligible": dopiety klient dostaje pozniej Strona = "Tak".
  // cena klienta: indywidualna z client_pricing (#6 - edycja w Kasie) albo domyslna PRICING
  const dopieteRows = db
    .prepare(
      `SELECT l.dopiete_at, p.onetime_grosze, p.monthly_grosze
       FROM leads l LEFT JOIN client_pricing p ON p.lead_id = l.id
       WHERE l.caller = ? AND l.interested = 'dopiete'`
    )
    .all(name);
  const now = new Date();
  const earned = dopieteRows.reduce((sum, row) => {
    const months = row.dopiete_at ? fullMonthsElapsed(row.dopiete_at, now) : 0;
    const onetime = row.onetime_grosze != null ? row.onetime_grosze / 100 : PRICING.oneTime;
    const monthly = row.monthly_grosze != null ? row.monthly_grosze / 100 : PRICING.monthly;
    return sum + onetime + monthly * (months + 1);
  }, 0);

  const meetsAhead = db
    .prepare(
      `SELECT COUNT(*) c FROM leads
       WHERE caller = ? AND google_term <> '' AND google_term >= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')`
    )
    .get(name).c;

  res.json({
    caller: name,
    called: totals.called,
    calledToday: totals.calledToday,
    calledWeek: totals.calledWeek,
    answered: totals.answered,
    sharePct: teamCalled ? Math.round((totals.called / teamCalled) * 100) : 0,
    dailyGoal: DAILY_GOAL,
    clients: dopieteRows.length,
    earned,
    meetsAhead,
    interestedBreakdown,
    byNiche,
  });
});

// "2026-08-20T10:00:00.000Z" (called_at) albo "2026-08-20 10:00:00" (UTC z datetime('now') przy
// backfillach w db.js) -> ms. null gdy nie da sie odczytac.
function utcMs(ts) {
  if (!ts) return null;
  const s = String(ts);
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(" ", "T")}Z` : s);
  return Number.isNaN(ms) ? null : ms;
}

// GET /api/stats/history - surowe zdarzenia w czasie do statystyk "na przestrzeni lat"
// (statystyki.html: ile dopietych przy N-tym callu, miesiace/lata). Liczy front - zdarzen jest
// malo (jeden call na leada), a tak pytanie "ile przy X callach" odpowiada od reki, bez requestu.
// Call = ta sama definicja co "zadzwonione" na dashboardzie (called_at + STATS_ELIGIBLE_SQL),
// plus dopieci klienci - ci dostaja potem jakosc "6" (maja strone) i inaczej znikneliby z wlasnej
// historii. Osoba = wpisany "Kto dzwonil" (jak w /caller/:name).
router.get("/history", (req, res) => {
  const callers = getCallers();
  const idx = new Map(callers.map((c, i) => [c.display_name, i]));
  const who = (caller) => (idx.has(caller) ? idx.get(caller) : -1);

  const calls = db
    .prepare(
      `SELECT caller, called_at, answered FROM leads
       WHERE called_at IS NOT NULL AND (${STATS_ELIGIBLE_SQL} OR interested = 'dopiete')`
    )
    .all()
    .map((r) => [utcMs(r.called_at), who(r.caller), r.answered === "Tak" ? 1 : 0])
    .filter((e) => e[0] != null)
    .sort((a, b) => a[0] - b[0]);

  const deals = db
    .prepare("SELECT caller, dopiete_at FROM leads WHERE interested = 'dopiete' AND dopiete_at IS NOT NULL")
    .all()
    .map((r) => [utcMs(r.dopiete_at), who(r.caller)])
    .filter((e) => e[0] != null)
    .sort((a, b) => a[0] - b[0]);

  // termin Meeta to lokalny "YYYY-MM-DDTHH:MM" bez strefy - front parsuje go jako czas lokalny
  const meets = db
    .prepare("SELECT caller, google_term FROM leads WHERE google_term <> ''")
    .all()
    .map((r) => [r.google_term, who(r.caller)]);

  res.json({ callers: callers.map((c) => ({ name: c.display_name, color: c.color || "" })), calls, deals, meets });
});

module.exports = router;
