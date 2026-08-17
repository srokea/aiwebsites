const express = require("express");
const db = require("../db");

const router = express.Router();

// Obecnosc NIE wygasa po kilku sekundach - trzyma sie tego samego leada dopoki uzytkownik
// nie kliknie innego (patrz activeRowId/setActiveRow w niche.js) albo nie opusci strony
// (patrz POST /leave, wysylane przez navigator.sendBeacon na pagehide). Ponizszy limit to
// tylko siatka bezpieczenstwa na wypadek awarii (zamkniecie laptopa, crash karty) - zeby
// czyjes "jestem tu" nie wisialo nad leadem w nieskonczonosc, gdyby pagehide sie nie wykonal.
const SAFETY_NET_WINDOW_SQL = "datetime('now', '-12 hours')";

// lead_id = 0 to sentinel "jestem na tej niszy, ale nie kliknalem jeszcze zadnego leada"
// (wysylane od razu po wejsciu w nisze, patrz init() w niche.js) - odrozniony od prawdziwego
// leada, zeby dashboard (GET /summary) wiedzial "ktos jest w tej niszy" nawet bez klikniecia.
// niche_id = 0 to sentinel "jestem w appce, ale nie na konkretnej niszy" (dashboard/scheme
// rozmowy, patrz index.js/script.js) - uzywane tylko przez GET /online (globalny status).
router.post("/", (req, res) => {
  const leadId = Number(req.body.lead_id);
  const nicheId = Number(req.body.niche_id);
  if (!Number.isInteger(leadId) || leadId < 0 || !Number.isInteger(nicheId) || nicheId < 0) {
    return res.status(400).json({ error: "Brak lead_id/niche_id" });
  }

  db.prepare(
    `INSERT INTO presence (user_id, lead_id, niche_id, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET lead_id = excluded.lead_id, niche_id = excluded.niche_id, updated_at = excluded.updated_at`
  ).run(req.user.id, leadId, nicheId);

  res.json({ ok: true });
});

// wywolywane przez navigator.sendBeacon przy zamknieciu karty/nawigacji (patrz niche.js) -
// natychmiast usuwa obecnosc, zeby dymek nie czekal na wygasniecie siatki bezpieczenstwa
router.post("/leave", (req, res) => {
  db.prepare("DELETE FROM presence WHERE user_id = ?").run(req.user.id);
  res.json({ ok: true });
});

// polling per-nisza (patrz niche.js) - kto inny (nie ja) jest aktywny na KONKRETNYCH leadach
// tej niszy (lead_id=0 = "na niszy, bez konkretnego leada" - pomijamy, bo nie ma czego podswietlic)
router.get("/", (req, res) => {
  const nicheId = Number(req.query.niche_id);
  if (!nicheId) return res.status(400).json({ error: "Brak niche_id" });

  const rows = db
    .prepare(
      `SELECT p.lead_id, u.display_name, u.color FROM presence p JOIN users u ON u.id = p.user_id
       WHERE p.niche_id = ? AND p.user_id != ? AND p.lead_id != 0 AND p.updated_at > ${SAFETY_NET_WINDOW_SQL}`
    )
    .all(nicheId, req.user.id);

  res.json(rows);
});

// podsumowanie dla dashboardu (index.js) - kto inny (nie ja) jest teraz w KTOREJ niszy,
// niezaleznie czy ma kliknietego konkretnego leada - jeden wiersz per (nisza, osoba)
router.get("/summary", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.niche_id, u.display_name, u.avatar, u.avatar_kind, u.color
       FROM presence p JOIN users u ON u.id = p.user_id
       WHERE p.user_id != ? AND p.updated_at > ${SAFETY_NET_WINDOW_SQL}`
    )
    .all(req.user.id);

  res.json(rows);
});

// globalny status "kto jest teraz w appce" dla dashboardu (index.js) - niezaleznie od niszy,
// wlacznie z Toba samym (w przeciwienstwie do / i /summary, ktore pokazuja tylko INNYCH -
// tu chodzi o zespolowy status "X/Y online", wiec Twoja wlasna obecnosc tez sie liczy).
// Tylko konta z rola 'user' (Root/admin i przyszle boty to konta techniczne, nie osoby ktore dzwonia).
router.get("/online", (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.display_name, u.avatar, u.avatar_kind, u.color,
              EXISTS(SELECT 1 FROM presence p WHERE p.user_id = u.id AND p.updated_at > ${SAFETY_NET_WINDOW_SQL}) AS online
       FROM users u WHERE u.role = 'user' ORDER BY u.id`
    )
    .all();

  res.json(rows.map((r) => ({ ...r, online: !!r.online })));
});

module.exports = router;
