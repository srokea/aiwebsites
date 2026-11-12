# Licznik opinii Google

Jeden worker dla wszystkich klientów. Raz dziennie pobiera z Google ocenę i liczbę opinii każdej
firmy, a strony klientów same podmieniają liczby. **Stron nie trzeba wdrażać ponownie**, gdy
przybywa opinii.

Jak to działa: liczba wpisana w HTML zostaje jako wartość zapasowa. Skrypt `o.js` pobiera świeże
dane i nadpisuje ją. Gdy worker albo Google nie odpowiada, odwiedzający widzi starą liczbę.

## Uruchomienie (raz)

1. **Klucz Google.** W Google Cloud: projekt z podpiętym rozliczeniem → włącz „Places API (New)" →
   utwórz klucz API i ogranicz go do tej jednej usługi. Zapytania o ocenę i liczbę opinii mają
   darmowy limit 1000 miesięcznie (stan z listopada 2026), potem 20 USD za 1000. Ustaw w Google
   Cloud limit dzienny na usłudze, żeby nigdy nie wyjść poza darmową pulę.
2. `cd workers/opinie-licznik`
3. `npx wrangler kv namespace create OPINIE_KV` i wklej zwrócone `id` do `wrangler.jsonc`.
4. `npx wrangler secret put GOOGLE_PLACES_KEY` i wklej klucz. Klucz nie trafia do repo.
5. `npx wrangler deploy`. Zapisz adres workera (`https://opinie-licznik.<konto>.workers.dev`).

## Dodanie klienta

1. Znajdź identyfikator miejsca:
   `GOOGLE_PLACES_KEY=... node scripts/place-id.mjs "Nazwa firmy miasto"`
   Sprawdź, czy adres zgadza się z briefem.
2. Dopisz wpis do `klienci.json` (slug taki jak nazwa folderu klienta):
   ```json
   [
     { "slug": "kotas", "place_id": "ChIJ..." }
   ]
   ```
   Firma z kilkoma lokalizacjami: osobny wpis na każdą, np. `granda-lodz`, `granda-belchatow`.
3. `npx wrangler deploy` z tego folderu.
4. Pierwsze pobranie nastąpi przy najbliższym uruchomieniu nocnym. Żeby nie czekać: w panelu
   Cloudflare otwórz workera → Settings → Trigger Events → uruchom zadanie ręcznie.
   Sprawdzenie: `https://ADRES_WORKERA/o/<slug>.json`.

## Podpięcie na stronie klienta (jednorazowo, potem samo)

Oznacz miejsca z liczbami i dodaj skrypt przed `</body>`:

```html
<span data-opinie="ocena">5,0</span>
<span data-opinie="liczba-slowo">57 opinii</span> w Google

<script src="https://ADRES_WORKERA/o.js" data-klient="kotas" defer></script>
```

| Atrybut | Co wstawia | Przykład |
|---|---|---|
| `data-opinie="ocena"` | ocenę z przecinkiem | `4,9` |
| `data-opinie="liczba"` | samą liczbę | `122` |
| `data-opinie="slowo"` | odmienione słowo | `opinie` |
| `data-opinie="liczba-slowo"` | liczbę ze słowem | `122 opinie` |
| `data-opinie-klient="slug"` | (opcjonalnie) inna lokalizacja niż w `data-klient` | |

Tekst w środku znacznika zostaje jako wartość zapasowa, więc wpisz tam aktualną liczbę.
Po dodaniu skryptu dopisz w `privacy.html` klienta, że strona pobiera liczbę opinii z serwera
agencji na Cloudflare (adres IP odwiedzającego trafia do Cloudflare, tak jak przy samej stronie).

## Ograniczenia

- **Tylko Google.** Opinii z Booksy i Facebooka nie da się pobrać oficjalną drogą, więc te liczby
  nadal zmieniamy ręcznie.
- **Gwiazdki rysowane w HTML** (★★★★★) nie zmieniają się same. Jeśli ocena spadnie poniżej 4,5,
  trzeba je poprawić ręcznie.
- **Zasady Google:** przy liczbach z tego API ma być podpis „Google Maps" (nie samo „Google"),
  a dane wolno trzymać tylko tymczasowo. Odświeżamy je codziennie i nie archiwizujemy.
- Odświeżanie jest raz na dobę, a przeglądarka trzyma odpowiedź godzinę. Nowa opinia pojawi się
  na stronie najpóźniej następnego dnia.

## Testy

`node --test test.mjs` (atrapy Google i KV, bez sieci).
