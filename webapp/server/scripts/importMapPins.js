// Wgrywa piny OSM (firmy/instytucje Piotrkowa Tryb.) do tabeli map_pins z pliku
// server/scripts/mapPins.seed.json. Uruchom RAZ na serwerze po deployu mapy:
//
//   node server/scripts/importMapPins.js
//
// Dane pinow (osm_id, nazwa, kategoria, wspolrzedne, adres) NIE sa w bazie produkcyjnej -
// import OSM zrobil sie kiedys tylko na lokalnej kopii. Ten skrypt to nadrabia.
// Idempotentny: INSERT OR IGNORE po unikalnym osm_id, wiec kolejne uruchomienia nic nie psuja
// i NIE ruszaja juz ustawionego statusu / notatek / "byłem tu" na istniejacych pinach.

const fs = require("fs");
const path = require("path");
const db = require("../db");

const file = path.join(__dirname, "mapPins.seed.json");
if (!fs.existsSync(file)) {
  console.error(`Brak pliku: ${file}`);
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(file, "utf8"));
console.log(`Plik: ${rows.length} pinów`);

const before = db.prepare("SELECT COUNT(*) c FROM map_pins").get().c;

const insert = db.prepare(
  `INSERT OR IGNORE INTO map_pins (osm_id, name, category, lat, lng, address, street, phone, website)
   VALUES (@osm_id, @name, @category, @lat, @lng, @address, @street, @phone, @website)`
);

let skipped = 0;
const run = db.transaction((list) => {
  for (const r of list) {
    if (!r.osm_id || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
      skipped++;
      continue;
    }
    insert.run({
      osm_id: String(r.osm_id),
      name: r.name || "",
      category: r.category || "",
      lat: r.lat,
      lng: r.lng,
      address: r.address || "",
      street: r.street || "",
      phone: r.phone || "",
      website: r.website || "",
    });
  }
});
run(rows);

const after = db.prepare("SELECT COUNT(*) c FROM map_pins").get().c;
console.log(`map_pins: ${before} -> ${after}  (dodane: ${after - before}, pominięte w pliku: ${skipped}, już były: ${rows.length - skipped - (after - before)})`);
