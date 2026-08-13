const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS, INTERESTED_STATS_ORDER, CALLERS, DAILY_GOAL, PRICING, EXPENSES } = require("../constants");
const { STATS_ELIGIBLE_SQL, STATS_BREAKDOWN_SQL } = require("../leadStatus");

const router = express.Router();

// Ile pelnych miesiecy minelo od danej daty do teraz (np. dopiecie klienta 13.07 -> pelny
// miesiac dopiero 13.08). Uzywane i do dochodu z klientow, i do kosztow - obie liczby w
// panelu Kasy maja pokazywac "ile juz naprawde", a nie prognoze na caly rok.
function fullMonthsElapsed(fromIso, now = new Date()) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

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
  const dopieteRows = db.prepare("SELECT dopiete_at FROM leads WHERE interested = 'dopiete'").all();
  const clients = dopieteRows.length;
  const now = new Date();

  // Realnie zarobione do dzis: 300 zl jednorazowo za kazdego klienta + 100 zl za kazdy PELNY
  // miesiac abonamentu, ktory juz minal od jego dopiecia (nie prognoza calego roku).
  const earned = dopieteRows.reduce((sum, row) => {
    const months = row.dopiete_at ? fullMonthsElapsed(row.dopiete_at, now) : 0;
    return sum + PRICING.oneTime + PRICING.monthly * months;
  }, 0);

  // Koszty pobrane do dzis: subskrypcja placona z gory, wiec pierwsza oplata liczy sie od razu
  // w dniu "from", a kolejne co pelny miesiac odnowienia (patrz EXPENSES w constants.js).
  const expensesSoFar = EXPENSES.reduce((sum, exp) => {
    const until = exp.to && new Date(exp.to) < now ? new Date(exp.to) : now;
    return sum + exp.amount * (fullMonthsElapsed(exp.from, until) + 1);
  }, 0);

  const revenue = {
    clients,
    oneTime: clients * PRICING.oneTime,
    mrr: clients * PRICING.monthly,
    earned,
    expensesSoFar,
    net: earned - expensesSoFar,
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
