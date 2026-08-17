const express = require("express");
const db = require("../db");
const { verifyPassword, publicUser, createSession, destroySession, getUserFromToken, requireAuth } = require("../auth");

const router = express.Router();

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// secure=req.secure zamiast na sztywno true - dziala i lokalnie po http (dev), i pod
// Cloudflare Tunnel po https (dzieki app.set("trust proxy", 1) w index.js)
function cookieOptions(req) {
  return { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: COOKIE_MAX_AGE_MS, path: "/" };
}

// GET /api/auth/tiles - publiczna (przed logowaniem!) lista kont do "kafelkow" na ekranie
// logowania, tak jak w macOS/Windows. Tylko rola 'user' - Root (admin) i przyszly Jarvis (bot)
// celowo NIE pokazuja sie jako kafelek (patrz "+" w login.js - logowanie na nie recznie po loginie).
router.get("/tiles", (req, res) => {
  const users = db.prepare("SELECT username, display_name, avatar, avatar_kind, color FROM users WHERE role = 'user' ORDER BY id").all();
  res.json(users);
});

router.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!username || !password) return res.status(400).json({ error: "Podaj login i hasło" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
  }

  const token = createSession(user.id);
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
  res.json({ user: publicUser(user) });
});

router.post("/logout", (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const session = getUserFromToken(token);
  if (session) db.prepare("DELETE FROM presence WHERE user_id = ?").run(session.id);
  destroySession(token);
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
