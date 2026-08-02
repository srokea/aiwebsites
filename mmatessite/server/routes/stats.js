const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, INTERESTED_STATS_ORDER, CALLERS, DAILY_GOAL, PRICING } = require("../constants");

const router = express.Router();

// GET /api/stats - zbiorcze statystyki na strone glowna
router.get("/", (req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) total,
              COALESCE(SUM(called_at IS NOT NULL), 0) called,
              COALESCE(SUM(called_at IS NOT NULL
                       AND date(called_at, 'localtime') = date('now', 'localtime')), 0) calledToday
       FROM leads`
    )
    .get();

  const interestedRows = db.prepare("SELECT interested, COUNT(*) c FROM leads GROUP BY interested").all();
  const countByValue = new Map(interestedRows.map((r) => [r.interested, r.c]));

  const interestedBreakdown = INTERESTED_STATS_ORDER.map((value) => {
    const opt = INTERESTED_OPTIONS.find((o) => o.value === value);
    return { ...opt, count: countByValue.get(value) || 0 };
  });

  const byCallerRows = db
    .prepare("SELECT caller, COUNT(*) c FROM leads WHERE called_at IS NOT NULL AND caller <> '' GROUP BY caller")
    .all();
  const countByCaller = new Map(byCallerRows.map((r) => [r.caller, r.c]));
  const byCaller = CALLERS.map((c) => ({ caller: c, count: countByCaller.get(c) || 0 }));

  // Kazde "Dopiete" to jeden klient: 300 zl jednorazowo za wdrozenie + 100 zl/mies. za opieke.
  const clients = countByValue.get("dopiete") || 0;
  const revenue = {
    clients,
    oneTime: clients * PRICING.oneTime,
    mrr: clients * PRICING.monthly,
    annual: clients * PRICING.monthly * 12,
    pricing: PRICING,
  };

  res.json({
    total: totals.total,
    called: totals.called,
    todo: totals.total - totals.called,
    calledToday: totals.calledToday,
    dailyGoal: DAILY_GOAL,
    interestedBreakdown,
    byCaller,
    revenue,
  });
});

module.exports = router;
