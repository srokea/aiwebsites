// #6 - jedna sekcja finansowa. Zrodlo prawdy dla realnych liczb (Bilans / Przychod / Koszty)
// to tabela `transactions`. Zasilaja ja:
//   - reczne wpisy (source_key NULL)                       -> dodawane przez uzytkownika
//   - auto-koszty subskrypcji (EXPENSES w constants.js)    -> bez potwierdzania, source_key 'sub:...'
//   - potwierdzone naleznosci klientow (client_dues)       -> po kliknieciu "Potwierdz", source_key 'due:<id>'
//
// financeSync() jest idempotentne (INSERT OR IGNORE + UNIQUE) - wolamy je przy kazdym
// odczycie kasy/statystyk, zeby panel byl swiezy bez cronjoba.

const db = require("./db");
const { PRICING, EXPENSES } = require("./constants");
const { localDate } = require("./time");

const pad = (n) => String(n).padStart(2, "0");
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const addMonths = (d, k) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + k);
  return x;
};

// Ile PELNYCH miesiecy minelo od danej daty do teraz (np. dopiecie 13.07 -> pelny miesiac
// dopiero 13.08). Wspolne dla naleznosci klientow i kosztow subskrypcji.
function fullMonthsElapsed(fromIso, now = new Date()) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

// Auto-posty kosztow subskrypcji - pierwsza oplata w dniu "from", potem co pelny miesiac.
function syncSubscriptions() {
  const now = new Date();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions (occurred_on, description, amount_grosze, category, source_key, created_by)
     VALUES (@occurred_on, @description, @amount_grosze, 'wydatek', @source_key, 'auto')`
  );
  for (const exp of EXPENSES) {
    const from = new Date(exp.from);
    if (Number.isNaN(from.getTime())) continue;
    const end = exp.to && new Date(exp.to) < now ? new Date(exp.to) : now;
    const months = fullMonthsElapsed(exp.from, end) + 1;
    for (let k = 0; k < months; k++) {
      const when = addMonths(from, k);
      insert.run({
        occurred_on: localDate(when),
        description: `Subskrypcja — ${exp.name}`,
        amount_grosze: Math.round(exp.amount * 100),
        source_key: `sub:${exp.name}:${ym(when)}`,
      });
    }
  }
}

// Generuje naleznosci (do potwierdzenia) dla kazdego dopietego klienta: jedno 'onetime'
// wdrozenie + 'monthly' za kazdy pelny miesiac od dopiete_at.
function syncClientDues() {
  const clients = db
    .prepare("SELECT id, dopiete_at FROM leads WHERE interested = 'dopiete' AND dopiete_at IS NOT NULL")
    .all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO client_dues (lead_id, kind, period, amount_grosze)
     VALUES (@lead_id, @kind, @period, @amount_grosze)`
  );
  const now = new Date();
  for (const c of clients) {
    const start = new Date(c.dopiete_at);
    if (Number.isNaN(start.getTime())) continue;
    insert.run({ lead_id: c.id, kind: "onetime", period: ym(start), amount_grosze: PRICING.oneTime * 100 });
    const months = fullMonthsElapsed(c.dopiete_at, now);
    for (let k = 1; k <= months; k++) {
      insert.run({ lead_id: c.id, kind: "monthly", period: ym(addMonths(start, k)), amount_grosze: PRICING.monthly * 100 });
    }
  }
}

function financeSync() {
  db.transaction(() => {
    syncSubscriptions();
    syncClientDues();
  })();
}

// Realne sumy z historii + kontekst (liczba klientow, potencjalny MRR, ile naleznosci czeka).
function summary() {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN category='przychod' THEN amount_grosze END),0) income,
         COALESCE(SUM(CASE WHEN category='wydatek'  THEN amount_grosze END),0) expense
       FROM transactions`
    )
    .get();
  const pendingDues = db.prepare("SELECT COUNT(*) c FROM client_dues WHERE status = 'pending'").get().c;
  const clients = db.prepare("SELECT COUNT(*) c FROM leads WHERE interested = 'dopiete'").get().c;
  return {
    income: row.income / 100,
    expense: row.expense / 100,
    balance: (row.income - row.expense) / 100,
    pendingDues,
    clients,
    mrr: clients * PRICING.monthly,
  };
}

const KIND_LABEL = { onetime: "Wdrożenie", monthly: "Abonament" };

function pendingDuesList() {
  return db
    .prepare(
      `SELECT d.id, d.lead_id, d.kind, d.period, d.amount_grosze, leads.company_name
       FROM client_dues d JOIN leads ON leads.id = d.lead_id
       WHERE d.status = 'pending'
       ORDER BY d.period ASC, leads.company_name ASC`
    )
    .all()
    .map((d) => ({
      id: d.id,
      lead_id: d.lead_id,
      kind: d.kind,
      period: d.period,
      amount: d.amount_grosze / 100,
      company: d.company_name,
      label: KIND_LABEL[d.kind] || d.kind,
    }));
}

// Potwierdzenie naleznosci -> wpis w transactions (przychod) + link. Zwraca { error, status } albo { ok }.
function confirmDue(id, by) {
  const due = db.prepare("SELECT * FROM client_dues WHERE id = ?").get(id);
  if (!due) return { error: "Nie znaleziono należności", status: 404 };
  if (due.status !== "pending") return { error: "Ta należność jest już rozliczona", status: 400 };

  const lead = db.prepare("SELECT company_name FROM leads WHERE id = ?").get(due.lead_id);
  const label = due.kind === "onetime" ? "Wdrożenie" : `Abonament ${due.period}`;

  db.transaction(() => {
    const txId = db
      .prepare(
        `INSERT INTO transactions (occurred_on, description, amount_grosze, category, source_key, created_by)
         VALUES (?, ?, ?, 'przychod', ?, ?)`
      )
      .run(`${due.period}-01`, `${label} — ${lead ? lead.company_name : "klient"}`, due.amount_grosze, `due:${due.id}`, by || "")
      .lastInsertRowid;
    db.prepare(
      "UPDATE client_dues SET status='confirmed', transaction_id=?, resolved_at=datetime('now'), resolved_by=? WHERE id=?"
    ).run(txId, by || "", id);
  })();
  return { ok: true };
}

// "Pomin" - klient nie zaplacil za ten miesiac / zrezygnowal. Nie wraca na liste.
function skipDue(id, by) {
  const info = db
    .prepare(
      "UPDATE client_dues SET status='skipped', resolved_at=datetime('now'), resolved_by=? WHERE id=? AND status='pending'"
    )
    .run(by || "", id);
  if (!info.changes) return { error: "Nie znaleziono należności do pominięcia", status: 404 };
  return { ok: true };
}

module.exports = {
  financeSync,
  summary,
  pendingDuesList,
  confirmDue,
  skipDue,
  fullMonthsElapsed,
};
