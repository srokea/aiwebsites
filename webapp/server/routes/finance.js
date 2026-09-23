const express = require("express");
const { confirmDue, skipDue, setClientPricing } = require("../finance");
const { transactionsBundle } = require("./transactions");

const router = express.Router();

// POST /api/finance/dues/:id/confirm - klient zaplacil: tworzy wpis przychodu w historii,
// naleznosc znika z listy do potwierdzenia. Zwraca cala paczke Kasy (jak GET /api/transactions).
router.post("/dues/:id/confirm", (req, res) => {
  const r = confirmDue(Number(req.params.id), req.user?.display_name || "");
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(transactionsBundle());
});

// POST /api/finance/dues/:id/skip - klient nie zaplacil / zrezygnowal za ten okres:
// naleznosc znika z listy bez tworzenia wpisu.
router.post("/dues/:id/skip", (req, res) => {
  const r = skipDue(Number(req.params.id), req.user?.display_name || "");
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(transactionsBundle());
});

// "300" / "250,50" -> grosze; puste / brak -> null (= cena domyslna). undefined gdy smieci.
function priceToGrosze(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

// PUT /api/finance/clients/:leadId/pricing - #6 indywidualna cena klienta.
// Body: { onetime, monthly, applyConfirmed }. Puste pole = cena domyslna (300 / 100).
router.put("/clients/:leadId/pricing", (req, res) => {
  const onetimeG = priceToGrosze(req.body.onetime);
  const monthlyG = priceToGrosze(req.body.monthly);
  if (onetimeG === undefined || monthlyG === undefined) {
    return res.status(400).json({ error: "Kwota musi być liczbą (np. 250 albo 250,50)" });
  }
  const r = setClientPricing(
    Number(req.params.leadId),
    onetimeG,
    monthlyG,
    Boolean(req.body.applyConfirmed),
    req.user?.display_name || ""
  );
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json(transactionsBundle());
});

module.exports = router;
