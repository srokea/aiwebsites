const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return hash ? bcrypt.compareSync(password, hash) : false;
}

function publicUser(u) {
  if (!u) return null;
  const { id, username, role, display_name, avatar, avatar_kind, color, created_at } = u;
  return { id, username, role, display_name, avatar, avatar_kind, color, created_at };
}

// Sesje trzymane w SQLite (nie w pamieci) - przezywaja restart serwera, wspolne dla
// wszystkich urzadzen zalogowanych na to samo konto. Wygasniecie liczone przez SQLite
// (datetime('now', ...)), zeby format daty byl spojny z reszta bazy (patrz db.js).
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(
    token,
    userId
  );
  return token;
}

function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getUserFromToken(token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .get(token) || null
  );
}

// Zaczep pod przyszle konto Jarvisa (bot bez UI) - klucz podawany jako
// "Authorization: Bearer <klucz>", trzymany w bazie tylko jako hash (sha256).
// Dzis nieuzywane przez zaden endpoint, ale requireAuth juz to obsluguje.
function getUserFromApiKey(rawKey) {
  if (!rawKey) return null;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const row = db.prepare(`SELECT u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?`).get(keyHash);
  if (row) db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE key_hash = ?").run(keyHash);
  return row || null;
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  let user = token ? getUserFromToken(token) : null;

  if (!user) {
    const header = req.get("authorization") || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    user = bearer ? getUserFromApiKey(bearer) : null;
  }

  if (!user) return res.status(401).json({ error: "Niezalogowany" });
  req.user = publicUser(user);
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Wymagane uprawnienia administratora" });
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  getUserFromToken,
  getUserFromApiKey,
  requireAuth,
  requireAdmin,
};
