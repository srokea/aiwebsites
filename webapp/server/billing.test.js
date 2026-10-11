// npm test - rachunki na bazie w pamieci (DB_FILE=":memory:"), prawdziwa baza nietknieta
process.env.DB_FILE = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("./db");
const billing = require("./billing");
const { confirmDue } = require("./finance");

test("ostatni dzien roboczy miesiaca i termin platnosci", () => {
  assert.equal(billing.lastBusinessDay("2026-10"), "2026-10-30"); // 31.10.2026 to sobota
  assert.equal(billing.lastBusinessDay("2026-05"), "2026-05-29"); // 31.05 niedziela
  assert.equal(billing.lastBusinessDay("2025-12"), "2025-12-31");
  assert.equal(billing.lastBusinessDay("2029-05"), "2029-05-30"); // 31.05.2029 = Boze Cialo
  assert.equal(billing.dueDate("abonament", "2026-10-01", "2026-10"), "2026-10-30");
  assert.equal(billing.dueDate("abonament", "2026-11-02", "2026-10"), "2026-11-09"); // wystawiony po terminie
  assert.equal(billing.dueDate("wykonanie", "2026-10-10", ""), "2026-10-17");
  assert.equal(billing.dueDate("wykup", "2026-12-28", ""), "2027-01-04");
});

test("26. urodziny z PESEL-u i klauzula o zwolnieniu", () => {
  assert.equal(billing.turns26On("02271412345"), "2028-07-14");
  assert.equal(billing.turns26On("99010112345"), "2025-01-01");
  assert.equal(billing.turns26On("123"), null);
  const me = { pesel: "02271412345", student_until: "2027-09-30" };
  assert.equal(billing.exemption(me, "2026-10-10").ok, true);
  assert.equal(billing.exemption(me, "2027-10-01").ok, false); // po statusie studenta
  assert.equal(billing.exemption({ ...me, student_until: "2030-01-01" }, "2028-07-14").ok, false); // 26 lat
  assert.equal(billing.exemption({ ...me, student_until: "" }, "2026-10-10").ok, false);
});

test("licznik dni do konca umowy", () => {
  const c = (ends_on, status = "podpisana") => ({ status, ends_on });
  assert.deepEqual(billing.countdown(c("2027-01-01"), "2026-10-10"), { state: "ok", days: 83 });
  assert.equal(billing.countdown(c("2026-11-20"), "2026-10-10").state, "soon"); // 41 dni
  assert.equal(billing.countdown(c("2026-11-09"), "2026-10-10").state, "soon"); // 30 dni
  assert.equal(billing.countdown(c("2026-11-08"), "2026-10-10").state, "urgent"); // 29 dni
  assert.equal(billing.countdown(c(""), "2026-10-10").state, "open");
  assert.equal(billing.countdown(c("2026-10-09"), "2026-10-10").state, "ended");
  assert.equal(billing.countdown(c("2027-01-01", "wypowiedziana"), "2026-10-10").state, "ended");
  assert.equal(billing.countdown(null, "2026-10-10").state, "none");
});

// wspolne dane: lead dopiety we wrzesniu, klient z umowa na 2 strony (jak Atelier)
function seed() {
  db.exec(`
    INSERT INTO contractor (id, full_name, address, pesel, bank_account, issue_city, student_until)
      VALUES (1, 'Jan Testowy', 'ul. Testowa 1, 00-001 Test', '02271412345', '00 1111 2222 3333 4444 5555 6666', 'Piotrków Trybunalski', '2027-09-30');
    INSERT INTO niches (id, name, slug) VALUES (1, 'Test', 'test');
    INSERT INTO leads (id, niche_id, company_name, interested, dopiete_at) VALUES (1, 1, 'Atelier Test', 'dopiete', '2026-09-15 10:00:00');
    INSERT INTO clients (id, lead_id, name, legal_name, address, nip) VALUES (1, 1, 'Atelier', 'Atelier Test Jan Testowy', 'ul. Klienta 2', '1234567890');
    INSERT INTO contracts (id, client_id, number, signed_on, starts_on, ends_on, status, onetime_grosze, monthly_grosze, sites)
      VALUES (1, 1, '1/2026', '2026-09-15', '2026-09-15', '2027-09-14', 'podpisana', 30000, 20000,
              '[{"name":"Atelier","domain":"atelier.pl"},{"name":"Ogrody","domain":"ogrody.pl"}]');
  `);
}

test("rachunek za abonament: 2 pozycje, numer, migawka, oplacenie spiete z Kasa", () => {
  seed();
  billing.syncPricing();
  const pricing = db.prepare("SELECT * FROM client_pricing WHERE lead_id = 1").get();
  assert.equal(pricing.monthly_grosze, 20000);
  assert.equal(pricing.source_contract_id, 1);

  const draft = billing.draftBill(1, { kind: "abonament", period: "2026-10", issued_on: "2026-10-10" });
  assert.deepEqual(draft.errors, []);
  assert.deepEqual(draft.warnings, []);
  assert.equal(draft.bill.number, "1/10/2026");
  assert.equal(draft.bill.due_on, "2026-10-30");
  assert.equal(draft.bill.items.length, 2);
  assert.equal(draft.bill.items[0].amount_grosze, 10000);
  assert.match(draft.bill.items[1].description, /„Ogrody” \(ogrody\.pl\) za październik 2026 – zgodnie z §2 ust\. 2 umowy/);
  assert.equal(draft.bill.snapshot.clause, true);

  const { id } = billing.createBill(1, { kind: "abonament", period: "2026-10", issued_on: "2026-10-10" }, "test");
  assert.equal(billing.createBill(1, { kind: "abonament", period: "2026-10" }).status, 400); // drugi raz ten sam miesiac

  // zmiana danych klienta po wystawieniu nie zmienia rachunku
  db.prepare("UPDATE clients SET legal_name = 'Inna Nazwa' WHERE id = 1").run();
  const stored = billing.serializeBill(db.prepare("SELECT * FROM bills WHERE id = ?").get(id));
  assert.equal(stored.snapshot.client.legal_name, "Atelier Test Jan Testowy");
  assert.equal(stored.words, "dwieście złotych 00/100");

  assert.deepEqual(billing.markBillPaid(id, "2026-10-20", "test"), { ok: true });
  const due = db.prepare("SELECT * FROM client_dues WHERE lead_id = 1 AND kind = 'monthly' AND period = '2026-10'").get();
  assert.equal(due.status, "confirmed");
  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  assert.equal(bill.status, "oplacony");
  assert.equal(bill.transaction_id, due.transaction_id);

  // cofniecie: wpis znika z Kasy, naleznosc wraca do potwierdzenia
  assert.deepEqual(billing.unmarkBillPaid(id), { ok: true });
  assert.equal(db.prepare("SELECT status FROM client_dues WHERE id = ?").pluck().get(due.id), "pending");
  assert.equal(db.prepare("SELECT COUNT(*) FROM transactions WHERE source_key = ?").pluck().get(`due:${due.id}`), 0);
});

test("Potwierdz w Kasie oznacza rachunek jako oplacony; wykup to osobny wpis 'bill:'", () => {
  const wyk = billing.createBill(1, { kind: "wykonanie", issued_on: "2026-10-11" }, "test");
  assert.equal(db.prepare("SELECT number FROM bills WHERE id = ?").pluck().get(wyk.id), "2/10/2026");
  const onetime = db.prepare("SELECT * FROM client_dues WHERE lead_id = 1 AND kind = 'onetime'").get();
  assert.equal(onetime.amount_grosze, 30000);
  confirmDue(onetime.id, "test");
  assert.equal(db.prepare("SELECT status FROM bills WHERE id = ?").pluck().get(wyk.id), "oplacony");

  const buy = billing.createBill(1, { kind: "wykup", issued_on: "2026-10-12" }, "test");
  billing.markBillPaid(buy.id, "2026-10-13", "test");
  const tx = db.prepare("SELECT * FROM transactions WHERE source_key = ?").get(`bill:${buy.id}`);
  assert.equal(tx.amount_grosze, 200000);
  assert.equal(db.prepare("SELECT bought_out_on FROM contracts WHERE id = 1").pluck().get(), "2026-10-13");
});

test("usunac mozna tylko ostatni nieoplacony rachunek w roku", () => {
  const last = db.prepare("SELECT id FROM bills ORDER BY seq DESC LIMIT 1").pluck().get(); // wykup - oplacony
  assert.equal(billing.deleteBill(last).status, 400);
  const first = db.prepare("SELECT id FROM bills WHERE seq = 1").pluck().get();
  assert.equal(billing.deleteBill(first).status, 400); // nie ostatni
  const nov = billing.createBill(1, { kind: "abonament", period: "2026-11", issued_on: "2026-11-02" }, "test");
  assert.deepEqual(billing.deleteBill(nov.id), { ok: true });
});

test("brak danych blokuje wystawienie", () => {
  db.prepare("UPDATE clients SET nip = '' WHERE id = 1").run();
  const draft = billing.draftBill(1, { kind: "abonament", period: "2026-12", issued_on: "2026-12-01" });
  assert.deepEqual(draft.errors, ["Klient: NIP"]);
  assert.equal(billing.createBill(1, { kind: "abonament", period: "2026-12" }).status, 400);
});

test("strona innego klienta w umowie: Kasa liczy calosc u wlasciciela, u drugiego 0", () => {
  db.exec(`
    INSERT INTO leads (id, niche_id, company_name, interested, dopiete_at) VALUES (2, 1, 'Ogrody Test', 'dopiete', '2026-09-15 10:05:00');
    INSERT INTO clients (id, lead_id, name) VALUES (2, 2, 'Ogrody');
  `);
  db.prepare("UPDATE contracts SET sites = ? WHERE id = 1").run(
    JSON.stringify([{ name: "Atelier", domain: "atelier.pl" }, { name: "Ogrody", domain: "ogrody.pl", client_id: 2 }])
  );
  billing.syncPricing();
  const p1 = db.prepare("SELECT * FROM client_pricing WHERE lead_id = 1").get();
  const p2 = db.prepare("SELECT * FROM client_pricing WHERE lead_id = 2").get();
  assert.equal(p1.monthly_grosze, 20000);
  assert.deepEqual([p2.onetime_grosze, p2.monthly_grosze, p2.source_contract_id], [0, 0, 1]);
  assert.equal(db.prepare("SELECT COUNT(*) FROM client_dues WHERE lead_id = 2 AND status = 'pending'").pluck().get(), 0);
  const card = billing.clientCard(2);
  assert.equal(card.contracts[0].covered_by.client_id, 1);
  assert.equal(card.currentContractId, 1);

  // strona wraca do wlasciciela umowy -> drugi klient znow na cenie domyslnej
  db.prepare("UPDATE contracts SET sites = ? WHERE id = 1").run(JSON.stringify([{ name: "Atelier", domain: "atelier.pl" }]));
  billing.syncPricing();
  const back = db.prepare("SELECT * FROM client_pricing WHERE lead_id = 2").get();
  assert.deepEqual([back.onetime_grosze, back.monthly_grosze, back.source_contract_id], [null, null, null]);
});

test("przypominajki: brakujace miesiace abonamentu, niewyslane i po terminie", () => {
  const todo = billing.billingTodo("2026-12-05");
  const issue = todo.filter((t) => t.type === "issue" && t.contract_id === 1).map((t) => t.period);
  assert.deepEqual(issue.sort(), ["2026-09", "2026-11", "2026-12"]); // pazdziernik wystawiony
  assert.equal(todo.find((t) => t.period === "2026-09").late, true);
  assert.equal(todo.find((t) => t.period === "2026-12").late, false);

  const oct = db.prepare("SELECT id FROM bills WHERE kind = 'abonament' AND period = '2026-10'").pluck().get();
  assert.ok(todo.some((t) => t.type === "send" && t.bill_id === oct));
  assert.deepEqual(billing.setBillSent(oct, "2026-10-12"), { ok: true });
  const after = billing.billingTodo("2026-12-05");
  assert.ok(!after.some((t) => t.type === "send" && t.bill_id === oct));
  assert.ok(after.some((t) => t.type === "overdue" && t.bill_id === oct)); // termin 30.10 minal
  assert.equal(billing.setBillSent(oct, "12.10.2026").status, 400);
});

test("pominieta przypominajka juz nie wraca", () => {
  db.prepare("INSERT INTO bill_skips (contract_id, kind, period) VALUES (1, 'abonament', '2026-09')").run();
  const issue = billing.billingTodo("2026-12-05").filter((t) => t.type === "issue" && t.contract_id === 1).map((t) => t.period);
  assert.deepEqual(issue.sort(), ["2026-11", "2026-12"]);
});
