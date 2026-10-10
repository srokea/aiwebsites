// Modul "Klienci i umowy" (klienci.html / klient.html / rachunek.html): stan umow (aktualna,
// aktywna, licznik dni do konca), numeracja i tresc rachunkow, terminy platnosci, migawka danych
// stron oraz oplacanie rachunku - spiete z Kasa (finance.js), zeby "Oplacony" tutaj i "Potwierdz"
// w Kasie byly jedna operacja, a cena z podpisanej umowy byla cena klienta w Kasie.

const db = require("./db");
const { localDate } = require("./time");
const { slownie } = require("./slownie");
const { BILL_PAYMENT_DAYS, BUYOUT_DEFAULT, BILL_KIND_OPTIONS, CONTRACT_DAYS_THRESHOLDS } = require("./constants");
const { financeSync, confirmDue, reopenDue, splitEven } = require("./finance");

const pad = (n) => String(n).padStart(2, "0");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];
const BILL_KINDS = BILL_KIND_OPTIONS.map((o) => o.value);
const ENDED_STATUSES = ["zakonczona", "wypowiedziana"];

// ---------- daty ----------

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 86400000);
}

// Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera) - od niej zaleza swieta ruchome
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Ustawowe dni wolne w Polsce (Wigilia od 2025)
function polishHolidays(year) {
  const fixed = ["01-01", "01-06", "05-01", "05-03", "08-15", "11-01", "11-11", "12-25", "12-26"];
  if (year >= 2025) fixed.push("12-24");
  const days = new Set(fixed.map((md) => `${year}-${md}`));
  const easter = easterSunday(year);
  for (const offset of [0, 1, 49, 60]) {
    // Wielkanoc, Poniedzialek Wielkanocny, Zeslanie Ducha Sw., Boze Cialo
    const d = new Date(easter);
    d.setDate(d.getDate() + offset);
    days.add(localDate(d));
  }
  return days;
}

function isBusinessDay(iso) {
  const d = parseIso(iso);
  const wd = d.getDay();
  return wd !== 0 && wd !== 6 && !polishHolidays(d.getFullYear()).has(iso);
}

// "2026-10" -> "2026-10-30" (31.10.2026 to sobota)
function lastBusinessDay(period) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m, 0);
  while (!isBusinessDay(localDate(d))) d.setDate(d.getDate() - 1);
  return localDate(d);
}

// §2 umowy: wykonanie i wykup - 7 dni od wystawienia; abonament - do ostatniego dnia roboczego
// miesiaca, za ktory jest (rachunek wystawiony juz po tym dniu -> tez 7 dni od wystawienia)
function dueDate(kind, issuedOn, period) {
  if (kind === "abonament") {
    const last = lastBusinessDay(period);
    if (last >= issuedOn) return last;
  }
  return addDays(issuedOn, BILL_PAYMENT_DAYS);
}

function periodLabel(period) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

const fmtDate = (iso) => (ISO_DATE.test(iso || "") ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

// ---------- zwolnienie z PIT/ZUS (klauzula na rachunku) ----------

// PESEL -> data 26. urodzin ("YYYY-MM-DD") albo null, gdy PESEL niepelny. Miesiac w PESEL-u ma
// doliczone stulecie: +80 (1800-1899), +0 (1900-), +20 (2000-), +40 (2100-), +60 (2200-).
function turns26On(pesel) {
  const p = String(pesel || "").replace(/\D/g, "");
  if (p.length !== 11) return null;
  const yy = Number(p.slice(0, 2));
  const mmRaw = Number(p.slice(2, 4));
  const dd = Number(p.slice(4, 6));
  const century = [
    [80, 1800],
    [0, 1900],
    [20, 2000],
    [40, 2100],
    [60, 2200],
  ].find(([off]) => mmRaw - off >= 1 && mmRaw - off <= 12);
  if (!century || dd < 1 || dd > 31) return null;
  return `${century[1] + yy + 26}-${pad(mmRaw - century[0])}-${pad(dd)}`;
}

// Klauzula "student przed ukonczeniem 26 lat" (art. 21 ust. 1 pkt 148 PIT + art. 6 ust. 4 o SUS) -
// prawdziwa tylko, gdy w dniu wystawienia trwa status studenta I nie minely 26. urodziny.
function exemption(contractor, onDate) {
  const problems = [];
  if (!contractor.student_until) problems.push("brak daty „status studenta do” w Moich danych");
  else if (onDate > contractor.student_until) problems.push(`status studenta minął ${fmtDate(contractor.student_until)}`);
  const b26 = turns26On(contractor.pesel);
  if (!b26) problems.push("brak poprawnego PESEL-u — nie da się sprawdzić 26. urodzin");
  else if (onDate >= b26) problems.push(`26. urodziny były ${fmtDate(b26)}`);
  return { ok: problems.length === 0, problems };
}

// ---------- umowy: aktualna / aktywna / licznik dni ----------

function isEnded(c, today) {
  return ENDED_STATUSES.includes(c.status) || Boolean(c.ends_on && c.ends_on < today);
}

// aktywna = liczy sie do sumy abonamentow na liscie Klientow
function isActive(c, today) {
  return c.status === "podpisana" && (!c.starts_on || c.starts_on <= today) && (!c.ends_on || c.ends_on >= today);
}

// "aktualna" umowa klienta: najnowsza podpisana i trwajaca, potem najnowsza w toku (szkic /
// wyslana), a gdy wszystko zakonczone - po prostu najnowsza (do pokazania jako "zakonczona")
function pickCurrent(contracts, today) {
  const sorted = [...contracts].sort(
    (a, b) => (b.starts_on || b.signed_on || "").localeCompare(a.starts_on || a.signed_on || "") || b.id - a.id
  );
  return (
    sorted.find((c) => c.status === "podpisana" && !isEnded(c, today)) ||
    sorted.find((c) => !isEnded(c, today)) ||
    sorted[0] ||
    null
  );
}

// licznik na liscie: state ok (> 60 dni) / soon (30-60) / urgent (< 30) / open / ended / none
function countdown(c, today) {
  if (!c) return { state: "none", days: null };
  if (isEnded(c, today)) return { state: "ended", days: null };
  if (!c.ends_on) return { state: "open", days: null };
  const days = daysBetween(today, c.ends_on);
  const { soon, urgent } = CONTRACT_DAYS_THRESHOLDS;
  return { state: days > soon ? "ok" : days >= urgent ? "soon" : "urgent", days };
}

function parseSites(json) {
  try {
    const list = JSON.parse(json || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .map((s) => ({ name: String(s?.name || "").trim(), domain: String(s?.domain || "").trim() }))
      .filter((s) => s.name || s.domain);
  } catch {
    return [];
  }
}

const gr2zl = (g) => (g == null ? null : g / 100);

function serializeContract(c, today = localDate()) {
  return {
    id: c.id,
    client_id: c.client_id,
    number: c.number,
    signed_on: c.signed_on,
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    status: c.status,
    kind: c.kind,
    variant: c.variant,
    onetime: gr2zl(c.onetime_grosze),
    monthly: gr2zl(c.monthly_grosze),
    sites: parseSites(c.sites),
    buyout: gr2zl(c.buyout_grosze ?? BUYOUT_DEFAULT * 100),
    bought_out_on: c.bought_out_on,
    has_pdf: Boolean(c.signed_pdf),
    notes: c.notes,
    active: isActive(c, today),
    ended: isEnded(c, today),
    countdown: countdown(c, today),
  };
}

// Podpowiedz numeru nowej umowy: kolejny "N/RRRR" w danym roku
function suggestContractNumber(year = new Date().getFullYear()) {
  const nums = db.prepare("SELECT number FROM contracts WHERE number LIKE ?").pluck().all(`%/${year}`);
  const max = nums.reduce((m, n) => Math.max(m, parseInt(n, 10) || 0), 0);
  return `${max + 1}/${year}`;
}

// Cena klienta w Kasie = cena z jego najnowszej podpisanej umowy (client_pricing.source_contract_id
// zaznacza, ze to cena z umowy - w Kasie widac wtedy "z umowy N" zamiast edycji). Brak podpisanej
// umowy -> zdejmujemy tylko znacznik, sama cena zostaje jak byla.
function syncLeadPricing(clientId, by = "") {
  const client = db.prepare("SELECT id, lead_id FROM clients WHERE id = ?").get(clientId);
  if (!client || !client.lead_id) return;
  const signed = db
    .prepare(
      `SELECT * FROM contracts WHERE client_id = ? AND status IN ('podpisana', 'zakonczona', 'wypowiedziana')
       ORDER BY COALESCE(NULLIF(starts_on, ''), NULLIF(signed_on, ''), '') DESC, id DESC LIMIT 1`
    )
    .get(clientId);
  if (!signed) {
    db.prepare("UPDATE client_pricing SET source_contract_id = NULL WHERE lead_id = ?").run(client.lead_id);
    return;
  }
  db.prepare(
    `INSERT INTO client_pricing (lead_id, onetime_grosze, monthly_grosze, updated_by, updated_at, source_contract_id)
     VALUES (@lead, @onetime, @monthly, @by, datetime('now'), @contract)
     ON CONFLICT(lead_id) DO UPDATE SET onetime_grosze = excluded.onetime_grosze,
       monthly_grosze = excluded.monthly_grosze, updated_by = excluded.updated_by,
       updated_at = excluded.updated_at, source_contract_id = excluded.source_contract_id`
  ).run({
    lead: client.lead_id,
    onetime: signed.kind === "abonament" ? 0 : signed.onetime_grosze,
    monthly: signed.monthly_grosze,
    by,
    contract: signed.id,
  });
  financeSync(); // przelicza naleznosci czekajace na potwierdzenie wg nowej ceny
}

// ---------- rachunki ----------

function getContractor() {
  return (
    db.prepare("SELECT * FROM contractor WHERE id = 1").get() || {
      full_name: "",
      address: "",
      pesel: "",
      id_card: "",
      bank_account: "",
      phone: "",
      email: "",
      issue_city: "",
      student_until: "",
    }
  );
}

function siteLabel(site) {
  if (site.name && site.domain) return `„${site.name}” (${site.domain})`;
  return site.domain || `„${site.name}”`;
}

const DESCRIBE = {
  wykonanie: (label) =>
    `Zaprojektowanie, wykonanie i uruchomienie strony internetowej ${label} – zgodnie z §2 ust. 1 umowy`,
  abonament: (label, period) =>
    `Abonament – utrzymanie strony internetowej ${label} za ${periodLabel(period)} – zgodnie z §2 ust. 2 umowy`,
  wykup: (label) =>
    `Wykup strony internetowej ${label} – przeniesienie autorskich praw majątkowych zgodnie z §5 ust. 2 umowy`,
};

// Pozycje wyliczone z umowy: osobna pozycja na kazda strone, kwota z umowy dzielona rowno
// (Atelier: abonament 200 zl za 2 strony -> 2 x 100 zl). null, gdy w umowie brakuje kwoty.
function defaultItems(kind, contract, client, period) {
  const total =
    kind === "wykonanie"
      ? contract.onetime_grosze
      : kind === "abonament"
        ? contract.monthly_grosze
        : (contract.buyout_grosze ?? BUYOUT_DEFAULT * 100);
  if (total == null) return null;
  const sites = parseSites(contract.sites);
  const list = sites.length ? sites : [{ name: client.name || client.legal_name, domain: "" }];
  const amounts = splitEven(total, list.length);
  return list.map((s, i) => ({ description: DESCRIBE[kind](siteLabel(s), period), amount_grosze: amounts[i] }));
}

// pozycje poprawione recznie w podgladzie: [{description, amount}] (amount w zl, "100,50" tez)
function parseItems(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: "Rachunek musi mieć co najmniej jedną pozycję" };
  const items = [];
  for (const it of raw) {
    const description = String(it?.description || "").trim();
    const n = parseFloat(String(it?.amount ?? "").replace(",", ".").replace(/\s/g, ""));
    if (!description) return { error: "Każda pozycja musi mieć opis" };
    if (!Number.isFinite(n) || n <= 0) return { error: `Nieprawidłowa kwota pozycji: „${it?.amount ?? ""}”` };
    items.push({ description, amount_grosze: Math.round(n * 100) });
  }
  return { items };
}

// Projekt rachunku (do podgladu i do zapisu - ta sama funkcja, wiec podglad = to, co sie zapisze).
// errors blokuja wystawienie (rachunek z pustym PESEL-em/NIP-em zostalby taki na zawsze, bo
// dane sa zamrazane w migawce); warnings tylko ostrzegaja.
function draftBill(contractId, { kind, period, issued_on, items } = {}) {
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId);
  if (!contract) return { status: 404, error: "Nie znaleziono umowy" };
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(contract.client_id);

  if (!BILL_KINDS.includes(kind)) return { status: 400, error: `Nieprawidłowy typ rachunku: „${kind}”` };
  if (kind === "wykonanie" && contract.kind === "abonament") {
    return { status: 400, error: "Ta umowa jest „tylko abonament” — nie ma opłaty za wykonanie" };
  }
  const issuedOn = issued_on ? String(issued_on) : localDate();
  if (!ISO_DATE.test(issuedOn)) return { status: 400, error: `Nieprawidłowa data wystawienia: „${issuedOn}”` };
  const billPeriod = kind === "abonament" ? String(period || "") : "";
  if (kind === "abonament" && !PERIOD.test(billPeriod)) return { status: 400, error: "Wybierz miesiąc abonamentu" };

  const existing = db
    .prepare("SELECT number FROM bills WHERE contract_id = ? AND kind = ? AND period = ?")
    .get(contract.id, kind, billPeriod);
  if (existing) {
    const what = kind === "abonament" ? `abonament za ${periodLabel(billPeriod)}` : kind;
    return { status: 400, error: `Rachunek za ${what} do tej umowy już jest (nr ${existing.number})` };
  }

  let billItems;
  if (items) {
    const parsed = parseItems(items);
    if (parsed.error) return { status: 400, error: parsed.error };
    billItems = parsed.items;
  } else {
    billItems = defaultItems(kind, contract, client, billPeriod);
    if (!billItems) {
      const field = kind === "wykonanie" ? "opłaty jednorazowej" : kind === "abonament" ? "abonamentu" : "kwoty wykupu";
      return { status: 400, error: `W umowie ${contract.number} brakuje ${field} — uzupełnij umowę` };
    }
  }
  const total = billItems.reduce((s, it) => s + it.amount_grosze, 0);

  const contractor = getContractor();
  const errors = [];
  const missing = (label, value) => {
    if (!String(value || "").trim()) errors.push(label);
  };
  missing("Moje dane: imię i nazwisko", contractor.full_name);
  missing("Moje dane: adres", contractor.address);
  missing("Moje dane: PESEL", contractor.pesel);
  missing("Moje dane: nr konta", contractor.bank_account);
  missing("Moje dane: miejscowość wystawiania", contractor.issue_city);
  missing("Klient: firma (jak na fakturach)", client.legal_name);
  missing("Klient: adres siedziby", client.address);
  missing("Klient: NIP", client.nip);
  missing(`Umowa ${contract.number}: data zawarcia`, contract.signed_on);

  const ex = exemption(contractor, issuedOn);
  const warnings = ex.ok ? [] : [`Klauzula o zwolnieniu z PIT/ZUS nie trafi na rachunek: ${ex.problems.join("; ")}.`];

  const year = Number(issuedOn.slice(0, 4));
  const last = db.prepare("SELECT number, issued_on FROM bills WHERE year = ? ORDER BY seq DESC LIMIT 1").get(year);
  if (last && last.issued_on > issuedOn) {
    warnings.push(`Ostatni rachunek w ${year} (nr ${last.number}) ma późniejszą datę — numeracja rozjedzie się z datami.`);
  }
  const seq = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 FROM bills WHERE year = ?").pluck().get(year);

  return {
    errors,
    warnings,
    bill: {
      contract_id: contract.id,
      number: `${seq}/${issuedOn.slice(5, 7)}/${year}`,
      year,
      seq,
      issued_on: issuedOn,
      kind,
      period: billPeriod,
      items: billItems,
      total_grosze: total,
      due_on: dueDate(kind, issuedOn, billPeriod),
      snapshot: {
        contractor: {
          full_name: contractor.full_name,
          address: contractor.address,
          pesel: contractor.pesel,
          bank_account: contractor.bank_account,
          issue_city: contractor.issue_city,
        },
        client: {
          legal_name: client.legal_name || client.name,
          address: client.address,
          nip: client.nip,
        },
        contract: { number: contract.number, signed_on: contract.signed_on },
        clause: ex.ok,
      },
    },
  };
}

function createBill(contractId, body, by) {
  let result;
  db.transaction(() => {
    result = draftBill(contractId, body);
    if (result.error) return;
    if (result.errors.length) {
      result = { status: 400, error: `Uzupełnij przed wystawieniem: ${result.errors.join(", ")}` };
      return;
    }
    const b = result.bill;
    const id = db
      .prepare(
        `INSERT INTO bills (contract_id, number, year, seq, issued_on, kind, period, items, total_grosze, due_on, snapshot, created_by)
         VALUES (@contract_id, @number, @year, @seq, @issued_on, @kind, @period, @items, @total_grosze, @due_on, @snapshot, @by)`
      )
      .run({ ...b, items: JSON.stringify(b.items), snapshot: JSON.stringify(b.snapshot), by: by || "" }).lastInsertRowid;
    result = { id };
  })();
  return result;
}

function serializeBill(row, today = localDate()) {
  const maxSeq = db.prepare("SELECT MAX(seq) FROM bills WHERE year = ?").pluck().get(row.year);
  return {
    id: row.id,
    contract_id: row.contract_id,
    number: row.number,
    issued_on: row.issued_on,
    kind: row.kind,
    period: row.period,
    period_label: row.period ? periodLabel(row.period) : "",
    items: JSON.parse(row.items || "[]").map((it) => ({ ...it, amount: it.amount_grosze / 100 })),
    total: row.total_grosze / 100,
    total_grosze: row.total_grosze,
    words: slownie(row.total_grosze),
    due_on: row.due_on,
    status: row.status,
    paid_on: row.paid_on,
    overdue: row.status === "wystawiony" && row.due_on < today,
    // usunac mozna tylko ostatni nieoplacony rachunek w roku - inaczej dziura w numeracji
    deletable: row.status === "wystawiony" && row.seq === maxSeq,
    snapshot: JSON.parse(row.snapshot || "{}"),
  };
}

// "Oplacony": klient podpiety pod leada, ktorego naleznosci prowadzi Kasa -> ta sama naleznosc
// (wdrozenie / abonament za miesiac) zostaje potwierdzona (confirmDue). Wykup i klienci bez leada
// -> osobny wpis przychodu 'bill:<id>' (w podziale per osoba liczony jako wspolny, 50/50).
function markBillPaid(billId, paidOn, by) {
  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
  if (!bill) return { status: 404, error: "Nie znaleziono rachunku" };
  if (bill.status !== "wystawiony") return { status: 400, error: "Ten rachunek jest już opłacony" };
  const paid = paidOn || localDate();
  if (!ISO_DATE.test(paid)) return { status: 400, error: `Nieprawidłowa data: „${paid}”` };

  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(bill.contract_id);
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(contract.client_id);
  const lead = client.lead_id
    ? db.prepare("SELECT id, interested, dopiete_at FROM leads WHERE id = ?").get(client.lead_id)
    : null;
  const kasaManaged = lead && lead.interested === "dopiete" && lead.dopiete_at && bill.kind !== "wykup";

  let result = { ok: true };
  db.transaction(() => {
    if (kasaManaged) {
      const dueKind = bill.kind === "wykonanie" ? "onetime" : "monthly";
      let due =
        dueKind === "onetime"
          ? db.prepare("SELECT * FROM client_dues WHERE lead_id = ? AND kind = 'onetime' ORDER BY id LIMIT 1").get(lead.id)
          : db.prepare("SELECT * FROM client_dues WHERE lead_id = ? AND kind = 'monthly' AND period = ?").get(lead.id, bill.period);
      if (!due) {
        const period = dueKind === "onetime" ? lead.dopiete_at.slice(0, 7) : bill.period;
        const id = db
          .prepare("INSERT INTO client_dues (lead_id, kind, period, amount_grosze) VALUES (?, ?, ?, ?)")
          .run(lead.id, dueKind, period, bill.total_grosze).lastInsertRowid;
        due = db.prepare("SELECT * FROM client_dues WHERE id = ?").get(id);
      }
      if (due.status === "confirmed") {
        // juz potwierdzone wczesniej w Kasie - tylko podpinamy rachunek pod ten wpis
        db.prepare("UPDATE bills SET status = 'oplacony', paid_on = ?, transaction_id = ? WHERE id = ?").run(
          paid,
          due.transaction_id,
          bill.id
        );
      } else {
        // kwota z rachunku jest prawda (mogla byc poprawiona w podgladzie); "pominieta" tez wraca
        db.prepare("UPDATE client_dues SET status = 'pending', amount_grosze = ? WHERE id = ?").run(bill.total_grosze, due.id);
        const r = confirmDue(due.id, by, { billId: bill.id, paidOn: paid });
        if (r.error) throw Object.assign(new Error(r.error), { status: r.status });
      }
    } else {
      const txId = db
        .prepare(
          `INSERT INTO transactions (occurred_on, description, amount_grosze, category, source_key, created_by)
           VALUES (?, ?, ?, 'przychod', ?, ?)`
        )
        .run(paid, `Rachunek ${bill.number} — ${client.name || client.legal_name}`, bill.total_grosze, `bill:${bill.id}`, by || "")
        .lastInsertRowid;
      db.prepare("UPDATE bills SET status = 'oplacony', paid_on = ?, transaction_id = ? WHERE id = ?").run(paid, txId, bill.id);
    }
    if (bill.kind === "wykup") {
      db.prepare("UPDATE contracts SET bought_out_on = ?, updated_at = datetime('now') WHERE id = ? AND bought_out_on = ''").run(
        paid,
        contract.id
      );
    }
  })();
  return result;
}

// "Cofnij oplacony" - wpis przychodu znika z Kasy (naleznosc wraca do potwierdzenia)
function unmarkBillPaid(billId) {
  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
  if (!bill) return { status: 404, error: "Nie znaleziono rachunku" };
  if (bill.status !== "oplacony") return { status: 400, error: "Ten rachunek nie jest oznaczony jako opłacony" };
  const tx = bill.transaction_id ? db.prepare("SELECT * FROM transactions WHERE id = ?").get(bill.transaction_id) : null;

  db.transaction(() => {
    if (tx && tx.source_key === `bill:${bill.id}`) db.prepare("DELETE FROM transactions WHERE id = ?").run(tx.id);
    else if (tx && String(tx.source_key || "").startsWith("due:")) reopenDue(Number(tx.source_key.slice(4)));
    db.prepare("UPDATE bills SET status = 'wystawiony', paid_on = '', transaction_id = NULL WHERE id = ?").run(bill.id);
    if (bill.kind === "wykup") {
      db.prepare("UPDATE contracts SET bought_out_on = '' WHERE id = ? AND bought_out_on = ?").run(bill.contract_id, bill.paid_on);
    }
  })();
  return { ok: true };
}

function deleteBill(billId) {
  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
  if (!bill) return { status: 404, error: "Nie znaleziono rachunku" };
  if (!serializeBill(bill).deletable) {
    return {
      status: 400,
      error: "Usunąć można tylko ostatni, nieopłacony rachunek w roku — inaczej powstałaby dziura w numeracji",
    };
  }
  db.prepare("DELETE FROM bills WHERE id = ?").run(billId);
  return { ok: true };
}

// ---------- lista klientow ----------

function clientsOverview() {
  const today = localDate();
  const clients = db.prepare("SELECT * FROM clients ORDER BY name COLLATE NOCASE").all();
  const byClient = new Map();
  for (const c of db.prepare("SELECT * FROM contracts").all()) {
    if (!byClient.has(c.client_id)) byClient.set(c.client_id, []);
    byClient.get(c.client_id).push(c);
  }

  let monthlySum = 0;
  let activeCount = 0;
  for (const list of byClient.values()) {
    for (const c of list) {
      if (!isActive(c, today)) continue;
      activeCount += 1;
      monthlySum += c.monthly_grosze || 0;
    }
  }

  // kolejnosc: najblizszy koniec umowy na gorze (z kim rozmawiac o przedluzeniu), potem bez daty
  // konca, bez umowy, a zakonczone na samym dole
  const RANK = { urgent: 0, soon: 0, ok: 0, open: 1, none: 2, ended: 3 };
  const rows = clients
    .map((cl) => {
      const cur = pickCurrent(byClient.get(cl.id) || [], today);
      return {
        id: cl.id,
        name: cl.name || cl.legal_name,
        city: cl.city,
        niche: cl.niche,
        lead_id: cl.lead_id,
        contract: cur ? serializeContract(cur, today) : null,
        countdown: countdown(cur, today),
      };
    })
    .sort((a, b) => {
      const r = RANK[a.countdown.state] - RANK[b.countdown.state];
      if (r) return r;
      if (a.countdown.days != null && b.countdown.days != null) return a.countdown.days - b.countdown.days;
      return a.name.localeCompare(b.name, "pl");
    });

  const candidates = db
    .prepare(
      `SELECT l.id, l.company_name, l.phone, l.city, n.name AS niche_name
       FROM leads l JOIN niches n ON n.id = l.niche_id
       WHERE l.interested = 'dopiete' AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.lead_id = l.id)
       ORDER BY l.dopiete_at DESC, l.company_name COLLATE NOCASE`
    )
    .all();

  return { clients: rows, monthlySum: monthlySum / 100, activeCount, candidates };
}

function clientCard(id) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!client) return null;
  const today = localDate();
  const lead = client.lead_id
    ? db
        .prepare(
          `SELECT l.id, l.company_name, l.niche_id, n.name AS niche_name FROM leads l JOIN niches n ON n.id = l.niche_id
           WHERE l.id = ?`
        )
        .get(client.lead_id)
    : null;
  const contractRows = db.prepare("SELECT * FROM contracts WHERE client_id = ?").all(id);
  const current = pickCurrent(contractRows, today);
  const contracts = contractRows
    .map((c) => serializeContract(c, today))
    .sort((a, b) => (b.starts_on || b.signed_on || "").localeCompare(a.starts_on || a.signed_on || "") || b.id - a.id);
  const bills = db
    .prepare(
      `SELECT b.* FROM bills b JOIN contracts c ON c.id = b.contract_id
       WHERE c.client_id = ? ORDER BY b.issued_on DESC, b.id DESC`
    )
    .all(id)
    .map((b) => serializeBill(b, today));
  return {
    client,
    lead,
    contracts,
    currentContractId: current ? current.id : null,
    bills,
    suggestedNumber: suggestContractNumber(),
  };
}

module.exports = {
  // czyste funkcje (testy)
  lastBusinessDay,
  dueDate,
  turns26On,
  exemption,
  periodLabel,
  countdown,
  // modul
  CONTRACTOR_FIELDS: ["full_name", "address", "pesel", "id_card", "bank_account", "phone", "email", "issue_city", "student_until"],
  getContractor,
  parseSites,
  serializeContract,
  suggestContractNumber,
  syncLeadPricing,
  draftBill,
  createBill,
  serializeBill,
  markBillPaid,
  unmarkBillPaid,
  deleteBill,
  clientsOverview,
  clientCard,
};
