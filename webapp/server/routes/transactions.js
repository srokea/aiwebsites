const express = require("express");
const db = require("../db");
const { TRANSACTION_CATEGORIES } = require("../constants");
const { localDate } = require("../time");
const { financeSync, summary, perPerson, pendingDuesList } = require("../finance");

const router = express.Router();

const CATEGORY_VALUES = TRANSACTION_CATEGORIES.map((c) => c.value);
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

// "1500,50" / "1500.5" / 1500 -> grosze (integer). null gdy nie da sie sensownie sparsowac.
function toGrosze(raw) {
  const n = parseFloat(String(raw).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function listTransactions() {
  return db
    .prepare(
      `SELECT id, occurred_on, description, amount_grosze, category, source_key, created_by, created_at
       FROM transactions ORDER BY occurred_on DESC, id DESC`
    )
    .all()
    .map((t) => ({ ...t, amount: t.amount_grosze / 100, auto: t.source_key != null }));
}

// Jedna paczka dla podstrony Kasy: historia + realne sumy + naleznosci do potwierdzenia.
function bundle() {
  return {
    transactions: listTransactions(),
    summary: summary(),
    perPerson: perPerson(),
    pendingDues: pendingDuesList(),
  };
}

// GET /api/transactions - odswieza auto-posty (subskrypcje + naleznosci) i zwraca cala paczke
router.get("/", (req, res) => {
  financeSync();
  res.json(bundle());
});

// POST /api/transactions - RECZNY wpis. amount w zlotowkach (dodatnie), kierunek z category.
router.post("/", (req, res) => {
  const occurredOn = req.body.occurred_on ? String(req.body.occurred_on) : localDate();
  if (!DATE_FORMAT.test(occurredOn)) {
    return res.status(400).json({ error: `Nieprawidlowa data: "${occurredOn}"` });
  }

  const category = String(req.body.category || "");
  if (!CATEGORY_VALUES.includes(category)) {
    return res.status(400).json({ error: `Nieprawidlowa kategoria: "${category}"` });
  }

  const grosze = toGrosze(req.body.amount);
  if (grosze == null) {
    return res.status(400).json({ error: "Kwota musi byc liczba wieksza od zera" });
  }

  const description = String(req.body.description || "").trim();

  db.prepare(
    "INSERT INTO transactions (occurred_on, description, amount_grosze, category, source_key, created_by) VALUES (?, ?, ?, ?, NULL, ?)"
  ).run(occurredOn, description, grosze, category, req.user?.display_name || "");

  res.status(201).json(bundle());
});

// DELETE /api/transactions/:id - reczne wpisy mozna usuwac; auto-post (subskrypcja / potwierdzona
// naleznosc) NIE - najpierw cofnij zrodlo (tu: naleznosci nie da sie "odpotwierdzic" - to celowe).
router.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT source_key FROM transactions WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Nie znaleziono wpisu" });
  if (row.source_key != null) {
    return res.status(400).json({ error: "Tego wpisu nie można usunąć ręcznie (auto-post: subskrypcja lub potwierdzona należność)" });
  }
  db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
  res.json(bundle());
});

module.exports = router;
module.exports.transactionsBundle = bundle;
