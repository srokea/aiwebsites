const express = require("express");
const db = require("../db");

const router = express.Router();

// Zapisane zestawy filtrow (#13) - np. "Moje do oddzwonienia" = Kto dzwonil: Nikodem +
// Odebral: Nie + Zainteresowany: Oddzwonic. Zestawy sa PRYWATNE i osobne dla kazdej niszy:
// kazde zapytanie ponizej jest zawezone do req.user.id, wiec nie da sie podejrzec ani
// nadpisac cudzego zestawu nawet znajac jego id.
//
// Tresc filtrow trzymamy jako JSON o dokladnie tym samym ksztalcie co obiekt `filters`
// w niche.js ({ pole: [wartosci] }) - dzieki temu zapis i wczytanie to jedno przypisanie,
// a dodanie nowego filtra w UI nie wymaga ruszania tego pliku.
const MAX_NAME_LENGTH = 40;

function parseFilters(json) {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // uszkodzony wpis nie moze wywalic calej listy zestawow
  }
}

function listSets(userId, nicheId) {
  return db
    .prepare("SELECT id, name, filters FROM filter_sets WHERE user_id = ? AND niche_id = ? ORDER BY id ASC")
    .all(userId, nicheId)
    .map((row) => ({ id: row.id, name: row.name, filters: parseFilters(row.filters) }));
}

function readName(body) {
  const name = String(body.name || "").trim();
  if (!name) return { error: "Podaj nazwę zestawu" };
  if (name.length > MAX_NAME_LENGTH) return { error: `Nazwa może mieć maksymalnie ${MAX_NAME_LENGTH} znaków` };
  return { name };
}

// Zapisujemy tylko mapy "pole -> tablica stringow". Wartosci NIE sa tu walidowane wzgledem
// /api/meta swiadomie: gdy kiedys zniknie jakis status, niche.js i tak odsiewa nieistniejace
// wartosci przy wczytaniu (patrz restoreViewState), a zestaw nie musi przez to przepadac.
function readFilters(body) {
  const raw = body.filters;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean = {};
  for (const [field, values] of Object.entries(raw)) {
    if (Array.isArray(values)) clean[field] = values.map((v) => String(v));
  }
  return clean;
}

// GET /api/filter-sets?niche_id=<id> - moje zestawy dla tej niszy
router.get("/", (req, res) => {
  const nicheId = Number(req.query.niche_id);
  if (!nicheId) return res.status(400).json({ error: "Brak niche_id" });
  res.json(listSets(req.user.id, nicheId));
});

// POST /api/filter-sets - zapisuje obecnie ustawione filtry pod nazwa
router.post("/", (req, res) => {
  const nicheId = Number(req.body.niche_id);
  if (!nicheId) return res.status(400).json({ error: "Brak niche_id" });
  if (!db.prepare("SELECT id FROM niches WHERE id = ?").get(nicheId)) {
    return res.status(404).json({ error: "Nie znaleziono niszy" });
  }

  const { name, error } = readName(req.body);
  if (error) return res.status(400).json({ error });

  db.prepare("INSERT INTO filter_sets (user_id, niche_id, name, filters) VALUES (?, ?, ?, ?)").run(
    req.user.id,
    nicheId,
    name,
    JSON.stringify(readFilters(req.body))
  );

  res.status(201).json(listSets(req.user.id, nicheId));
});

// PATCH /api/filter-sets/:id - zmiana nazwy i/lub nadpisanie zestawu obecnymi filtrami
router.patch("/:id", (req, res) => {
  const set = db.prepare("SELECT * FROM filter_sets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!set) return res.status(404).json({ error: "Nie znaleziono zestawu" });

  const updates = {};
  if ("name" in req.body) {
    const { name, error } = readName(req.body);
    if (error) return res.status(400).json({ error });
    updates.name = name;
  }
  if ("filters" in req.body) updates.filters = JSON.stringify(readFilters(req.body));
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Brak pol do aktualizacji" });

  const setClauses = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");
  db.prepare(`UPDATE filter_sets SET ${setClauses} WHERE id = @id`).run({ ...updates, id: set.id });

  res.json(listSets(req.user.id, set.niche_id));
});

// DELETE /api/filter-sets/:id
router.delete("/:id", (req, res) => {
  const set = db.prepare("SELECT * FROM filter_sets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!set) return res.status(404).json({ error: "Nie znaleziono zestawu" });

  db.prepare("DELETE FROM filter_sets WHERE id = ?").run(set.id);
  res.json(listSets(req.user.id, set.niche_id));
});

module.exports = router;
