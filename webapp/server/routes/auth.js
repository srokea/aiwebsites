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

// Limit blednych logowan per IP - od kiedy w bazie jest PESEL i nr konta (modul Klienci), hasla
// nie da sie juz zgadywac bez konca. W pamieci procesu (restart = czysta karta - to wystarczy).
// Pod Cloudflare Tunnel prawdziwy adres klienta jest w CF-Connecting-IP.
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFails = new Map(); // ip -> { count, since }

function clientIp(req) {
  return req.get("cf-connecting-ip") || req.ip || "";
}

function loginBlockedFor(ip) {
  const entry = loginFails.get(ip);
  if (!entry) return 0;
  const left = entry.since + LOGIN_WINDOW_MS - Date.now();
  if (left <= 0) {
    loginFails.delete(ip);
    return 0;
  }
  return entry.count >= LOGIN_MAX_FAILS ? left : 0;
}

function registerLoginFail(ip) {
  const entry = loginFails.get(ip);
  if (!entry || entry.since + LOGIN_WINDOW_MS < Date.now()) loginFails.set(ip, { count: 1, since: Date.now() });
  else entry.count += 1;
}

router.post("/login", (req, res) => {
  const ip = clientIp(req);
  const blockedMs = loginBlockedFor(ip);
  if (blockedMs) {
    return res
      .status(429)
      .json({ error: `Za dużo nieudanych prób — spróbuj za ${Math.ceil(blockedMs / 60000)} min` });
  }

  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!username || !password) return res.status(400).json({ error: "Podaj login i hasło" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    registerLoginFail(ip);
    return res.status(401).json({ error: "Nieprawidłowy login lub hasło" });
  }
  loginFails.delete(ip);

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
