// Lokalny czas serwera w formatach, ktore reszta appki juz uzywa w polach tekstowych
// (google_term = "YYYY-MM-DDTHH:MM", callback_when = "YYYY-MM-DD"). Trzymamy je jako zwykly
// tekst bez strefy - tak samo jak wpisane recznie przez czlowieka w UI - zeby odczyt i
// porownania po stronie SQLite (date('now','localtime')) zgadzaly sie bez konwersji.

function pad(n) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD"
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DDTHH:MM"
function localDateTime(d = new Date()) {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = { localDate, localDateTime };
