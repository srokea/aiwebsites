-- schema.sql — struktura bazy D1 dla jednej instancji portfolio.
-- Per klient: NIC tu nie zmieniasz. Wgrywasz raz, po utworzeniu bazy:
--   wrangler d1 execute portfolio-NAZWA_KLIENTA-db --remote --file=schema.sql
--
-- Hierarchia:
--   folder  (zakładka w nawigacji, np. "Śluby")
--   └─ album  (sekcja na stronie folderu, np. "Ślub Gosi", "Ślub Asi")
--      └─ item  (kafelek w siatce albumu: zdjęcie albo blok tekstu)

-- Foldery = zakładki nawigacji w portfolio.
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Albumy = sekcje wyświetlane jedna pod drugą na stronie folderu.
-- Pusta nazwa = sekcja bez nagłówka (np. folder "Portrety" z jedną siatką).
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Kafelki w siatce albumu. Rolki (type = 'video') maja w R2 dwa obiekty:
-- sam plik i klatke-plakat. Siatka ma 6 kolumn:
--   grid_w = 1..6 kolumn, grid_h = 1..4 wierszy.
-- Zdjęcia i teksty dzielą jedną kolejność (position) w obrębie albumu.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'text', 'video')),
  grid_w INTEGER NOT NULL DEFAULT 2,
  grid_h INTEGER NOT NULL DEFAULT 2,
  position INTEGER NOT NULL,

  -- dla type = 'photo' i 'video' (plik leży w R2 pod kluczem r2_key)
  filename TEXT,
  r2_key TEXT,
  display_name TEXT,

  -- tylko dla type = 'video': klatka-plakat, osobny obiekt w R2
  poster_key TEXT,

  -- tylko dla type = 'text'
  html TEXT,     -- oczyszczony HTML: tylko b/i/u/strong/em/br/div/p, bez atrybutów
  style TEXT,    -- JSON: { font, size, align, color, bg }

  created_at TEXT DEFAULT (datetime('now'))
);

-- Indeksy pod zapytania, które faktycznie robi API.
CREATE INDEX IF NOT EXISTS idx_folders_position ON folders(position);
CREATE INDEX IF NOT EXISTS idx_albums_folder ON albums(folder_id, position);
CREATE INDEX IF NOT EXISTS idx_items_album ON items(album_id, position);

-- Ustawienia strony spoza hierarchii folder/album/item — na razie tylo tlo
-- hero (osobne dla telefonu i komputera), stad prosty klucz-wartosc zamiast
-- dedykowanych kolumn. Wartosc to gotowy publiczny URL zdjecia w R2.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Slajdy tla hero (opcjonalny slideshow zamiast jednego statycznego zdjecia,
-- patrz settings.key='hero_mode' i worker/hero.js) — trzymane OSOBNO od
-- folder/album/item: to tresc USTAWIEN strony, nigdy nie trafia do publicznej
-- galerii portfolio. is_portrait decyduje, czy slajd idzie na telefon czy
-- na komputer (zeby pionowe "z telefonu" nie rozjezdzaly sie na desktopie).
CREATE TABLE IF NOT EXISTS hero_slides (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  is_portrait INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hero_slides_position ON hero_slides(position);

-- Sekcja "Zaufali mi": avatar + nazwa firmy + link, edytowalne z panelu
-- zamiast wpisywane na sztywno w public/index.html.
CREATE TABLE IF NOT EXISTS trusted_entries (
  id TEXT PRIMARY KEY,
  r2_key TEXT,
  name TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trusted_position ON trusted_entries(position);
