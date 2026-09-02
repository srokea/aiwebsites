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
const { getCallers } = require("./callers");

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
  // Zmiana ceny subskrypcji w EXPENSES (np. Claude Code 75 -> 99,96) musi poprawic ROWNIEZ
  // juz zaksiegowane miesiace - INSERT OR IGNORE ich nie ruszy (klucz source_key juz jest),
  // wiec dociagamy kwote/opis wszystkich auto-wpisow danej subskrypcji do aktualnej stawki.
  const reprice = db.prepare(
    `UPDATE transactions SET amount_grosze = @amount_grosze, description = @description
     WHERE created_by = 'auto' AND source_key LIKE @like
       AND (amount_grosze <> @amount_grosze OR description <> @description)`
  );
  for (const exp of EXPENSES) {
    const from = new Date(exp.from);
    if (Number.isNaN(from.getTime())) continue;
    const end = exp.to && new Date(exp.to) < now ? new Date(exp.to) : now;
    const months = fullMonthsElapsed(exp.from, end) + 1;
    const amount_grosze = Math.round(exp.amount * 100);
    const description = `Subskrypcja — ${exp.name}`;
    for (let k = 0; k < months; k++) {
      const when = addMonths(from, k);
      insert.run({ occurred_on: localDate(when), description, amount_grosze, source_key: `sub:${exp.name}:${ym(when)}` });
    }
    reprice.run({ amount_grosze, description, like: `sub:${exp.name}:%` });
  }
}

// Generuje naleznosci (do potwierdzenia) dla kazdego dopietego klienta wg umowy:
//   - miesiac domkniecia: 300 zl (wdrozenie) + 100 zl (pierwszy abonament) - placone razem,
//   - kazdy kolejny miesiac kalendarzowy: 100 zl.
// Abonament liczymy po MIESIACACH KALENDARZOWYCH, nie po dniu-rocznicy: klient dopiety
// kiedykolwiek w sierpniu ma 1 wrzesnia gotowa naleznosc za wrzesien (a 1. abonament -
// sierpniowy - stoi razem z wdrozeniem w miesiacu domkniecia).
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
    // k=0 -> miesiac domkniecia (1. abonament, placony razem z wdrozeniem)
    const monthsSince = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    for (let k = 0; k <= monthsSince; k++) {
      const period = ym(new Date(start.getFullYear(), start.getMonth() + k, 1));
      insert.run({ lead_id: c.id, kind: "monthly", period, amount_grosze: PRICING.monthly * 100 });
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

// Rozdziela kwote w groszach rowno na n osob tak, zeby suma czesci == calosc (reszta z
// dzielenia laduje po 1 groszu na pierwsze osoby).
function splitEven(totalGrosze, n) {
  if (n <= 0) return [];
  const base = Math.trunc(totalGrosze / n);
  let rem = totalGrosze - base * n; // znak zgodny z totalGrosze
  const step = rem >= 0 ? 1 : -1;
  return Array.from({ length: n }, (_, i) => {
    if (rem !== 0) {
      rem -= step;
      return base + step;
    }
    return base;
  });
}

// Podzial zysku per osoba wg umowy zespolu:
//   DZIELI SIE 50/50 (a dokladniej rowno na wszystkich callerow):
//     - abonamenty 100 zl/mies. od klientow (potwierdzone),
//     - reczne przychody (nieprzypisane do konkretnej osoby),
//     - wszystkie koszty (subskrypcja Claude, domeny, NFC z Allegro, ...).
//   NIE DZIELI SIE (zostaje u tego, kto domknal klienta):
//     - 300 zl za wdrozenie klienta (potwierdzone, przypisane po leads.caller).
function perPerson() {
  const people = getCallers(); // [{ display_name, color }]
  const n = people.length;

  const onetimeByPerson = new Map(
    db
      .prepare(
        `SELECT l.caller AS caller, COALESCE(SUM(t.amount_grosze), 0) AS g
         FROM client_dues d
         JOIN transactions t ON t.id = d.transaction_id
         JOIN leads l ON l.id = d.lead_id
         WHERE d.kind = 'onetime' AND d.status = 'confirmed'
         GROUP BY l.caller`
      )
      .all()
      .map((r) => [r.caller, r.g])
  );

  const monthlyG = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount_grosze), 0) g
       FROM client_dues d JOIN transactions t ON t.id = d.transaction_id
       WHERE d.kind = 'monthly' AND d.status = 'confirmed'`
    )
    .get().g;

  const manualIncomeG = db
    .prepare("SELECT COALESCE(SUM(amount_grosze), 0) g FROM transactions WHERE category = 'przychod' AND source_key IS NULL")
    .get().g;

  const expenseG = db.prepare("SELECT COALESCE(SUM(amount_grosze), 0) g FROM transactions WHERE category = 'wydatek'").get().g;

  const sharedIncomeG = monthlyG + manualIncomeG;
  const incShares = splitEven(sharedIncomeG, n);
  const costShares = splitEven(expenseG, n);

  // wdrozenia przypisane do callera spoza aktualnej listy (puste / stare dane) - nie dziela sie,
  // pokazujemy osobno, zeby suma osob + to = bilans
  let assignedOnetimeG = 0;
  const rows = people.map((p, i) => {
    const ownOnetimeG = onetimeByPerson.get(p.display_name) || 0;
    assignedOnetimeG += ownOnetimeG;
    const profitG = ownOnetimeG + incShares[i] - costShares[i];
    return {
      person: p.display_name,
      color: p.color || "",
      onetime: ownOnetimeG / 100,
      sharedIncome: incShares[i] / 100,
      sharedExpense: costShares[i] / 100,
      profit: profitG / 100,
    };
  });

  let totalOnetimeG = 0;
  for (const g of onetimeByPerson.values()) totalOnetimeG += g;

  return {
    splitCount: n,
    monthly: monthlyG / 100,
    manualIncome: manualIncomeG / 100,
    sharedIncome: sharedIncomeG / 100,
    sharedExpense: expenseG / 100,
    unassignedOnetime: (totalOnetimeG - assignedOnetimeG) / 100,
    people: rows,
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
  perPerson,
  pendingDuesList,
  confirmDue,
  skipDue,
  fullMonthsElapsed,
};
