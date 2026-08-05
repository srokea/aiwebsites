const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "coldcall.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS niches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  niche_id INTEGER NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  quality TEXT NOT NULL DEFAULT '',
  has_social TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  tag_instagram INTEGER NOT NULL DEFAULT 0,
  tag_facebook INTEGER NOT NULL DEFAULT 0,
  tag_booksy INTEGER NOT NULL DEFAULT 0,
  tag_youtube INTEGER NOT NULL DEFAULT 0,
  answered TEXT NOT NULL DEFAULT '',
  interested TEXT NOT NULL DEFAULT 'nieruszone',
  caller TEXT NOT NULL DEFAULT '',
  reminder TEXT NOT NULL DEFAULT '',
  callback_when TEXT NOT NULL DEFAULT '',
  google_term TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  called_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_niche ON leads(niche_id);
CREATE INDEX IF NOT EXISTS idx_leads_called_at ON leads(called_at);

CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id);
`);

// Proste "migracje" dla kolumn dodanych po pierwszym wydaniu - ALTER TABLE ADD COLUMN
// nie wspiera IF NOT EXISTS we wszystkich wersjach SQLite, wiec ignorujemy blad duplikatu.
function addColumnIfMissing(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}
addColumnIfMissing("leads", "research_notes TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("niches", "color TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("niches", "call_script TEXT NOT NULL DEFAULT ''");

// Jednorazowa migracja danych: "nie" bywalo domyslna wartoscia dla leadow, ktorych nikt
// jeszcze nie ruszyl (stary default w schemacie) - a to co innego niz swiadome odrzucenie.
// Kazdy taki lead (bez Kto dzwonil i bez Odebral) przestawiamy na "nieruszone". Idempotentne:
// po pierwszym uruchomieniu nie ma juz nic do zmiany, wiec kolejne starty to no-op.
db.prepare(
  `UPDATE leads SET interested = 'nieruszone' WHERE interested = 'nie' AND caller = '' AND answered = ''`
).run();

// Jednorazowa migracja danych: "Strona" i "Tymczasowo zamkniete" licza sie teraz jako zrobione
// samodzielnie (patrz autoCall w constants.js / leadStatus.js), nawet bez Kto dzwonil / Odebral -
// backfillujemy called_at dla istniejacych leadow, ktore mialy taki status ustawiony wczesniej,
// zeby postep/statystyki zgadzaly sie od razu bez recznego dotykania kazdego leada.
db.prepare(
  `UPDATE leads SET called_at = COALESCE(called_at, updated_at, datetime('now'))
   WHERE interested IN ('strona', 'zamkniete') AND called_at IS NULL`
).run();

// Jednorazowa migracja danych: notatki przenosza sie z pojedynczego pola tekstowego
// leads.notes do osobnej tabeli lead_notes (kazda notatka z data utworzenia - patrz widok
// "tablicy korkowej"). Stara tresc staje sie pierwszym wpisem z data ostatniej edycji leada,
// a pole zrodlowe jest czyszczone - dzieki temu drugi start nie ma juz nic do przeniesienia.
db.transaction(() => {
  db.prepare(
    `INSERT INTO lead_notes (lead_id, content, created_at)
     SELECT id, notes, COALESCE(updated_at, datetime('now')) FROM leads WHERE notes <> ''`
  ).run();
  db.prepare(`UPDATE leads SET notes = '' WHERE notes <> ''`).run();
})();

module.exports = db;
