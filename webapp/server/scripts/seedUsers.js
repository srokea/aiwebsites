// Jednorazowy seed trzech kont (Sylwester, Nikodem, Root). Hasla NIGDY nie sa tu wpisane
// na sztywno (ten plik jest pod git) - czytane sa ze zmiennych srodowiskowych, a jesli
// ktorejs brak, skrypt losuje haslo i wypisuje je raz w konsoli. Idempotentny: konto,
// ktore juz istnieje w bazie, jest pomijane.
//
// Uzycie:
//   SEED_PW_SYLWESTER=... SEED_PW_NIKODEM=... SEED_PW_ROOT=... node server/scripts/seedUsers.js

const crypto = require("crypto");
const db = require("../db");
const { hashPassword } = require("../auth");
const { CALLER_COLORS } = require("../constants");

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

const SEEDS = [
  { username: "sylwester", display_name: "Sylwester", role: "user", color: CALLER_COLORS.Sylwester || "#6090e0", envVar: "SEED_PW_SYLWESTER" },
  { username: "nikodem", display_name: "Nikodem", role: "user", color: CALLER_COLORS.Nikodem || "#e0935c", envVar: "SEED_PW_NIKODEM" },
  { username: "root", display_name: "Root", role: "admin", color: "#c0a050", envVar: "SEED_PW_ROOT" },
];

const insert = db.prepare(
  "INSERT INTO users (username, password_hash, role, display_name, color) VALUES (@username, @password_hash, @role, @display_name, @color)"
);
const exists = db.prepare("SELECT 1 FROM users WHERE username = ?");

for (const seed of SEEDS) {
  if (exists.get(seed.username)) {
    console.log(`Konto "${seed.username}" juz istnieje - pomijam.`);
    continue;
  }
  const usedRandom = !process.env[seed.envVar];
  const password = process.env[seed.envVar] || randomPassword();
  insert.run({
    username: seed.username,
    password_hash: hashPassword(password),
    role: seed.role,
    display_name: seed.display_name,
    color: seed.color,
  });
  console.log(`Utworzono konto "${seed.username}"${usedRandom ? ` — wygenerowane haslo (zmien po pierwszym logowaniu): ${password}` : ""}`);
}

console.log("Gotowe.");
