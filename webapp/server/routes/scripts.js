const express = require("express");
const db = require("../db");

const router = express.Router();

const NICHE_SCRIPTS = {
  kosmetyczki: require("../scriptsData/kosmetyczki"),
};
const DEFAULT_SCRIPT = require("../scriptsData/default");

// GET /api/scripts/lead/:leadId - buduje scheme rozmowy dopasowany do leada
router.get("/lead/:leadId", (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.leadId);
  if (!lead) return res.status(404).json({ error: "Nie znaleziono leada" });

  const niche = db.prepare("SELECT * FROM niches WHERE id = ?").get(lead.niche_id);
  const generator = NICHE_SCRIPTS[niche.slug] || DEFAULT_SCRIPT;
  const script = generator.buildScript(lead, niche);

  res.json({ lead, niche, script });
});

module.exports = router;
