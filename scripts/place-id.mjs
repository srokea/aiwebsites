#!/usr/bin/env node
/**
 * Szuka identyfikatora miejsca Google (place_id) dla firmy klienta. Potrzebny do
 * workers/opinie-licznik/klienci.json.
 *
 * Użycie (klucz Google Places w zmiennej środowiskowej, nigdy w repo):
 *   GOOGLE_PLACES_KEY=... node scripts/place-id.mjs "Granda Barber Shop Bełchatów"
 *
 * Wypisuje do 5 trafień z adresem, oceną i liczbą opinii. Wybierz to, którego adres zgadza
 * się z briefem klienta.
 */
const query = process.argv.slice(2).join(' ').trim();
const key = process.env.GOOGLE_PLACES_KEY;
if (!query || !key) {
  console.error('Użycie: GOOGLE_PLACES_KEY=... node scripts/place-id.mjs "nazwa firmy miasto"');
  process.exit(1);
}
const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
  },
  body: JSON.stringify({ textQuery: query, languageCode: 'pl', regionCode: 'PL', pageSize: 5 }),
});
if (!res.ok) {
  console.error(`Błąd Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const { places = [] } = await res.json();
if (!places.length) console.log('Brak trafień. Dopisz miasto albo ulicę.');
for (const p of places) {
  console.log(`${p.id}\n   ${p.displayName?.text || ''} | ${p.formattedAddress || ''} | ${p.rating ?? '-'} (${p.userRatingCount ?? 0} opinii)`);
}
