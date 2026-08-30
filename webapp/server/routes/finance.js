const express = require("express");
const { confirmDue, skipDue } = require("../finance");
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

module.exports = router;
