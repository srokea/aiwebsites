// Nanosi leady z niszy (fryzjerzy/kosmetyczki/...) na mape NFC -> tabela lead_pins.
// leads NIETKNIETE. Idempotentne: domyslnie pomija leady z juz istniejacym pinem (--force przelicza).
//
//   node server/scripts/geocodeLeads.js                 # nisze fryzjer/barber/kosmet. (auto)
//   node server/scripts/geocodeLeads.js --niche=kosmetyczki,s
//   node server/scripts/geocodeLeads.js --all           # wszystkie nisze
//   node server/scripts/geocodeLeads.js --force          # przelicz tez juz zapisane
//   node server/scripts/geocodeLeads.js --offline        # bez Nominatim (tylko dokladne z seeda)
//
// GLOWNE ZRODLO: server/scripts/leadCoords.seed.json - wspolrzedne wyciagniete z linkow Google
// Maps (!3d<lat>!4d<lng>) ze scrapa (leads/*.json), dopasowane po TELEFONIE, potem po NAZWIE+MIESCIE.
// To daje pinezke DOKLADNIE tam gdzie firma (precision 'exact').
// FALLBACK: Nominatim po samym miescie -> pinezka orientacyjna w srodku miasta (precision 'city').

const fs = require("fs");
const path = require("path");
const db = require("../db");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ALL = args.includes("--all");
const OFFLINE = args.includes("--offline");
const nicheArg = (args.find((a) => a.startsWith("--niche=")) || "").split("=")[1];
const NICHE_RE = /fryz|barber|kosmet|beauty|uroda|paznok|brwi|rzęs|rzes/i;

const UA = "mmates-coldcall-map/1.0 (internal tool; contact: project6osss@gmail.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normPhone = (p) => String(p || "").replace(/\D/g, "").replace(/^48(?=\d{9}$)/, "");
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-ząćęłńóśźż0-9]+/g, "");
const nameKey = (name, city) => `${normName(name)}|${String(city || "").toLowerCase().trim()}`;

function loadSeed() {
  const file = path.join(__dirname, "leadCoords.seed.json");
  if (!fs.existsSync(file)) {
    console.error(`Brak ${file} - wspolrzedne beda tylko z Nominatim (srodek miasta).`);
    return { byPhone: {}, byName: {} };
  }
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  return { byPhone: j.byPhone || {}, byName: j.byName || {} };
}

function pickNiches() {
  const all = db.prepare("SELECT id, slug, name FROM niches ORDER BY id").all();
  if (ALL) return all;
  if (nicheArg) {
    const want = nicheArg.split(",").map((s) => s.trim().toLowerCase());
    return all.filter((n) => want.includes(n.slug.toLowerCase()));
  }
  return all.filter((n) => NICHE_RE.test(`${n.slug} ${n.name}`));
}

async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=${encodeURIComponent(
    `${city}, Polska`
  )}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pl" } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

async function main() {
  const { byPhone, byName } = loadSeed();
  console.log(`Seed: ${Object.keys(byPhone).length} po telefonie, ${Object.keys(byName).length} po nazwie`);

  const niches = pickNiches();
  if (!niches.length) {
    console.error("Nie znalazlem zadnej niszy. Uzyj --niche=slug lub --all.");
    process.exit(1);
  }
  console.log("Nisze:", niches.map((n) => `${n.slug} (${n.name})`).join(", "));

  const nicheIds = niches.map((n) => n.id);
  const leads = db
    .prepare(
      `SELECT id, company_name, city, phone FROM leads
       WHERE niche_id IN (${nicheIds.map(() => "?").join(",")})
       ORDER BY city, company_name`
    )
    .all(...nicheIds);

  const have = new Set(db.prepare("SELECT lead_id FROM lead_pins").all().map((r) => r.lead_id));
  const todo = FORCE ? leads : leads.filter((l) => !have.has(l.id));
  console.log(`Leadow: ${leads.length} | do zrobienia: ${todo.length} | juz z pinem: ${leads.length - todo.length}`);

  const upsert = db.prepare(
    `INSERT INTO lead_pins (lead_id, lat, lng, precision, geocoded_at)
     VALUES (@lead_id, @lat, @lng, @precision, datetime('now'))
     ON CONFLICT(lead_id) DO UPDATE SET lat=@lat, lng=@lng, precision=@precision, geocoded_at=datetime('now')`
  );

  const cityCache = new Map();
  let exact = 0;
  let cityOnly = 0;
  let missing = 0;

  for (let i = 0; i < todo.length; i++) {
    const l = todo[i];
    const tag = `[${i + 1}/${todo.length}] ${l.company_name} — ${l.city || "?"}`;

    // 1) dokladne wspolrzedne z seeda: po telefonie, potem po nazwie+miescie
    let hit = byPhone[normPhone(l.phone)] || byName[nameKey(l.company_name, l.city)];
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
      upsert.run({ lead_id: l.id, lat: hit.lat, lng: hit.lng, precision: "exact" });
      exact++;
      console.log(`  ✓ ${tag}  ${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}`);
      continue;
    }

    // 2) fallback: srodek miasta (Nominatim, 1 zapytanie/s, cache per miasto)
    if (!OFFLINE && l.city) {
      try {
        let pt;
        if (cityCache.has(l.city)) {
          pt = cityCache.get(l.city);
        } else {
          pt = await geocodeCity(l.city);
          cityCache.set(l.city, pt);
          await sleep(1100);
        }
        if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
          upsert.run({ lead_id: l.id, lat: pt.lat, lng: pt.lng, precision: "city" });
          cityOnly++;
          console.log(`  ~ ${tag}  ${pt.lat.toFixed(5)},${pt.lng.toFixed(5)} (środek miasta)`);
          continue;
        }
      } catch (err) {
        console.log(`  ! ${tag}  Nominatim: ${err.message}`);
        await sleep(2000);
      }
    }

    missing++;
    console.log(`  ✗ ${tag}  (bez pinezki)`);
  }

  console.log(`\nGotowe. Dokładne: ${exact} | środek miasta: ${cityOnly} | bez pinezki: ${missing}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
