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

-- Historia edycji notatki: przy kazdej zmianie tresci stara wersja ladowana jest tutaj
-- (patrz PATCH /api/leads/:id/notes/:noteId), zeby nic nie ginelo po edycji.
CREATE TABLE IF NOT EXISTS lead_note_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES lead_notes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  replaced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_note_edits_note ON lead_note_edits(note_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Jeden wiersz na uzytkownika (PK = user_id) - kazdy nowy klik po prostu nadpisuje
-- poprzedni, wiec zawsze widac tylko najswiezsza aktywnosc (patrz "kto tu jest" w niche.js).
CREATE TABLE IF NOT EXISTS presence (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL,
  niche_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Zapisane zestawy filtrow (#13): PRYWATNE per osoba i per nisza - "Zestaw 1" Nikodema w
-- Fryzjerach nie ma nic wspolnego z zestawem Sylwestra ani z tym samym zestawem w innej niszy.
-- filters to JSON o tym samym ksztalcie co obiekt filters w niche.js, zeby zapis/odczyt byl
-- jednym przypisaniem, bez tlumaczenia formatow po drodze.
CREATE TABLE IF NOT EXISTS filter_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  niche_id INTEGER NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_filter_sets_owner ON filter_sets(user_id, niche_id);

CREATE TABLE IF NOT EXISTS map_pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  osm_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'nieruszone',
  notes TEXT NOT NULL DEFAULT '',
  caller TEXT NOT NULL DEFAULT '',
  last_visited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_map_pins_status ON map_pins(status);
CREATE INDEX IF NOT EXISTS idx_map_pins_street ON map_pins(street);
CREATE UNIQUE INDEX IF NOT EXISTS idx_map_pins_osm_id ON map_pins(osm_id);
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
addColumnIfMissing("leads", "dopiete_at TEXT");
addColumnIfMissing("lead_notes", "updated_at TEXT");
addColumnIfMissing("niches", "color TEXT NOT NULL DEFAULT ''");
// wybor pliku schematu rozmowy per nisza (server/scriptsData/<nazwa>.js); '' = default
addColumnIfMissing("niches", "script_file TEXT NOT NULL DEFAULT ''");
// 'emoji' -> users.avatar to krotki tekst/emoji, 'photo' -> users.avatar to sciezka do wgranego
// pliku (/avatars/<plik>, patrz server/routes/users.js) - dwa rozne sposoby wyswietlenia avatara
addColumnIfMissing("users", "avatar_kind TEXT NOT NULL DEFAULT 'emoji'");
// "czas do decyzji" - zamrozony stoper z panelu bocznego na scheme rozmowy (patrz script.js) -
// ile sekund minelo od otwarcia strony do pierwszej zmiany "Zainteresowany" w danej wizycie
addColumnIfMissing("leads", "decision_seconds INTEGER");
// #11 - godziny otwarcia firmy ("HH:MM" albo pusty string), zeby dalo sie filtrowac
// "kto jest juz otwarty, gdy zaczynam dzwonic"
addColumnIfMissing("leads", "open_time TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("leads", "close_time TEXT NOT NULL DEFAULT ''");
// #14 - etap budowy strony klienta (indeks z SITE_PROGRESS_OPTIONS w constants.js)
addColumnIfMissing("leads", "site_progress INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("leads", "tag_tiktok INTEGER NOT NULL DEFAULT 0");
// znaczek "verified" przy ramce social - ustawiany raz, gdy ktos recznie poprawi tagi
// platform (odroznia recznie zweryfikowane dane od tych prosto ze scrapera/importu CSV)
addColumnIfMissing("leads", "social_verified INTEGER NOT NULL DEFAULT 0");

// Jednorazowy seed: stan jak dawna sztywna mapa NICHE_SCRIPTS (kosmetyczki mialy swoj plik,
// reszta default). Idempotentne - po ustawieniu wartosci warunek '' juz nie zlapie.
db.prepare("UPDATE niches SET script_file = 'kosmetyczki' WHERE slug = 'kosmetyczki' AND script_file = ''").run();

// Jednorazowe sprzatanie: kolumna call_script byla dodana przez pomylke (schematy rozmow
// zyja w server/scriptsData/, nie w bazie) - usuwamy ja razem z wpisanymi testowo danymi.
// Brak kolumny = nic do zrobienia, wiec kolejne starty to no-op.
try {
  db.exec("ALTER TABLE niches DROP COLUMN call_script");
} catch (err) {
  if (!/no such column/i.test(err.message)) throw err;
}

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

// Jednorazowa migracja danych: dopiete_at (od kiedy liczymy dochod z abonamentu klienta,
// patrz panel Kasy / /api/stats) nie istnial przed wprowadzeniem tej kolumny - dla juz
// dopietych klientow backfillujemy najlepszym dostepnym przyblizeniem daty domkniecia.
db.prepare(
  `UPDATE leads SET dopiete_at = COALESCE(called_at, updated_at, created_at)
   WHERE interested = 'dopiete' AND dopiete_at IS NULL`
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
