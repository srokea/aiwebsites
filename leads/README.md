# Leady — baza wyjściowa pod Google Sheets

Pliki CSV/JSON generowane przez `node scripts/scrape-gmaps.mjs "<nisza> <miasto>"`
(albo przez sub-agenta `lead-scraper`, który dodatkowo wzbogaca i ocenia leady).

## Struktura

Jeden folder na niszę: `fryzjerzy/`, `kosmetyczki/`, `fotografowie/` (kolejne dokładaj tak samo).
Nowy scrape ląduje w `leads/` — po sprawdzeniu przenieś go do folderu swojej niszy.
Pliki `*-arkusz*.csv` / `*-zbiorczy.csv` to eksporty z Google Sheets (inne kolumny niż schemat niżej).

## Schemat kolumn (zgodny z docs/AI_WEB_AGENCY_CONTEXT.md §4)

| kolumna | znaczenie |
|---|---|
| `nazwa` | nazwa firmy z Google Maps |
| `telefon` | telefon (bez spacji, gotowy do wybrania) |
| `miasto` | miasto z adresu |
| `www` | własna strona internetowa (jeśli jest) |
| `facebook` / `instagram` / `booksy` | linki, jeśli znalezione |
| `liczba_opinii` | liczba opinii w Google |
| `ocena` | średnia ocena w Google (kropka dziesiętna) |
| `jakosc` | potencjał leada 1–5 (5 = aktywna firma bez strony — dzwonić najpierw) |
| `status` | `nowy` → `do zadzwonienia` → `umówione demo` → `klient` / `odrzucony` |
| `notatki` | wolny tekst (uzasadnienie oceny, ustalenia z rozmów) |
| `maps_url` | link do wizytówki Google Maps |

## Import do Google Sheets

Arkusz → Plik → Importuj → Prześlij → wybierz CSV → separator: przecinek.
Google Sheets pozostaje źródłem prawdy — CSV tutaj to bufor/eksport, nie CRM.

## Uwagi

- Liczba opinii bywa pusta, gdy Google nie renderuje licznika dla danej wizytówki — uzupełnij ręcznie z Maps.
- Scraper jest do małej skali (ręczny research jednym poleceniem). Nie odpalać masowo/równolegle.
