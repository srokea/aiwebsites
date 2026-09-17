// Rozjazd liczb na dashboardzie - pelna rekoncyliacja. Uruchom na serwerze (tam gdzie zyje
// prawdziwa baza):  node server/scripts/auditStats.js
//
// Pokazuje, dlaczego 3 rozne widgety pokazuja 3 rozne "sumy":
//   A) kafelki liczników  -> populacja = eligible (quality != 0 i != 6)
//   B) "Status zainteresowania" (donut+legenda) -> populacja = eligible OR called_at,
//      grupowane po `interested`, ale legenda pokazuje tylko 8 z 13 statusow, a wiersz
//      "Google Meet" liczy co innego (przyszly google_term, nie status)
//   C) panel Kasa -> surowy COUNT(interested='dopiete'), bez zadnego filtra

const db = require("../db");
const { INTERESTED_OPTIONS, INTERESTED_DONUT_ORDER } = require("../constants");
const { STATS_ELIGIBLE_SQL } = require("../leadStatus");

const ELIG = STATS_ELIGIBLE_SQL; // "quality <> '0' AND quality <> '6'"
const n = (sql) => db.prepare(sql).get().n;
const label = (v) => (INTERESTED_OPTIONS.find((o) => o.value === v) || {}).label || v;
const UNRESOLVED = INTERESTED_OPTIONS.filter((o) => o.resolved === false).map((o) => o.value);

const total = n("SELECT COUNT(*) n FROM leads");
const q0 = n("SELECT COUNT(*) n FROM leads WHERE quality = '0'");
const q6 = n("SELECT COUNT(*) n FROM leads WHERE quality = '6'");
const eligible = n(`SELECT COUNT(*) n FROM leads WHERE ${ELIG}`);
const called = n(`SELECT COUNT(*) n FROM leads WHERE called_at IS NOT NULL AND ${ELIG}`);
const calledToday = n(
  `SELECT COUNT(*) n FROM leads WHERE called_at IS NOT NULL AND ${ELIG} AND date(called_at,'localtime')=date('now','localtime')`
);
const calledOutsideElig = n(`SELECT COUNT(*) n FROM leads WHERE called_at IS NOT NULL AND NOT (${ELIG})`);

console.log("================ KAFELKI (populacja = eligible) ================");
console.log("RAW rekordow w bazie:                    ", total);
console.log("  wykluczone: quality 0 (tragiczny):    ", q0);
console.log("  wykluczone: quality 6 (ma wlasna str.):", q6);
console.log("『Wszystkich leadow』 = eligible:         ", eligible, "  (NIE jest to raw total!)");
console.log("『Zadzwonionych』   = eligible & called:  ", called);
console.log("『Do zrobienia』    = eligible - called:  ", eligible - called);
console.log("『Dzisiaj』         = called dzis:        ", calledToday);
console.log("");
console.log("『zadzwonione』 spoza eligible (widoczne w donucie, nie w kafelkach):", calledOutsideElig);

console.log("");
console.log("================ PER STATUS ================");
const rows = db
  .prepare(
    `SELECT interested,
            COUNT(*) all_n,
            SUM(CASE WHEN ${ELIG} THEN 1 ELSE 0 END) elig_n,
            SUM(CASE WHEN called_at IS NOT NULL THEN 1 ELSE 0 END) called_n,
            SUM(CASE WHEN (caller <> '' OR answered <> '') THEN 1 ELSE 0 END) contact_n
     FROM leads GROUP BY interested`
  )
  .all();
const byVal = new Map(rows.map((r) => [r.interested, r]));

let sumElig = 0;
let sumEligVisible = 0;
console.log("status".padEnd(26), "raw".padStart(5), "eligible".padStart(9), "called_at".padStart(10), "  w legendzie?");
for (const opt of INTERESTED_OPTIONS) {
  const r = byVal.get(opt.value) || { all_n: 0, elig_n: 0, called_n: 0 };
  sumElig += r.elig_n;
  const visible = INTERESTED_DONUT_ORDER.includes(opt.value);
  if (visible) sumEligVisible += r.elig_n;
  console.log(
    `${label(opt.value)} (${opt.value})`.padEnd(26),
    String(r.all_n).padStart(5),
    String(r.elig_n).padStart(9),
    String(r.called_n).padStart(10),
    visible ? "  TAK" : "  nie  <-- brakuje w legendzie"
  );
}
// statusy spoza whitelisty (stare importy, literowki)
for (const r of rows) {
  if (!INTERESTED_OPTIONS.some((o) => o.value === r.interested)) {
    sumElig += r.elig_n;
    console.log(`??? (${r.interested})`.padEnd(26), String(r.all_n).padStart(5), String(r.elig_n).padStart(9), String(r.called_n).padStart(10), "  nieznany status");
  }
}

console.log("");
console.log("suma eligible po WSZYSTKICH statusach:  ", sumElig, "  (== 『Wszystkich leadow』 powyzej)");
console.log("suma eligible po 8 statusach z legendy: ", sumEligVisible, "  (to co widzisz i probujesz zsumowac)");
console.log("roznica (ukryte statusy):              ", sumElig - sumEligVisible);

console.log("");
console.log("================ WIERSZ 'GOOGLE MEET' W DONUCIE ================");
const gmFuture = n(
  "SELECT COUNT(*) n FROM leads WHERE google_term <> '' AND google_term >= strftime('%Y-%m-%dT%H:%M','now','localtime')"
);
const gmStatus = byVal.get("google_meet") || { all_n: 0, elig_n: 0 };
console.log("donut pokazuje (leady z PRZYSZLYM google_term):", gmFuture);
console.log("leadow ze STATUSEM google_meet jest:           ", gmStatus.all_n, `(eligible: ${gmStatus.elig_n})`);
console.log("-> ta pozycja nie jest czescia podzialu po statusie, wiec sama w sobie psuje sume");

console.log("");
console.log("================ 'ZADZWONIONYCH' — z czego sie sklada ================");
const autoCall = n(`SELECT COUNT(*) n FROM leads WHERE ${ELIG} AND interested IN ('strona','zamkniete')`);
const byContact = n(
  `SELECT COUNT(*) n FROM leads WHERE ${ELIG} AND called_at IS NOT NULL AND interested NOT IN ('strona','zamkniete')`
);
console.log("auto (status Strona / Tym. Zamk., bez wymogu rozmowy):", autoCall);
console.log("z rozmowy (Kto dzwonil lub Odebral + status rozstrzygniety):", byContact);
console.log("razem:", autoCall + byContact, "(== 『Zadzwonionych』)");
console.log("");
console.log("statusy ktore NIGDY nie licza sie jako zadzwoniony (czekaja na telefon):");
console.log("  ", UNRESOLVED.map((v) => `${label(v)}`).join(", "));
const unresolvedElig = n(`SELECT COUNT(*) n FROM leads WHERE ${ELIG} AND interested IN (${UNRESOLVED.map((v) => `'${v}'`).join(",")})`);
console.log("  leadow eligible w tych statusach:", unresolvedElig, "(to trzon 『Do zrobienia』)");
const resolvedNoContact = n(
  `SELECT COUNT(*) n FROM leads WHERE ${ELIG} AND called_at IS NULL AND interested NOT IN (${UNRESOLVED
    .map((v) => `'${v}'`)
    .join(",")}) AND interested NOT IN ('strona','zamkniete')`
);
console.log("  + leady z rozstrzygnietym statusem ale BEZ Kto dzwonil/Odebral (anomalia):", resolvedNoContact);
