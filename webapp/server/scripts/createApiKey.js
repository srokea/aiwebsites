// Tworzy konto techniczne (jesli jeszcze nie istnieje) i nowy klucz API dla niego. Klucz
// jest pokazywany TYLKO RAZ w konsoli (w bazie trzymany wylacznie jako hash, patrz
// getUserFromApiKey w auth.js) - zapisz go od razu tam, gdzie ma go uzyc konsument (np.
// zmienna srodowiskowa CALLCENTER_API_KEY po stronie Jarvisa).
//
// Uzycie:
//   node server/scripts/createApiKey.js <username> [--label "opis"] [--role user|admin|bot]
//
// Przyklad (Jarvis, pelny odczyt+zapis jak czlowiek, ale bez pojawiania sie jako "caller" -
// patrz notatka w pamieci Claude o tym, ze Jarvis ma NIE byc ograniczony do read-only):
//   node server/scripts/createApiKey.js jarvis --label "Jarvis - terminal assistant"
//
// Rola 'bot' (domyslna tutaj) ma DOKLADNIE te same prawa zapisu co 'user' - zaden PATCH
// (leady, notatki, niszy) nie sprawdza roli. Jedyna roznica: getCallers() w server/callers.js
// filtruje tylko role='user', wiec konto techniczne nie zaśmieca dropdownu "Kto dzwonil" ani
// statystyk per-osoba, i nie pojawia sie w kafelkach logowania/widgetcie "kto tu jest"
// (te tez filtruja role='user'). Uzyj --role user tylko jesli chcesz, zeby to konto UDAWALO
// czlowieka w tych miejscach - normalnie nie ma takiej potrzeby.

const crypto = require("crypto");
const db = require("../db");

function parseArgs(argv) {
  const [username, ...rest] = argv;
  const out = { username, label: "", role: "bot" };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--label") out.label = rest[++i] || "";
    if (rest[i] === "--role") out.role = rest[++i] || "user";
  }
  return out;
}

const { username, label, role } = parseArgs(process.argv.slice(2));
if (!username) {
  console.error("Uzycie: node server/scripts/createApiKey.js <username> [--label \"opis\"] [--role user|admin|bot]");
  process.exit(1);
}

let user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
if (!user) {
  const displayName = username[0].toUpperCase() + username.slice(1);
  // password_hash puste - konta technicznego (bota) nie da sie zalogowac hasłem przez
  // /login.html, tylko kluczem API (patrz requireAuth w auth.js)
  db.prepare("INSERT INTO users (username, password_hash, role, display_name) VALUES (?, '', ?, ?)").run(
    username,
    role,
    displayName
  );
  user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  console.log(`Utworzono konto techniczne "${username}" (rola: ${role}).`);
} else {
  console.log(`Konto "${username}" juz istnieje (rola: ${user.role}) - dokladam do niego nowy klucz.`);
}

const rawKey = crypto.randomBytes(32).toString("hex");
const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
db.prepare("INSERT INTO api_keys (user_id, key_hash, label) VALUES (?, ?, ?)").run(user.id, keyHash, label);

console.log("\nKlucz API (pokazany tylko raz, zapisz go teraz):");
console.log(rawKey);
console.log("\nUzycie w requescie:");
console.log(`  Authorization: Bearer ${rawKey}`);
