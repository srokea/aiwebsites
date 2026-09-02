const express = require("express");
const db = require("../db");
const { INTERESTED_OPTIONS } = require("../constants");
const { getCallerNames } = require("../callers");
const { localDateTime } = require("../time");

const router = express.Router();

// Mapa sluzy do OBCHODU MIASTA pod karty NFC (chodzenie od firmy do firmy), nie pod cold calle.
// Dlatego stan punktu ma tylko 4 wartosci - reszta statusow z cold calli tu nie ma sensu.
const MAP_STATUS_ORDER = ["nieruszone", "brak_wlasciciela", "nie", "dopiete"];
const MAP_STATUSES = MAP_STATUS_ORDER.map((v) => INTERESTED_OPTIONS.find((o) => o.value === v)).filter(Boolean);
const STATUS_VALUES = new Set(MAP_STATUSES.map((o) => o.value));

// Piny pochodza z OpenStreetMap (tabela map_pins, ~400 firm/instytucji w Piotrkowie Tryb.).
// Ta trasa ich NIE importuje i NIE kasuje z bazy - filtruje je tylko przy odczycie, zeby na
// mapie zostaly WYLACZNIE lokalne firmy/uslugi, gdzie opinie Google maja sens i mozna sprzedac
// karte NFC. Odsiew jest odwracalny (zmiana list ponizej), baza nietknieta.

// Kategorie OSM ktorych NIE chcemy: instytucje, sieciowki, infrastruktura.
const EXCLUDED_CATEGORIES = new Set([
  "school", "kindergarten", "university", "college", "language_school", "driving_school", "music_school",
  "library", "place_of_worship", "monastery", "community_centre", "social_centre", "arts_centre",
  "townhall", "government", "public_building", "police", "fire_station", "courthouse", "prison",
  "ranger_station", "post_office", "post_box", "post_depot",
  "bank", "atm", "bureau_de_change", "mobile_money_agent", "money_transfer",
  "fuel", "charging_station",
  "supermarket", "hypermarket", "mall", "department_store", "wholesale", "chemist",
  "hospital", "nursing_home", "social_facility", "dormitory",
  "parking", "parking_space", "parking_entrance", "bicycle_parking", "motorcycle_parking",
  "taxi", "bus_station", "ferry_terminal", "car_sharing",
  "cemetery", "grave_yard", "recycling", "waste_disposal", "waste_basket", "sanitary_dump_station",
  "toilets", "shower", "drinking_water", "water_point", "fountain", "bench", "shelter", "bbq",
  "picnic_table", "vending_machine", "telephone", "clock", "hunting_stand", "watering_place",
  "monument", "memorial", "artwork", "information", "townhall",
  "museum", "theatre", "cinema", "gallery", "archive", "religion", "research_institute",
  "train_station", "railway_station", "bus_stop", "station", "theme_park", "zoo", "attraction",
  // te branze pokrywaja sie z naszymi niszami - na mapie maja isc z warstwy "Leady", nie z OSM:
  "hairdresser", "beauty", "hairdresser_supply", "pet_grooming", "animal_grooming", "dog_grooming",
]);

// Salony/gabinety czasem sa w OSM pod ogolna kategoria - odsiew tez po nazwie (te branze = nasze
// nisze). Testujemy na deburr(name), wiec wzorzec jest bez ogonkow.
const NICHE_NAME_RE =
  /fryzjer|barber|kosmetyczk|kosmetolog|gabinet kosmet|salon urody|studio urody|salon piekno|paznokc|manicure|pedicure|stylizacja rzes|brow bar|lash|groomer|salon dla ps|strzyzenie ps|psi fryzjer/i;

// Sieciowki / znane marki - odsiew po nazwie (dowolna kategoria). Male, lokalne firmy zostaja.
const CHAIN_RE = new RegExp(
  [
    "żabka", "zabka", "biedronka", "lidl", "\\bdino\\b", "\\bnetto\\b", "\\baldi\\b", "kaufland",
    "auchan", "carrefour", "tesco", "lewiatan", "delikatesy centrum", "\\bgroszek\\b", "freshmarket",
    "fresh market", "społem", "spolem", "stokrotka", "polomarket", "polo market", "\\btopaz\\b",
    "chata polska", "kefirek", "intermarche", "\\be\\.?leclerc\\b", "makro",
    "rossmann", "\\bhebe\\b", "super-?pharm", "\\bdoz\\b", "apteka gemini", "dr ?max", "\\bziko\\b",
    "dbam o zdrowie", "cef[ae]rm", "apteka nova",
    "mcdonald", "\\bkfc\\b", "burger king", "\\bsubway\\b", "pizza hut", "telepizza", "domino",
    "north fish", "\\bolimp\\b", "\\bsphinx\\b", "da grasso", "biesiadowo", "gruby benek",
    "orlen", "\\bbp\\b", "\\bshell\\b", "circle k", "\\blotos\\b", "\\bmoya\\b", "\\bamic\\b", "\\bavia\\b",
    "santander", "\\bpko\\b", "pekao", "\\bmbank\\b", "\\bing\\b", "millennium", "alior",
    "credit agricole", "bnp paribas", "\\bciti", "nest bank", "getin", "velo ?bank",
    "poczta polska",
    "media markt", "rtv euro agd", "x-?kom", "komputronik", "\\bneonet\\b", "media expert",
    "\\bempik\\b", "\\bcropp\\b", "\\bhouse\\b", "reserved", "sinsay", "mohito", "\\bccc\\b",
    "deichmann", "half price", "\\bkik\\b", "\\bpepco\\b", "\\btedi\\b", "\\baction\\b", "\\bdealz\\b",
    "\\bsmyk\\b", "\\b4f\\b", "martes sport", "decathlon", "go sport",
    "\\bjysk\\b", "\\bagata\\b", "black red white", "\\babra\\b",
    "\\bplay\\b", "\\bplus\\b", "orange", "t-?mobile", "\\bnju\\b",
    "leroy merlin", "castorama", "\\bobi\\b", "bricomarche", "psb mrówka", "psb mrowka",
  ].join("|"),
  "i"
);

// bez ogonkow (Bricomarché -> bricomarche, Żabka -> zabka) - regex moze byc czysto ASCII
const deburr = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
const isChain = (name) => CHAIN_RE.test(deburr(name));
const isOurNiche = (name) => NICHE_NAME_RE.test(deburr(name));
const keepPin = (p) =>
  p.category !== "" && !EXCLUDED_CATEGORIES.has(p.category) && !isChain(p.name) && !isOurNiche(p.name);

const PIN_COLUMNS =
  "id, name, category, lat, lng, address, street, phone, website, status, notes, caller, last_visited_at";

// GET /api/map - piny (juz odsiane) + slowniki do overlayow (ulice, kategorie z tego co zostalo,
// dozwolone statusy, dzwoniacy).
router.get("/", (req, res) => {
  const all = db
    .prepare(`SELECT ${PIN_COLUMNS} FROM map_pins ORDER BY street COLLATE NOCASE, name COLLATE NOCASE`)
    .all();
  const pins = all.filter(keepPin);

  const byStreet = new Map();
  const byCategory = new Map();
  for (const p of pins) {
    if (p.street) byStreet.set(p.street, (byStreet.get(p.street) || 0) + 1);
    if (p.category) byCategory.set(p.category, (byCategory.get(p.category) || 0) + 1);
  }
  const streets = [...byStreet.entries()]
    .map(([street, c]) => ({ street, c }))
    .sort((a, b) => a.street.localeCompare(b.street, "pl"));
  const categories = [...byCategory.entries()]
    .map(([category, c]) => ({ category, c }))
    .sort((a, b) => b.c - a.c);

  // Leady z niszy (fryzjer/kosmet. itd.) naniesione osobna warstwa - tylko te, ktore maja juz
  // wspolrzedne w lead_pins (wypelnia je skrypt geocodeLeads.js). Kolor = realny status leada.
  const leads = db
    .prepare(
      `SELECT l.id AS lead_id, l.company_name, l.city, l.phone, l.interested, l.caller,
              n.slug AS niche_slug, n.name AS niche_name,
              lp.lat, lp.lng, lp.precision
       FROM lead_pins lp
       JOIN leads l ON l.id = lp.lead_id
       JOIN niches n ON n.id = l.niche_id
       ORDER BY n.slug, l.company_name`
    )
    .all();

  res.json({
    pins,
    leads,
    streets,
    categories,
    statuses: MAP_STATUSES.map((o) => ({ value: o.value, label: o.label, color: o.color })),
    leadStatuses: INTERESTED_OPTIONS.map((o) => ({ value: o.value, label: o.label, color: o.color })),
    callers: getCallerNames(),
  });
});

// PATCH /api/map/:id - zmiana stanu jednego pinu. Wszystkie pola opcjonalne:
//   status (jeden z 4 dozwolonych), caller (z listy kont), notes (dowolny tekst),
//   mark_visited: true  -> stempluje "bylem tu" biezaca data,
//   mark_visited: false -> czysci znacznik.
router.patch("/:id", (req, res) => {
  const pin = db.prepare("SELECT id, name, category FROM map_pins WHERE id = ?").get(req.params.id);
  if (!pin || !keepPin(pin)) return res.status(404).json({ error: "Nie znaleziono punktu na mapie" });

  const fields = {};

  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!STATUS_VALUES.has(status)) return res.status(400).json({ error: `Nieprawidłowy status: "${status}"` });
    fields.status = status;
  }

  if (req.body.caller !== undefined) {
    const caller = String(req.body.caller);
    if (caller && !getCallerNames().includes(caller)) {
      return res.status(400).json({ error: `Nieznany dzwoniący: "${caller}"` });
    }
    fields.caller = caller;
  }

  if (req.body.notes !== undefined) fields.notes = String(req.body.notes);

  if (req.body.mark_visited === true) fields.last_visited_at = localDateTime();
  else if (req.body.mark_visited === false) fields.last_visited_at = null;

  if (!Object.keys(fields).length) return res.status(400).json({ error: "Brak pól do zmiany" });

  const set = Object.keys(fields)
    .map((f) => `${f} = @${f}`)
    .join(", ");
  db.prepare(`UPDATE map_pins SET ${set}, updated_at = datetime('now') WHERE id = @id`).run({ ...fields, id: pin.id });

  res.json(db.prepare(`SELECT ${PIN_COLUMNS} FROM map_pins WHERE id = ?`).get(pin.id));
});

module.exports = router;
