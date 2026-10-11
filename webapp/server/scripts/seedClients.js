// Import danych startowych modulu "Klienci i umowy" z data/seed-klienci-umowy.json (plik NIE jest w
// gicie - PESEL, nr konta; caly webapp/data/ jest w .gitignore).
//
// Uzycie:  npm run seed:klienci            (albo: node server/scripts/seedClients.js <sciezka.json>)
// Na serwerze: docker exec callcenter npm run seed:klienci
//
// Idempotentny: umowa rozpoznawana po numerze, klient po NIP-ie / leadzie / nazwie. Drugie
// uruchomienie NIE dubluje i NIE nadpisuje niczego, co juz jest w bazie (np. poprawione w UI) -
// uzupelnia tylko puste pola. Pola null zostaja puste; na koncu lista, co trzeba dopisac recznie.
//
// Nazwy pol sa elastyczne (jak w imporcie CSV): "nazwa_firmy" / "Nazwa firmy" / "firma" itd. -
// patrz ALIASES nizej. Oczekiwany ksztalt (umowy moga byc tez osobna lista z polem "klient"):
//   { "zleceniobiorca": { "imie_nazwisko", "adres", "pesel", "nr_dowodu", "nr_konta", ... },
//     "klienci": [ { "nazwa", "nazwa_firmy", "nip", ..., "umowy": [ { "numer", "data_od", ... } ] } ] }

const fs = require("fs");
const path = require("path");
const db = require("../db");
const billing = require("../billing");
const { CONTRACT_STATUS_OPTIONS } = require("../constants");

const file = process.argv[2] || path.join(__dirname, "..", "..", "data", "seed-klienci-umowy.json");
if (!fs.existsSync(file)) {
  console.error(`Brak pliku ${file}\nSkopiuj seed-klienci-umowy.json do webapp/data/ (NIE do gita) i odpal ponownie.`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// ---------- elastyczne nazwy pol ----------

const norm = (k) =>
  String(k)
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const ALIASES = {
  contractor: ["zleceniobiorca", "contractor", "moje_dane", "ja"],
  clients: ["klienci", "clients", "zleceniodawcy"],
  contracts: ["umowy", "contracts"],
  contract: ["umowa", "contract"],
  // zleceniobiorca
  full_name: ["imie_i_nazwisko", "imie_nazwisko", "full_name", "nazwisko", "imie_i_nazwisko_zleceniobiorcy"],
  address: ["adres", "address", "adres_zamieszkania", "adres_siedziby", "siedziba"],
  pesel: ["pesel"],
  id_card: ["nr_dowodu", "numer_dowodu", "dowod", "dowod_osobisty", "nr_dowodu_osobistego", "id_card", "seria_i_numer_dowodu"],
  bank_account: ["nr_konta", "numer_konta", "konto", "rachunek_bankowy", "nr_rachunku", "numer_rachunku", "bank_account", "iban"],
  phone: ["telefon", "tel", "phone", "nr_telefonu"],
  email: ["email", "e_mail", "mail", "adres_email"],
  issue_city: ["miejscowosc_wystawiania", "miejscowosc_wystawiania_rachunkow", "miejsce_wystawienia", "miasto_wystawiania", "issue_city"],
  student_until: ["status_studenta_do", "student_do", "student_until", "legitymacja_do", "status_studenta"],
  // klient
  name: ["nazwa", "nazwa_krotka", "name", "marka", "nazwa_salonu", "nazwa_wyswietlana"],
  legal_name: ["nazwa_firmy", "firma", "legal_name", "pelna_nazwa", "nazwa_pelna", "nazwa_z_faktur", "nazwa_firmy_z_faktur"],
  owner_name: ["wlasciciel", "imie_i_nazwisko_wlasciciela", "imie_nazwisko_wlasciciela", "owner", "owner_name", "wlascicielka"],
  nip: ["nip"],
  regon: ["regon"],
  city: ["miasto", "city", "miejscowosc"],
  niche: ["nisza", "niche", "branza"],
  notes: ["notatki", "uwagi", "notes", "notatka"],
  lead_id: ["lead_id", "id_leada", "lead"],
  client_ref: ["klient", "client", "klient_nazwa", "nazwa_klienta", "klient_nip", "client_id", "id_klienta"],
  // umowa
  number: ["numer", "nr", "numer_umowy", "nr_umowy", "number"],
  signed_on: ["data_zawarcia", "zawarta", "signed_on", "data_podpisania", "data_umowy"],
  starts_on: ["data_od", "od", "starts_on", "obowiazuje_od", "poczatek"],
  ends_on: ["data_do", "do", "ends_on", "obowiazuje_do", "koniec"],
  status: ["status", "status_umowy"],
  kind: ["typ", "rodzaj", "kind", "typ_umowy"],
  variant: ["wariant", "pakiet", "variant"],
  onetime: ["oplata_jednorazowa", "jednorazowa", "wykonanie", "oplata_za_wykonanie", "onetime", "wynagrodzenie_jednorazowe", "cena_wykonania"],
  monthly: ["abonament", "abonament_miesieczny", "oplata_miesieczna", "monthly", "abonament_mies"],
  monthly_per_site: ["abonament_za_strone", "abonament_na_strone", "abonament_per_strona"],
  sites: ["strony", "sites", "lista_stron"],
  domains: ["domena", "domeny", "domains", "domain", "domena_y"],
  site_count: ["liczba_stron", "ilosc_stron", "strony_liczba"],
  buyout: ["wykup", "wykup_kwota", "kwota_wykupu", "buyout"],
  bought_out: ["wykupione", "czy_wykupione", "wykup_wykupione", "wykupiona"],
  bought_out_on: ["data_wykupu", "wykupione_dnia"],
  amount: ["kwota", "amount"],
  site_name: ["nazwa", "name", "strona"],
  site_domain: ["domena", "domain", "url", "adres"],
};
const ALIAS_SETS = Object.fromEntries(Object.entries(ALIASES).map(([k, list]) => [k, new Set(list.map(norm))]));

function pick(obj, key) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  for (const [k, v] of Object.entries(obj)) if (ALIAS_SETS[key].has(norm(k))) return v;
  return undefined;
}

const text = (v) => (v == null || typeof v === "object" ? "" : String(v).trim());
const digits = (v) => text(v).replace(/\D/g, "");

const warnings = [];

function date(v, label) {
  const s = text(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  warnings.push(`${label}: nie rozumiem daty „${s}” — zostawiam pustą`);
  return "";
}

function money(v, label) {
  if (v == null || text(v) === "") return null;
  const n = typeof v === "number" ? v : parseFloat(text(v).replace(/zł|pln/gi, "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) {
    warnings.push(`${label}: nie rozumiem kwoty „${text(v)}” — zostawiam pustą`);
    return null;
  }
  return Math.round(n * 100);
}

function status(v) {
  const s = norm(text(v));
  if (!s) return "szkic";
  const hit = CONTRACT_STATUS_OPTIONS.find((o) => norm(o.value) === s || norm(o.label) === s);
  if (hit) return hit.value;
  if (/aktywn|obowiazuj|signed/.test(s)) return "podpisana";
  if (/zakoncz|ended|wygasl/.test(s)) return "zakonczona";
  warnings.push(`Status umowy „${text(v)}” nieznany — ustawiam „szkic”`);
  return "szkic";
}

function kind(v) {
  const s = norm(text(v));
  if (!s || s.includes("wykonanie")) return "wykonanie_abonament";
  if (s.includes("abonament")) return "abonament";
  return "wykonanie_abonament";
}

function variant(v) {
  const s = norm(text(v));
  if (!s) return "";
  if (s.includes("pro")) return "pro_plus";
  if (s.includes("website") || s.includes("plus")) return "website_plus";
  if (s.includes("basic")) return "basic";
  warnings.push(`Wariant „${text(v)}” nieznany — zostawiam pusty`);
  return "";
}

function sitesOf(raw, clientName) {
  let sites = [];
  const list = pick(raw, "sites");
  if (Array.isArray(list)) {
    sites = list.map((s) => {
      if (typeof s === "string") return s.includes(".") ? { name: "", domain: s.trim() } : { name: s.trim(), domain: "" };
      return { name: text(pick(s, "site_name")), domain: text(pick(s, "site_domain")) };
    });
  }
  if (!sites.length) {
    const doms = pick(raw, "domains");
    const arr = Array.isArray(doms) ? doms : text(doms) ? text(doms).split(/[,;\s]+/) : [];
    sites = arr.map((d) => ({ name: "", domain: text(d) })).filter((s) => s.domain);
  }
  const count = Number(pick(raw, "site_count")) || 0;
  for (let i = sites.length; i < count; i++) sites.push({ name: `${clientName} — strona ${i + 1}`, domain: "" });
  if (sites.length === 1 && !sites[0].name) sites[0].name = clientName;
  return sites.filter((s) => s.name || s.domain);
}

// ---------- zapis (tylko puste pola) ----------

function fillEmpty(table, id, current, values) {
  const set = {};
  for (const [k, v] of Object.entries(values)) {
    const empty = current[k] == null || current[k] === "" || (k === "sites" && current[k] === "[]");
    const hasValue = v != null && v !== "" && !(k === "sites" && v === "[]");
    if (empty && hasValue) set[k] = v;
  }
  const cols = Object.keys(set);
  if (cols.length) {
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({
      ...set,
      id,
    });
  }
  return cols.length;
}

const stats = { contractor: 0, clientsNew: 0, clientsFilled: 0, contractsNew: 0, contractsFilled: 0, leadsLinked: 0 };

function importContractor(raw) {
  if (!raw) return;
  const values = {};
  for (const f of billing.CONTRACTOR_FIELDS) {
    values[f] = f === "student_until" ? date(pick(raw, f), "Zleceniobiorca") : text(pick(raw, f));
  }
  if (values.pesel) values.pesel = digits(values.pesel);
  const cur = db.prepare("SELECT * FROM contractor WHERE id = 1").get();
  if (!cur) {
    const cols = billing.CONTRACTOR_FIELDS;
    db.prepare(`INSERT INTO contractor (id, ${cols.join(", ")}) VALUES (1, ${cols.map((c) => "@" + c).join(", ")})`).run(values);
    stats.contractor = 1;
  } else {
    stats.contractor = fillEmpty("contractor", 1, cur, values);
  }
}

function findLead(client) {
  const tel = digits(client.phone).slice(-9);
  if (tel.length === 9) {
    const hits = db
      .prepare(
        `SELECT id FROM leads WHERE substr(digits_only(phone), -9) = ?
         AND id NOT IN (SELECT lead_id FROM clients WHERE lead_id IS NOT NULL)`
      )
      .pluck()
      .all(tel);
    if (hits.length === 1) return hits[0];
  }
  const names = [client.name, client.legal_name].map(norm).filter((n) => n.length >= 4);
  if (!names.length) return null;
  const leads = db
    .prepare("SELECT id, company_name FROM leads WHERE id NOT IN (SELECT lead_id FROM clients WHERE lead_id IS NOT NULL)")
    .all()
    .filter((l) => {
      const ln = norm(l.company_name);
      return names.some((n) => ln === n || ln.includes(n) || n.includes(ln));
    });
  return leads.length === 1 ? leads[0].id : null;
}

function importClient(raw) {
  const v = {};
  for (const f of ["name", "legal_name", "owner_name", "address", "nip", "regon", "phone", "email", "city", "niche", "notes"]) {
    v[f] = text(pick(raw, f));
  }
  if (!v.name) v.name = v.legal_name;
  if (!v.name) {
    warnings.push(`Pominięty klient bez nazwy: ${JSON.stringify(raw).slice(0, 80)}…`);
    return null;
  }
  const leadId = Number(pick(raw, "lead_id")) || null;

  const nipDigits = digits(v.nip);
  let cur =
    (nipDigits && db.prepare("SELECT * FROM clients WHERE replace(replace(nip, '-', ''), ' ', '') = ?").get(nipDigits)) ||
    (leadId && db.prepare("SELECT * FROM clients WHERE lead_id = ?").get(leadId)) ||
    db
      .prepare("SELECT * FROM clients")
      .all()
      .find((c) => [c.name, c.legal_name].map(norm).some((n) => n && (n === norm(v.name) || n === norm(v.legal_name))));

  if (cur) {
    if (fillEmpty("clients", cur.id, cur, v)) stats.clientsFilled += 1;
  } else {
    const cols = Object.keys(v);
    const id = db
      .prepare(`INSERT INTO clients (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`)
      .run(v).lastInsertRowid;
    cur = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
    stats.clientsNew += 1;
  }

  if (!cur.lead_id) {
    const lead = leadId && db.prepare("SELECT 1 FROM leads WHERE id = ?").get(leadId) ? leadId : findLead({ ...cur, ...v });
    if (lead) {
      db.prepare("UPDATE clients SET lead_id = ? WHERE id = ?").run(lead, cur.id);
      stats.leadsLinked += 1;
    }
  }
  return db.prepare("SELECT * FROM clients WHERE id = ?").get(cur.id);
}

function importContract(raw, client) {
  const number = text(pick(raw, "number"));
  const label = `Umowa ${number || "?"} (${client.name})`;
  if (!number) {
    warnings.push(`${label}: brak numeru umowy — pominięta (numer jest kluczem importu)`);
    return;
  }
  const buyoutRaw = pick(raw, "buyout");
  const buyoutObj = buyoutRaw && typeof buyoutRaw === "object" ? buyoutRaw : null;
  let monthly = money(pick(raw, "monthly"), label);
  const perSite = money(pick(raw, "monthly_per_site"), label);
  const sites = sitesOf(raw, client.name);
  if (monthly == null && perSite != null) monthly = perSite * Math.max(1, sites.length);

  const v = {
    signed_on: date(pick(raw, "signed_on"), label),
    starts_on: date(pick(raw, "starts_on"), label),
    ends_on: date(pick(raw, "ends_on"), label),
    status: status(pick(raw, "status")),
    kind: kind(pick(raw, "kind")),
    variant: variant(pick(raw, "variant")),
    onetime_grosze: money(pick(raw, "onetime"), label),
    monthly_grosze: monthly,
    sites: JSON.stringify(sites),
    buyout_grosze: buyoutObj ? money(pick(buyoutObj, "amount"), label) : money(buyoutRaw, label),
    bought_out_on: date(pick(raw, "bought_out_on") ?? (buyoutObj && pick(buyoutObj, "bought_out_on")), label),
    notes: text(pick(raw, "notes")),
  };
  const bought = pick(raw, "bought_out") ?? (buyoutObj && pick(buyoutObj, "bought_out"));
  if (bought === true && !v.bought_out_on) {
    warnings.push(`${label}: oznaczona jako wykupiona, ale bez daty wykupu — dopisałem to w notatkach`);
    v.notes = [v.notes, "Wykupiona (z importu) — brak daty wykupu."].filter(Boolean).join(" ");
  }

  const cur = db.prepare("SELECT * FROM contracts WHERE number = ?").get(number);
  if (cur) {
    if (cur.client_id !== client.id) warnings.push(`${label}: numer jest już przy innym kliencie (id ${cur.client_id}) — nie ruszam`);
    else if (fillEmpty("contracts", cur.id, cur, v)) stats.contractsFilled += 1;
    return;
  }
  const cols = Object.keys(v);
  db.prepare(`INSERT INTO contracts (client_id, number, ${cols.join(", ")}) VALUES (@client_id, @number, ${cols.map((c) => "@" + c).join(", ")})`).run({
    client_id: client.id,
    number,
    ...v,
  });
  stats.contractsNew += 1;
}

// ---------- przebieg ----------

const root = Array.isArray(data) ? { klienci: data } : data;
const touchedClients = new Set();

db.transaction(() => {
  importContractor(pick(root, "contractor"));

  const clientsRaw = pick(root, "clients") || [];
  const byRef = new Map(); // nazwa / nip / id z seeda -> klient w bazie (do osobnej listy umow)
  clientsRaw.forEach((raw, i) => {
    const client = importClient(raw);
    if (!client) return;
    touchedClients.add(client.id);
    for (const ref of [text(raw.id), text(pick(raw, "nip")), text(pick(raw, "name")), text(pick(raw, "legal_name")), String(i + 1)]) {
      if (ref) byRef.set(norm(ref), client);
    }
    const nested = pick(raw, "contracts") || (pick(raw, "contract") ? [pick(raw, "contract")] : []);
    for (const c of Array.isArray(nested) ? nested : [nested]) importContract(c, client);
  });

  const contractsRaw = pick(root, "contracts");
  for (const c of Array.isArray(contractsRaw) ? contractsRaw : []) {
    const ref = pick(c, "client_ref");
    const key = norm(typeof ref === "object" && ref ? text(pick(ref, "nip")) || text(pick(ref, "name")) || text(pick(ref, "legal_name")) : text(ref));
    const client = byRef.get(key);
    if (!client) {
      warnings.push(`Umowa ${text(pick(c, "number")) || "?"}: nie znalazłem klienta „${text(ref) || JSON.stringify(ref)}” — pominięta`);
      continue;
    }
    importContract(c, client);
  }

  const known = new Set(["contractor", "clients", "contracts"].flatMap((k) => ALIASES[k].map(norm)));
  for (const k of Object.keys(root)) if (!known.has(norm(k))) warnings.push(`Nieznana sekcja „${k}” — pominięta`);
})();

if (touchedClients.size) billing.syncPricing("seed");

// ---------- raport ----------

console.log(`\nImport z ${path.basename(file)}:`);
console.log(`  zleceniobiorca: ${stats.contractor ? "zapisany/uzupełniony" : "bez zmian"}`);
console.log(`  klienci: ${stats.clientsNew} nowych, ${stats.clientsFilled} uzupełnionych, ${stats.leadsLinked} podpiętych pod leady`);
console.log(`  umowy: ${stats.contractsNew} nowych, ${stats.contractsFilled} uzupełnionych`);
if (warnings.length) {
  console.log("\nUwagi:");
  for (const w of warnings) console.log(`  ! ${w}`);
}

const LABELS = {
  full_name: "imię i nazwisko",
  address: "adres",
  pesel: "PESEL",
  id_card: "nr dowodu",
  bank_account: "nr konta",
  phone: "telefon",
  email: "e-mail",
  issue_city: "miejscowość wystawiania",
  student_until: "status studenta do",
  legal_name: "firma (jak na fakturach)",
  owner_name: "właściciel",
  nip: "NIP",
  city: "miasto",
  signed_on: "data zawarcia",
  starts_on: "data od",
  ends_on: "data do",
  variant: "wariant",
  onetime_grosze: "opłata jednorazowa",
  monthly_grosze: "abonament",
  sites: "strony/domeny",
};
const emptyOf = (row, fields) => fields.filter((f) => row[f] == null || row[f] === "" || row[f] === "[]").map((f) => LABELS[f]);

console.log("\nDo uzupełnienia ręcznie (puste pola):");
let todo = 0;
const contractor = db.prepare("SELECT * FROM contractor WHERE id = 1").get();
const me = contractor ? emptyOf(contractor, billing.CONTRACTOR_FIELDS) : ["wszystko"];
if (me.length) {
  todo += 1;
  console.log(`  Moje dane: ${me.join(", ")}`);
}
for (const c of db.prepare("SELECT * FROM clients ORDER BY name COLLATE NOCASE").all()) {
  const lines = [];
  const missing = emptyOf(c, ["legal_name", "owner_name", "address", "nip", "phone", "email", "city"]);
  if (missing.length) lines.push(`dane: ${missing.join(", ")}`);
  if (!c.lead_id) lines.push("bez powiązanego leada (Kasa nie liczy mu należności — płatności idą z rachunków)");
  for (const k of db.prepare("SELECT * FROM contracts WHERE client_id = ? ORDER BY id").all(c.id)) {
    const fields = ["signed_on", "starts_on", "variant", "monthly_grosze", "sites"];
    if (k.kind !== "abonament") fields.push("onetime_grosze");
    const m = emptyOf(k, fields);
    if (!k.ends_on) m.push("data do (bez daty końca — OK, jeśli celowo)");
    if (m.length) lines.push(`umowa ${k.number}: ${m.join(", ")}`);
    const sites = billing.parseSites(k.sites);
    if (sites.length > 1) lines.push(`umowa ${k.number}: ${sites.length} strony, abonament ${(k.monthly_grosze ?? 0) / 100} zł/mies. ŁĄCZNIE — sprawdź`);
  }
  if (!db.prepare("SELECT 1 FROM contracts WHERE client_id = ?").get(c.id)) lines.push("brak umowy");
  if (lines.length) {
    todo += 1;
    console.log(`  ${c.name}:`);
    for (const l of lines) console.log(`    - ${l}`);
  }
}
if (!todo) console.log("  nic — wszystko kompletne");
console.log("");
