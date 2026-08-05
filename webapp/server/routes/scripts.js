const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db");

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

// Generator dla niszy wg wyboru zapisanego w niches.script_file. Pusta wartosc, nazwa
// spoza dozwolonego wzorca (ochrona przed path traversal) albo skasowany plik -> default.js.
// Cache require'a jest czyszczony, zeby edycja tresci schematu dzialala bez restartu serwera.
function loadGenerator(name) {
  const safe = /^[\w-]+$/.test(name || "") ? name : "default";
  const file = path.join(SCRIPTS_DIR, `${safe}.js`);
  const target = fs.existsSync(file) ? file : path.join(SCRIPTS_DIR, "default.js");
  delete require.cache[require.resolve(target)];
  return require(target);
}

// GET /api/scripts/files - lista schematow do dropdownu w ustawieniach niszy
router.get("/files", (req, res) => {
  res.json(listScriptFiles());
});

// GET /api/scripts/lead/:leadId - buduje scheme rozmowy dopasowany do leada
router.get("/lead/:leadId", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.leadId);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const niche = db.prepare("SELECT * FROM niches WHERE id = ?").get(lead.niche_id);
  const generator = loadGenerator(niche.script_file);
  const script = generator.buildScript(lead, niche);

  res.json({ lead, niche, script });
});

module.exports = router;
module.exports.listScriptFiles = listScriptFiles;
