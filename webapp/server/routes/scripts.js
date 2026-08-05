const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { listBlocks, saveBlock, loadInstrumented } = require("../scriptSource");

const router = express.Router();
const SCRIPTS_DIR = path.join(__dirname, "..", "scriptsData");

// Pliki schematow czytane z folderu w RUNTIME - nowy plik .js wrzucony do scriptsData/
// pojawia sie na liscie sam, bez zmian w kodzie i bez restartu. platformTokens.js to
// wspolny helper gramatyczny, nie schemat - stad wyjatek.
function listScriptFiles() {
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".js") && f !== "platformTokens.js")
    .map((f) => f.slice(0, -3))
    .sort();
}

// Nazwa pliku schematu dla niszy wg niches.script_file. Pusta wartosc, nazwa spoza
// dozwolonego wzorca (ochrona przed path traversal) albo skasowany plik -> default.
function resolveScriptFile(name) {
  const safe = /^[\w-]+$/.test(name || "") ? name : "default";
  return fs.existsSync(path.join(SCRIPTS_DIR, `${safe}.js`)) ? safe : "default";
}

// Cache require'a jest czyszczony, zeby edycja tresci schematu dzialala bez restartu serwera.
function loadGenerator(fileName) {
  const target = path.join(SCRIPTS_DIR, `${fileName}.js`);
  delete require.cache[require.resolve(target)];
  return require(target);
}

// GET /api/scripts/files - lista schematow do dropdownu w ustawieniach niszy
router.get("/files", (req, res) => {
  res.json(listScriptFiles());
});

// GET /api/scripts/lead/:leadId - buduje scheme rozmowy dopasowany do leada.
// Z ?edit=1 bloki tekstowe dostaja _src (indeks w pliku zrodlowym) na potrzeby edycji.
router.get("/lead/:leadId", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.leadId);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const niche = db.prepare("SELECT * FROM niches WHERE id = ?").get(lead.niche_id);
  const scriptFile = resolveScriptFile(niche.script_file);
  const generator = req.query.edit === "1" ? loadInstrumented(scriptFile) : loadGenerator(scriptFile);
  const script = generator.buildScript(lead, niche);

  res.json({ lead, niche, script, scriptFile });
});

// GET /api/scripts/source/:file - surowe tresci blokow (z tokenami {firma}/{miasto}/...)
router.get("/source/:file", (req, res) => {
  const file = req.params.file;
  if (!listScriptFiles().includes(file)) return res.status(404).json({ error: `Nie ma pliku schematu: ${file}` });
  res.json({ blocks: listBlocks(file) });
});

// PATCH /api/scripts/source/:file/:index - zapis edycji jednego bloku z powrotem do .js
// (podmiana na AST + walidacja probna kompilacja + zapis atomowy z kopia .bak)
router.patch("/source/:file/:index", (req, res) => {
  const file = req.params.file;
  if (!listScriptFiles().includes(file)) return res.status(404).json({ error: `Nie ma pliku schematu: ${file}` });

  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: "Nieprawidlowy indeks bloku" });

  try {
    saveBlock(file, index, String(req.body.raw ?? ""));
    res.json({ ok: true, blocks: listBlocks(file) });
  } catch (err) {
    res.status(err.status || 400).json({ error: `Zapis odrzucony, plik nietkniety: ${err.message}` });
  }
});

module.exports = router;
module.exports.listScriptFiles = listScriptFiles;
