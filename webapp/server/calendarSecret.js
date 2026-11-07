// Szyfrowanie hasel do aplikacji Apple (parowanie kalendarza iCloud). Haslo musi byc odwracalne
// (wysylamy je przy kazdym zapisie do CalDAV), wiec nie hash, tylko AES-256-GCM.
//
// Klucz: zmienna CALENDAR_SECRET z .env (dowolny dlugi tekst), a gdy jej brak - losowy klucz
// generowany raz do data/calendar.key. Plik bazy i jej kopie w data/backups/ same w sobie nie
// zdradzaja wiec hasla - do tego trzeba jeszcze klucza.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEY_FILE = path.join(__dirname, "..", "data", "calendar.key");
let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  if (process.env.CALENDAR_SECRET) {
    cachedKey = crypto.createHash("sha256").update(process.env.CALENDAR_SECRET).digest();
    return cachedKey;
  }
  try {
    cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
    if (cachedKey.length === 32) return cachedKey;
  } catch {
    // brak pliku - generujemy ponizej
  }
  cachedKey = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, cachedKey.toString("hex"), { mode: 0o600 });
  return cachedKey;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function decrypt(stored) {
  const [version, iv, tag, data] = String(stored || "").split(":");
  if (version !== "v1") throw new Error("Nieznany format zaszyfrowanego hasła");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
