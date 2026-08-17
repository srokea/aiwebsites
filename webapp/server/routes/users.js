const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("../db");
const { hashPassword, verifyPassword, publicUser, requireAdmin } = require("../auth");

const router = express.Router();

const AVATARS_DIR = path.join(__dirname, "..", "..", "data", "avatars");
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const AVATAR_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype in AVATAR_MIME_EXT),
});

// usuwa stary plik zdjecia (jesli byl) - zeby wgranie nowego albo powrot do emoji
// nie zostawialy sierot na dysku (patrz PATCH i POST /avatar-photo ponizej)
function deleteOldPhoto(user) {
  if (user.avatar_kind !== "photo" || !user.avatar) return;
  fs.unlink(path.join(AVATARS_DIR, path.basename(user.avatar)), () => {}); // best-effort
}

// Lista kont - uzywana w widgetcie "zalogowany jako" i przy budowie dymkow "kto tu jest"
// (kolor/nick danej osoby). Zadna sciezka ponizej nie zwraca password_hash.
router.get("/", (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY id").all();
  res.json(users.map(publicUser));
});

// avatar (emoji)/nick/kolor - kazdy edytuje siebie, Root edytuje kazdego (patrz CLAUDE kontekst appki)
router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const isSelf = req.user.id === id;
  if (!isSelf && req.user.role !== "admin") {
    return res.status(403).json({ error: "Możesz edytować tylko swój profil" });
  }

  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Nie znaleziono użytkownika" });

  const updates = {};
  for (const field of ["display_name", "color"]) {
    if (!(field in req.body)) continue;
    const value = String(req.body[field] ?? "").trim();
    if (field === "display_name" && !value) return res.status(400).json({ error: "Nazwa nie może być pusta" });
    updates[field] = value;
  }
  // wpisanie tekstu/emoji w tym polu = powrot do trybu "emoji" (wgrywanie zdjecia ma
  // osobny endpoint ponizej) - stare zdjecie (jesli bylo) czyscimy z dysku
  if ("avatar" in req.body) {
    updates.avatar = String(req.body.avatar ?? "").trim();
    updates.avatar_kind = "emoji";
    deleteOldPhoto(target);
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Brak pól do aktualizacji" });

  const setClauses = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");

  // "Kto dzwonił" na leadach to zwykly tekst, nie odwolanie do konta - jesli zmieniamy
  // wyswietlana nazwe, przepisujemy tez wszystkie juz zapisane leady na nowa nazwe,
  // zeby stara nazwa nie zostala "osierocona" w historii (i zniknela z dropdownu)
  db.transaction(() => {
    db.prepare(`UPDATE users SET ${setClauses} WHERE id = @id`).run({ ...updates, id });
    if (updates.display_name && updates.display_name !== target.display_name) {
      db.prepare("UPDATE leads SET caller = ? WHERE caller = ?").run(updates.display_name, target.display_name);
    }
  })();

  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
});

// avatar jako wgrane zdjecie (JPG/PNG/WEBP, max 2MB) - alternatywa dla emoji powyzej
router.post(
  "/:id/avatar-photo",
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (!err) return next();
      const message = err.code === "LIMIT_FILE_SIZE" ? "Plik za duży (max 2 MB)" : "Nie udało się wgrać pliku";
      res.status(400).json({ error: message });
    });
  },
  (req, res) => {
    const id = Number(req.params.id);
    const isSelf = req.user.id === id;
    if (!isSelf && req.user.role !== "admin") {
      return res.status(403).json({ error: "Możesz edytować tylko swój profil" });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) return res.status(404).json({ error: "Nie znaleziono użytkownika" });
    if (!req.file) return res.status(400).json({ error: "Dozwolone pliki: JPG, PNG, WEBP (max 2 MB)" });

    deleteOldPhoto(target);
    const filename = `${id}-${Date.now()}.${AVATAR_MIME_EXT[req.file.mimetype]}`;
    fs.writeFileSync(path.join(AVATARS_DIR, filename), req.file.buffer);
    db.prepare("UPDATE users SET avatar = ?, avatar_kind = 'photo' WHERE id = ?").run(`/avatars/${filename}`, id);

    res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
  }
);

// zmiana wlasnego hasla - wymaga podania biezacego (nie dotyczy admina resetujacego komus innemu)
router.post("/:id/password", (req, res) => {
  const id = Number(req.params.id);
  if (req.user.id !== id) return res.status(403).json({ error: "Możesz zmienić tylko własne hasło" });

  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Nie znaleziono użytkownika" });

  const newPassword = String(req.body.newPassword || "");
  if (!verifyPassword(String(req.body.currentPassword || ""), target.password_hash)) {
    return res.status(401).json({ error: "Bieżące hasło jest nieprawidłowe" });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: "Nowe hasło musi mieć co najmniej 6 znaków" });

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), id);
  res.json({ ok: true });
});

// admin resetuje haslo innego uzytkownika (furtka odzyskiwania dostepu) - bez znajomosci starego hasla
router.post("/:id/reset-password", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Nie znaleziono użytkownika" });

  const newPassword = String(req.body.newPassword || "");
  if (newPassword.length < 6) return res.status(400).json({ error: "Nowe hasło musi mieć co najmniej 6 znaków" });

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), id);
  res.json({ ok: true });
});

module.exports = router;
