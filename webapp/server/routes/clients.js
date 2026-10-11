// Modul "Klienci i umowy" - /api/clients/*. Logika rachunkow, terminow i spiecia z Kasa siedzi
// w server/billing.js; tu walidacja wejscia i zapis. Mutacje na karcie klienta zwracaja cala
// karte (jak Kasa zwraca cala paczke), zeby front po prostu przerysowal widok.

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../db");
const billing = require("../billing");
const { slownie } = require("../slownie");
const { billPdf } = require("../billPdf");
const { localDate } = require("../time");
const {
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_KIND_OPTIONS,
  CONTRACT_VARIANT_OPTIONS,
} = require("../constants");

const router = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLIENT_FIELDS = ["name", "legal_name", "owner_name", "address", "nip", "regon", "phone", "email", "city", "niche", "notes"];
const CONTRACTS_DIR = path.join(__dirname, "..", "..", "data", "contracts");

// PDF-y podpisanych umow: TYLKO przez /api (za logowaniem) - w przeciwienstwie do avatarow i logo
// kart NFC nie ma tu zadnego express.static
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

const by = (req) => req.user?.display_name || "";
const fail = (res, r) => res.status(r.status || 400).json({ error: r.error });

// klucz API (Jarvis) widzi klientow, umowy i rachunki, ale bez PESEL-u, nr dowodu i nr konta
function redactBill(req, bill) {
  if (!req.viaApiKey || !bill.snapshot?.contractor) return bill;
  const { pesel, bank_account, ...contractor } = bill.snapshot.contractor;
  return { ...bill, snapshot: { ...bill.snapshot, contractor } };
}

function sendCard(req, res, id) {
  const card = billing.clientCard(id);
  if (!card) return res.status(404).json({ error: "Nie znaleziono klienta" });
  res.json({ ...card, bills: card.bills.map((b) => redactBill(req, b)) });
}

function pickClientFields(body) {
  const out = {};
  for (const f of CLIENT_FIELDS) if (body[f] !== undefined) out[f] = String(body[f] ?? "").trim();
  return out;
}

// "300" / "250,50" -> grosze; puste -> null (= do uzupelnienia); undefined gdy smieci
function toGrosze(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

// Walidacja pol umowy. Zwraca { values } albo { error }. partial = PATCH (tylko podane pola).
function contractValues(body, { partial = false } = {}) {
  const v = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has("number")) {
    const number = String(body.number ?? "").trim();
    if (!number) return { error: "Podaj numer umowy (np. 3/2026)" };
    v.number = number;
  }
  for (const k of ["signed_on", "starts_on", "ends_on"]) {
    if (!has(k)) continue;
    const d = String(body[k] ?? "").trim();
    if (d && !ISO_DATE.test(d)) return { error: `Nieprawidłowa data: „${d}”` };
    v[k] = d;
  }
  if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) return { error: "Data końca jest przed datą początku umowy" };
  const oneOf = (k, options, allowEmpty) => {
    if (!has(k)) return null;
    const val = String(body[k] ?? "");
    if ((allowEmpty && val === "") || options.some((o) => o.value === val)) {
      v[k] = val;
      return null;
    }
    return `Nieprawidłowa wartość „${val}”`;
  };
  const optErr =
    oneOf("status", CONTRACT_STATUS_OPTIONS, false) ||
    oneOf("kind", CONTRACT_KIND_OPTIONS, false) ||
    oneOf("variant", CONTRACT_VARIANT_OPTIONS, true);
  if (optErr) return { error: optErr };
  for (const [k, col] of [
    ["onetime", "onetime_grosze"],
    ["monthly", "monthly_grosze"],
    ["buyout", "buyout_grosze"],
  ]) {
    if (!has(k)) continue;
    const g = toGrosze(body[k]);
    if (g === undefined) return { error: "Kwota musi być liczbą (np. 300 albo 250,50)" };
    v[col] = g;
  }
  if (has("sites")) {
    if (!Array.isArray(body.sites)) return { error: "Nieprawidłowa lista stron" };
    v.sites = JSON.stringify(
      body.sites
        .map((s) => {
          const site = { name: String(s?.name || "").trim(), domain: String(s?.domain || "").trim() };
          // strona innego klienta (rozliczany w tej umowie) - zapisujemy tylko istniejacego klienta
          const clientId = Number(s?.client_id) || null;
          if (clientId && db.prepare("SELECT 1 FROM clients WHERE id = ?").get(clientId)) site.client_id = clientId;
          return site;
        })
        .filter((s) => s.name || s.domain)
    );
  }
  if (has("notes")) v.notes = String(body.notes ?? "").trim();
  return { values: v };
}

// zajety numer umowy - mowimy czyj, bo najczestszy powod to strona, ktora juz jest w umowie
// innego klienta (np. Uslugi Ogrodnicze w umowie Atelier)
function uniqueNumberError(err, number) {
  if (!/UNIQUE constraint failed: contracts\.number/.test(err.message)) return null;
  const owner = db
    .prepare("SELECT cl.name, cl.legal_name FROM contracts c JOIN clients cl ON cl.id = c.client_id WHERE c.number = ?")
    .get(number);
  const who = owner ? ` (${owner.name || owner.legal_name})` : "";
  return `Umowa ${number} już istnieje${who}. Jeśli ta strona jest w tamtej umowie, dodaj ją tam i przy stronie wybierz tego klienta.`;
}

// ---------- lista + Moje dane ----------

// GET /api/clients - lista (z licznikiem dni do konca umowy), suma abonamentow z aktywnych umow
// i dopiete leady, ktore nie maja jeszcze karty klienta
router.get("/", (req, res) => {
  res.json(billing.clientsOverview());
});

router.get("/contractor", (req, res) => {
  const c = billing.getContractor();
  const out = Object.fromEntries(billing.CONTRACTOR_FIELDS.map((f) => [f, c[f] || ""]));
  if (req.viaApiKey) {
    delete out.pesel;
    delete out.id_card;
    delete out.bank_account;
  }
  res.json(out);
});

router.put("/contractor", (req, res) => {
  if (req.viaApiKey) return res.status(403).json({ error: "Moje dane można zmienić tylko po zalogowaniu w przeglądarce" });
  const values = {};
  for (const f of billing.CONTRACTOR_FIELDS) values[f] = String(req.body[f] ?? "").trim();
  if (values.pesel && !/^\d{11}$/.test(values.pesel)) return res.status(400).json({ error: "PESEL musi mieć 11 cyfr" });
  if (values.student_until && !ISO_DATE.test(values.student_until)) {
    return res.status(400).json({ error: "Nieprawidłowa data statusu studenta" });
  }
  const cols = billing.CONTRACTOR_FIELDS;
  db.prepare(
    `INSERT INTO contractor (id, ${cols.join(", ")}, updated_at) VALUES (1, ${cols.map((f) => "@" + f).join(", ")}, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET ${cols.map((f) => `${f} = excluded.${f}`).join(", ")}, updated_at = excluded.updated_at`
  ).run(values);
  res.json(values);
});

// GET /api/clients/lead/:leadId - czy lead ma juz karte klienta (okienko "Dodac do klientow?")
router.get("/lead/:leadId(\\d+)", (req, res) => {
  const client = db.prepare("SELECT id, name FROM clients WHERE lead_id = ?").get(Number(req.params.leadId));
  res.json({ client: client || null });
});

// ---------- klient ----------

router.post("/", (req, res) => {
  const fields = pickClientFields(req.body);
  if (!fields.name && !fields.legal_name) return res.status(400).json({ error: "Podaj nazwę klienta" });
  let leadId = null;
  if (req.body.lead_id != null && req.body.lead_id !== "") {
    leadId = Number(req.body.lead_id);
    if (!db.prepare("SELECT 1 FROM leads WHERE id = ?").get(leadId)) return res.status(404).json({ error: "Nie znaleziono leada" });
    const existing = db.prepare("SELECT id FROM clients WHERE lead_id = ?").get(leadId);
    if (existing) return res.status(409).json({ error: "Ten lead ma już kartę klienta", id: existing.id });
  }
  const cols = Object.keys(fields);
  const id = db
    .prepare(
      `INSERT INTO clients (lead_id${cols.map((c) => ", " + c).join("")}) VALUES (@lead_id${cols.map((c) => ", @" + c).join("")})`
    )
    .run({ lead_id: leadId, ...fields }).lastInsertRowid;
  res.status(201).json({ id });
});

router.get("/:id(\\d+)", (req, res) => sendCard(req, res, Number(req.params.id)));

router.patch("/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const fields = pickClientFields(req.body);
  if (fields.name === "" && !fields.legal_name) {
    const cur = db.prepare("SELECT legal_name FROM clients WHERE id = ?").get(id);
    if (!cur?.legal_name) return res.status(400).json({ error: "Klient musi mieć nazwę" });
  }
  const cols = Object.keys(fields);
  if (cols.length) {
    const info = db
      .prepare(`UPDATE clients SET ${cols.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...fields, id });
    if (!info.changes) return res.status(404).json({ error: "Nie znaleziono klienta" });
  }
  sendCard(req, res, id);
});

router.delete("/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const bills = db
    .prepare("SELECT COUNT(*) FROM bills b JOIN contracts c ON c.id = b.contract_id WHERE c.client_id = ?")
    .pluck()
    .get(id);
  if (bills) return res.status(400).json({ error: "Klient ma wystawione rachunki — nie można go usunąć" });
  const client = db.prepare("SELECT lead_id FROM clients WHERE id = ?").get(id);
  if (!client) return res.status(404).json({ error: "Nie znaleziono klienta" });
  for (const f of db.prepare("SELECT signed_pdf FROM contracts WHERE client_id = ? AND signed_pdf <> ''").pluck().all(id)) {
    fs.rmSync(path.join(CONTRACTS_DIR, f), { force: true });
  }
  db.transaction(() => {
    if (client.lead_id) db.prepare("UPDATE client_pricing SET source_contract_id = NULL WHERE lead_id = ?").run(client.lead_id);
    db.prepare("DELETE FROM clients WHERE id = ?").run(id); // umowy kaskadowo
  })();
  res.json({ ok: true });
});

// ---------- umowy ----------

router.post("/:id(\\d+)/contracts", (req, res) => {
  const clientId = Number(req.params.id);
  if (!db.prepare("SELECT 1 FROM clients WHERE id = ?").get(clientId)) return res.status(404).json({ error: "Nie znaleziono klienta" });
  const r = contractValues(req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  const v = { status: "szkic", kind: "wykonanie_abonament", ...r.values };
  const cols = Object.keys(v);
  try {
    db.prepare(
      `INSERT INTO contracts (client_id, ${cols.join(", ")}) VALUES (@client_id, ${cols.map((c) => "@" + c).join(", ")})`
    ).run({ client_id: clientId, ...v });
  } catch (err) {
    const msg = uniqueNumberError(err, v.number);
    if (msg) return res.status(400).json({ error: msg });
    throw err;
  }
  billing.syncPricing(by(req));
  res.status(201);
  sendCard(req, res, clientId);
});

router.patch("/contracts/:id(\\d+)", (req, res) => {
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: "Nie znaleziono umowy" });
  const r = contractValues(req.body, { partial: true });
  if (r.error) return res.status(400).json({ error: r.error });
  const v = r.values;
  const starts = v.starts_on ?? contract.starts_on;
  const ends = v.ends_on ?? contract.ends_on;
  if (starts && ends && ends < starts) return res.status(400).json({ error: "Data końca jest przed datą początku umowy" });
  const cols = Object.keys(v);
  if (cols.length) {
    try {
      db.prepare(`UPDATE contracts SET ${cols.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({
        ...v,
        id: contract.id,
      });
    } catch (err) {
      const msg = uniqueNumberError(err, v.number);
      if (msg) return res.status(400).json({ error: msg });
      throw err;
    }
  }
  billing.syncPricing(by(req));
  sendCard(req, res, contract.client_id);
});

router.delete("/contracts/:id(\\d+)", (req, res) => {
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: "Nie znaleziono umowy" });
  if (db.prepare("SELECT 1 FROM bills WHERE contract_id = ?").get(contract.id)) {
    return res.status(400).json({ error: "Do tej umowy są wystawione rachunki — nie można jej usunąć (zmień status)" });
  }
  if (contract.signed_pdf) fs.rmSync(path.join(CONTRACTS_DIR, contract.signed_pdf), { force: true });
  db.transaction(() => {
    db.prepare("UPDATE client_pricing SET source_contract_id = NULL WHERE source_contract_id = ?").run(contract.id);
    db.prepare("DELETE FROM contracts WHERE id = ?").run(contract.id);
  })();
  billing.syncPricing(by(req));
  sendCard(req, res, contract.client_id);
});

router.post(
  "/contracts/:id(\\d+)/pdf",
  (req, res, next) => {
    uploadPdf.single("file")(req, res, (err) => {
      if (!err) return next();
      const message = err.code === "LIMIT_FILE_SIZE" ? "Plik za duży (max 15 MB)" : "Nie udało się wgrać pliku";
      res.status(400).json({ error: message });
    });
  },
  (req, res) => {
    const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(Number(req.params.id));
    if (!contract) return res.status(404).json({ error: "Nie znaleziono umowy" });
    if (!req.file) return res.status(400).json({ error: "Wgraj plik PDF (max 15 MB)" });
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
    if (contract.signed_pdf) fs.rmSync(path.join(CONTRACTS_DIR, contract.signed_pdf), { force: true });
    const filename = `${contract.id}-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(CONTRACTS_DIR, filename), req.file.buffer);
    db.prepare("UPDATE contracts SET signed_pdf = ?, updated_at = datetime('now') WHERE id = ?").run(filename, contract.id);
    sendCard(req, res, contract.client_id);
  }
);

router.get("/contracts/:id(\\d+)/pdf", (req, res) => {
  const contract = db.prepare("SELECT number, signed_pdf FROM contracts WHERE id = ?").get(Number(req.params.id));
  const file = contract?.signed_pdf ? path.join(CONTRACTS_DIR, contract.signed_pdf) : null;
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: "Brak pliku umowy" });
  res.set("Content-Disposition", `inline; filename="umowa-${contract.number.replace(/[^\w-]+/g, "-")}.pdf"`);
  res.type("application/pdf").sendFile(file);
});

router.delete("/contracts/:id(\\d+)/pdf", (req, res) => {
  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(Number(req.params.id));
  if (!contract) return res.status(404).json({ error: "Nie znaleziono umowy" });
  if (contract.signed_pdf) fs.rmSync(path.join(CONTRACTS_DIR, contract.signed_pdf), { force: true });
  db.prepare("UPDATE contracts SET signed_pdf = '', updated_at = datetime('now') WHERE id = ?").run(contract.id);
  sendCard(req, res, contract.client_id);
});

// ---------- rachunki ----------

// POST /api/clients/contracts/:id/bills/preview - { kind, period, issued_on, items? } -> projekt
// rachunku (numer, pozycje, termin, kwota slownie) + errors (blokuja) + warnings. items = pozycje
// poprawione recznie w podgladzie; bez nich wyliczane z umowy.
router.post("/contracts/:id(\\d+)/bills/preview", (req, res) => {
  const r = billing.draftBill(Number(req.params.id), req.body);
  if (r.error) return fail(res, r);
  const b = r.bill;
  res.json({
    errors: r.errors,
    warnings: r.warnings,
    bill: redactBill(req, {
      ...b,
      items: b.items.map((it) => ({ ...it, amount: it.amount_grosze / 100 })),
      total: b.total_grosze / 100,
      words: slownie(b.total_grosze),
    }),
  });
});

router.post("/contracts/:id(\\d+)/bills", (req, res) => {
  const r = billing.createBill(Number(req.params.id), req.body, by(req));
  if (r.error) return fail(res, r);
  res.status(201).json({ id: r.id });
});

router.get("/bills/:id(\\d+)", (req, res) => {
  const row = db.prepare("SELECT * FROM bills WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Nie znaleziono rachunku" });
  const client = db
    .prepare("SELECT cl.id, cl.name FROM clients cl JOIN contracts c ON c.client_id = cl.id WHERE c.id = ?")
    .get(row.contract_id);
  res.json({ ...redactBill(req, billing.serializeBill(row)), client });
});

// GET /api/clients/bills/:id/pdf - gotowy plik PDF do pobrania (zamiast okna drukowania)
router.get("/bills/:id(\\d+)/pdf", async (req, res) => {
  const row = db.prepare("SELECT * FROM bills WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Nie znaleziono rachunku" });
  try {
    const pdf = await billPdf(redactBill(req, billing.serializeBill(row)));
    res.set("Content-Disposition", `attachment; filename="Rachunek-${row.number.replace(/\//g, "-")}.pdf"`);
    res.type("application/pdf").send(pdf);
  } catch (err) {
    console.error("[rachunek pdf]", err.message);
    res.status(500).json({ error: "Nie udało się wygenerować PDF-a — użyj „Drukuj” → „Zapisz jako PDF”" });
  }
});

function clientIdOfBill(billId) {
  return db
    .prepare("SELECT c.client_id FROM bills b JOIN contracts c ON c.id = b.contract_id WHERE b.id = ?")
    .pluck()
    .get(billId);
}

router.post("/bills/:id(\\d+)/paid", (req, res) => {
  const id = Number(req.params.id);
  const r = billing.markBillPaid(id, req.body.paid_on ? String(req.body.paid_on) : localDate(), by(req));
  if (r.error) return fail(res, r);
  sendCard(req, res, clientIdOfBill(id));
});

router.post("/bills/:id(\\d+)/unpaid", (req, res) => {
  const id = Number(req.params.id);
  const r = billing.unmarkBillPaid(id);
  if (r.error) return fail(res, r);
  sendCard(req, res, clientIdOfBill(id));
});

// POST /api/clients/contracts/:id/skip - { kind, period } - "Pomin" przy przypominajce o wystawieniu
router.post("/contracts/:id(\\d+)/skip", (req, res) => {
  const contractId = Number(req.params.id);
  if (!db.prepare("SELECT 1 FROM contracts WHERE id = ?").get(contractId)) return res.status(404).json({ error: "Nie znaleziono umowy" });
  const kind = String(req.body.kind || "");
  const withPeriod = kind === "abonament" || kind === "wykonanie_abonament";
  const period = withPeriod ? String(req.body.period || "") : "";
  if (!["wykonanie", "abonament", "wykonanie_abonament", "wykup"].includes(kind) || (withPeriod && !/^\d{4}-\d{2}$/.test(period))) {
    return res.status(400).json({ error: "Nieprawidłowa przypominajka" });
  }
  db.prepare("INSERT OR IGNORE INTO bill_skips (contract_id, kind, period, created_by) VALUES (?, ?, ?, ?)").run(contractId, kind, period, by(req));
  res.json({ ok: true });
});

// POST /api/clients/bills/:id/sent - { sent_on } (domyslnie dzis); { sent_on: "" } = cofnij
router.post("/bills/:id(\\d+)/sent", (req, res) => {
  const id = Number(req.params.id);
  const sentOn = req.body.sent_on === undefined ? localDate() : String(req.body.sent_on || "");
  const r = billing.setBillSent(id, sentOn);
  if (r.error) return fail(res, r);
  sendCard(req, res, clientIdOfBill(id));
});

router.delete("/bills/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const clientId = clientIdOfBill(id);
  const r = billing.deleteBill(id);
  if (r.error) return fail(res, r);
  sendCard(req, res, clientId);
});

module.exports = router;
