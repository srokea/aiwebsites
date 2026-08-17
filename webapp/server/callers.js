const db = require("./db");

// Zrodlo prawdy dla "Kto dzwonil" to dzis konta z tabeli users (nie sztywna lista w
// constants.js) - kazde konto z rola 'user' jest automatycznie opcja w dropdownie, a zmiana
// wyswietlanej nazwy konta przepisuje tez wszystkie juz zapisane leady (patrz PATCH
// /api/users/:id w routes/users.js). Dowolna osoba moze wybrac dowolnego callera z listy -
// to swiadome (czasem dzwoni sie "za" kogos innego). Root (admin) i przyszli boty (Jarvis)
// NIE sa callerami - to konta techniczne/administracyjne, nie osoby ktore dzwonia.
function getCallers() {
  return db.prepare("SELECT display_name, color FROM users WHERE role = 'user' ORDER BY id").all();
}

function getCallerNames() {
  return getCallers().map((c) => c.display_name);
}

module.exports = { getCallers, getCallerNames };
