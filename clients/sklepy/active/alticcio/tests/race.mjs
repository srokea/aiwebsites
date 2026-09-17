// Test wyścigu: N równoczesnych rezerwacji tej samej godziny przez prawdziwe /api/reserve.
// Oczekiwane: tyle sukcesów, ile jest wolnych pasujących stolików — reszta slot_taken.
//
// Wymaga działającej funkcji z TESTOWYMI kluczami Turnstile (każdy token przechodzi):
//   npx wrangler pages dev dist      (z .dev.vars, patrz supabase/SETUP.md)
// Uruchom na PROJEKCIE TESTOWYM Supabase, nie produkcyjnym — tworzy prawdziwe rezerwacje:
//   node tests/race.mjs http://localhost:8788 2026-09-25 19:00 8 6
//                      <adres>               <data>     <godz> <grupa> <prób>
// Grupa 8 przy przykładowej sali z seed.sql = jeden stolik → dokładnie 1 sukces.

const [base = 'http://localhost:8788', date, time = '19:00', party = '8', attempts = '10'] = process.argv.slice(2);
if (!date) {
  console.error('Podaj datę: node tests/race.mjs <adres> <RRRR-MM-DD> [HH:MM] [grupa] [próby]');
  process.exit(1);
}

const one = (i) =>
  fetch(`${base}/api/reserve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      date, time, party: Number(party), duration: 120,
      name: `Wyścig ${i}`,
      phone: `+4860010${String(1000 + i).slice(-4)}`,   // różne numery, żeby nie trafić w limit
      acceptedRules: true,
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const results = await Promise.all(Array.from({ length: Number(attempts) }, (_, i) => one(i)));
const tally = {};
for (const r of results) {
  const key = r.body.ok ? 'ok' : r.body.error;
  tally[key] = (tally[key] || 0) + 1;
}
console.log(tally);
if (!tally.ok) console.log('Żadnego sukcesu — sprawdź, czy termin jest wolny i w godzinach otwarcia.');
