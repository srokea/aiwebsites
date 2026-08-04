const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, INTERESTED_STATS_ORDER, CALLERS, DAILY_GOAL, PRICING } = require("../constants");
const { STATS_ELIGIBLE_SQL } = require("../leadStatus");

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
    .prepare(`SELECT interested, COUNT(*) c FROM leads WHERE ${STATS_ELIGIBLE_SQL} GROUP BY interested`)
    .all();
  const countByValue = new Map(interestedRows.map((r) => [r.interested, r.c]));

  const interestedBreakdown = INTERESTED_STATS_ORDER.map((value) => {
    const opt = INTERESTED_OPTIONS.find((o) => o.value === value);
    return { ...opt, count: countByValue.get(value) || 0 };
  });

  const byCallerRows = db
    .prepare(
      `SELECT caller, COUNT(*) c FROM leads
       WHERE called_at IS NOT NULL AND caller <> '' AND ${STATS_ELIGIBLE_SQL} GROUP BY caller`
    )
    .all();
  const countByCaller = new Map(byCallerRows.map((r) => [r.caller, r.c]));
  const byCaller = CALLERS.map((c) => ({ caller: c, count: countByCaller.get(c) || 0 }));

  // Kazde "Dopiete" to jeden klient: 300 zl jednorazowo za wdrozenie + 100 zl/mies. za opieke.
  // Liczone ze WSZYSTKICH leadow (bez filtra STATS_ELIGIBLE_SQL) - dopiety klient, ktoremu
  // postawilismy strone, dostaje Strona = "Tak" i nie moze przez to zniknac z Kasy.
  const clients = db.prepare("SELECT COUNT(*) c FROM leads WHERE interested = 'dopiete'").get().c;
  const revenue = {
    clients,
    oneTime: clients * PRICING.oneTime,
    mrr: clients * PRICING.monthly,
    annual: clients * PRICING.monthly * 12,
    pricing: PRICING,
  };

  res.json({
    total: totals.total,
    eligible: totals.eligible,
    called: totals.called,
    todo: totals.eligible - totals.called,
    calledToday: totals.calledToday,
    dailyGoal: DAILY_GOAL,
    interestedBreakdown,
    byCaller,
    revenue,
  });
});

module.exports = router;
