// Jednorazowe geokodowanie leadow na mape NFC. Uruchom NA SERWERZE (tam gdzie zyje baza):
//
//   node server/scripts/geocodeLeads.js                 # nisze fryzjer/barber/kosmet. (auto)
//   node server/scripts/geocodeLeads.js --niche=fryzjerzy,kosmetyczki
//   node server/scripts/geocodeLeads.js --all           # wszystkie nisze
//   node server/scripts/geocodeLeads.js --force          # przelicz tez juz zapisane
//
// Zapis do tabeli lead_pins (tabela leads NIETKNIETA). Idempotentne: domyslnie pomija leady,
// ktore juz maja pin. Nominatim ToS => max 1 zapytanie/s, wlasny User-Agent.

const db = require("../db");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ALL = args.includes("--all");
const nicheArg = (args.find((a) => a.startsWith("--niche=")) || "").split("=")[1];
const NICHE_RE = /fryz|barber|kosmet|beauty|uroda|paznok|brwi|rzęs|rzes/i;

const UA = "mmates-coldcall-map/1.0 (internal tool; contact: project6osss@gmail.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickNiches() {
  const all = db.prepare("SELECT id, slug, name FROM niches ORDER BY id").all();
  if (ALL) return all;
  if (nicheArg) {
    const want = nicheArg.split(",").map((s) => s.trim().toLowerCase());
    return all.filter((n) => want.includes(n.slug.toLowerCase()));
  }
  return all.filter((n) => NICHE_RE.test(`${n.slug} ${n.name}`));
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pl" } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  const hit = data[0];
  return { lat: Number(hit.lat), lng: Number(hit.lon) };
}

async function main() {
  const niches = pickNiches();
  if (!niches.length) {
    console.error("Nie znalazlem zadnej niszy do geokodowania. Uzyj --niche=slug lub --all.");
    process.exit(1);
  }
  console.log("Nisze:", niches.map((n) => n.slug).join(", "));

  const nicheIds = niches.map((n) => n.id);
  const leads = db
    .prepare(
      `SELECT id, company_name, city FROM leads
       WHERE niche_id IN (${nicheIds.map(() => "?").join(",")})
       ORDER BY city, company_name`
    )
    .all(...nicheIds);

  const has = new Set(db.prepare("SELECT lead_id FROM lead_pins").all().map((r) => r.lead_id));
  const todo = FORCE ? leads : leads.filter((l) => !has.has(l.id));
  console.log(`Leadow: ${leads.length} | do zrobienia: ${todo.length} | juz z pinem: ${leads.length - todo.length}`);

  const upsert = db.prepare(
    `INSERT INTO lead_pins (lead_id, lat, lng, precision, geocoded_at)
     VALUES (@lead_id, @lat, @lng, @precision, datetime('now'))
     ON CONFLICT(lead_id) DO UPDATE SET lat=@lat, lng=@lng, precision=@precision, geocoded_at=datetime('now')`
  );

  const cityCache = new Map();
  let exact = 0;
  let cityOnly = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i++) {
    const lead = todo[i];
    const tag = `[${i + 1}/${todo.length}] ${lead.company_name} — ${lead.city || "?"}`;
    try {
      let pt = null;
      let precision = "exact";

      if (lead.company_name && lead.city) {
        pt = await geocode(`${lead.company_name}, ${lead.city}, Polska`);
        await sleep(1100);
      }

      if (!pt && lead.city) {
        precision = "city";
        if (cityCache.has(lead.city)) {
          pt = cityCache.get(lead.city);
        } else {
          pt = await geocode(`${lead.city}, Polska`);
          await sleep(1100);
          cityCache.set(lead.city, pt);
        }
      }

      if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) {
        failed++;
        console.log(`  ✗ ${tag}  (brak wyniku)`);
        continue;
      }

      upsert.run({ lead_id: lead.id, lat: pt.lat, lng: pt.lng, precision });
      if (precision === "exact") exact++;
      else cityOnly++;
      console.log(`  ${precision === "exact" ? "✓" : "~"} ${tag}  ${pt.lat.toFixed(5)},${pt.lng.toFixed(5)} (${precision})`);
    } catch (err) {
      failed++;
      console.log(`  ! ${tag}  BŁĄD: ${err.message}`);
      await sleep(2000);
    }
  }

  console.log(`\nGotowe. Dokładne: ${exact} | tylko miasto: ${cityOnly} | nieudane: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
