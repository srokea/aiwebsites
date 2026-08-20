const fs = require("fs");
const path = require("path");
const db = require("./db");

// Automatyczne kopie zapasowe zywej bazy (data/backups/, NIGDY w gicie - patrz .gitignore).
// Powstalo po incydencie 2026-08-20: baza .db byla kiedys trzymana w repo "na zyczenie" (zeby
// klonowala sie razem z appka), ale appka chodzi w trybie WAL - "git reset"/"git pull" na zywym
// pliku podmienil go na stara wersje z commita, podczas gdy prawdziwe swieze dane siedzialy w
// osobnym pliku -wal, ktorego git nigdy nie widzial. Efekt: cofniete leady, hasla, avatary -
// baza w ogole przestala sie otwierac ("malformed database schema - orphan index"). Odzyskane
// recznie (server/routes/* nietkniete, ale ~30 minut pracy). Baza produkcyjna ma teraz zyc
// TYLKO na dysku serwera (nigdy w gicie), a to tutaj jest jej siatka bezpieczenstwa.

const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");
// ile dni trzymac stare kopie, zanim zaczniemy je czyscic - baza jest mala (grosze MB), wiec
// stac nas na hojny zapas bez realnego kosztu miejsca na dysku
const RETENTION_DAYS = 30;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// db.backup() to Online Backup API SQLite - bezpieczne dla ZYWEJ, otwartej bazy (w tym w
// trybie WAL, w trakcie zapisow z innych requestow), w przeciwienstwie do zwyklego kopiowania
// pliku .db, ktore mogloby zlapac niespojny stan (dokladnie to, co nas teraz ugryzlo).
async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, `coldcall-${timestamp()}.db`);
  await db.backup(dest);
  pruneOldBackups();
  return dest;
}

function pruneOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let files;
  try {
    files = fs.readdirSync(BACKUP_DIR);
  } catch {
    return; // folder jeszcze nie istnieje - nic do czyszczenia
  }
  for (const f of files) {
    if (!f.startsWith("coldcall-") || !f.endsWith(".db")) continue;
    const full = path.join(BACKUP_DIR, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      // pojedynczy plik ktorego nie da sie skasowac/odczytac nie moze wywalic reszty czyszczenia
    }
  }
}

// Odpalane raz przy starcie serwera i potem co BACKUP_INTERVAL_MS - patrz server/index.js.
// Bledy tylko logujemy: brak jednego backupu nie powinien wywalac calej appki.
function scheduleBackups(intervalMs) {
  const attempt = () =>
    runBackup()
      .then((dest) => console.log(`[backup] zapisano ${path.basename(dest)}`))
      .catch((err) => console.error("[backup] nieudany backup bazy:", err.message));

  attempt();
  return setInterval(attempt, intervalMs);
}

module.exports = { runBackup, scheduleBackups, BACKUP_DIR };
