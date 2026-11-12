# Cold Call Tracker

Lekka aplikacja do zarządzania cold callingiem (Nikodem &amp; Sylwester) — zastępuje arkusz Google Sheets.

## Uruchomienie

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # to samo, z auto-restartem po zmianie plików
```

Baza to plik SQLite w `data/coldcall.db`, tworzony automatycznie przy pierwszym starcie. Brakujące kolumny dokładają się same przy kolejnych startach (`addColumnIfMissing` w `server/db.js`), więc aktualizacja kodu nie wymaga ruszania danych.

> Uwaga (Windows/PowerShell): jeśli `npm start` zwraca błąd o zablokowanych skryptach, użyj `node server/index.js` albo raz wykonaj `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Struktura

```
server/
  constants.js    # JEDYNE źródło prawdy dla list wyboru i kolorów (front pobiera je przez /api/meta)
  leadStatus.js   # reguła "kiedy lead liczy się jako zadzwoniony"
  csvImport.js    # elastyczne mapowanie kolumn CSV + wykrywanie tagów/URL z notatek
  db.js           # SQLite + proste migracje kolumn
  routes/         # niches, leads, stats, meta, scripts, upcoming, filterSets
  scriptsData/    # treść scheme rozmowy per nisza
public/           # frontend: czysty HTML/CSS/JS, bez frameworka
data/             # plik bazy (gitignored)
```

**Dodanie nowej opcji** (status, dzwoniący, kolor niszy, etap budowy strony, treść SMS-a potwierdzającego) = edycja `server/constants.js`. Frontend podciągnie ją sam, a walidacja w API zacznie ją akceptować — nie trzeba dotykać żadnego innego pliku.

## Import CSV

Pierwszy wiersz pliku to nagłówki. Nazwy kolumn dopasowują się automatycznie — najpierw dokładnym dopasowaniem, potem "nagłówek zawiera alias" (dlatego łapie też warianty typu `Jakość biznesu (1-5)` czy `Termin Google Meet (w)`).

Przy imporcie dodatkowo:
- notatki scrapera trafiają do osobnego pola (widoczne jako dymek przy nazwie firmy), a kolumna **Notatki** zostaje pusta do ręcznego użytku;
- z treści notatek wykrywane są tagi platform (`IG`, `FB`, `Booksy`, `YouTube`) — z obsługą przeczeń, więc „brak FB" nie zaznaczy taga;
- wartości, które nie pasują do zamkniętej listy (np. `Odebrał? = "Zamknięte"` przy rozjechanych kolumnach) **nie trafiają do bazy** — lądują w notatkach, żeby nie psuć statystyk.

## Kiedy lead liczy się jako "zadzwoniony"

Definicja siedzi w jednym miejscu (`server/leadStatus.js`) i obowiązuje tak samo przy imporcie, jak i przy ręcznej edycji:

> był kontakt (przypisany dzwoniący **lub** ustawione „Odebrał?") **i** status nie jest jednym z zawieszonych.

Zawieszone = `Oczekiwanie` i `Poczta` — czekają na kolejny telefon, więc zostają w „do zrobienia". Pozostałe statusy (`Dopięte`, `Google Meet`, `SMS`, `Nie`) zamykają temat.

## Karty opinii: licznik skanów i kliknięć

Worker (`cloudflare-worker/review-card.js`) zapisuje każde wejście i kliknięcie w KV pod kluczem
`stat:<slug>`. Panel `/reviews.html` pobiera liczby najwyżej raz na minutę i pokazuje sumę oraz
ostatnie 7 dni (po najechaniu). **Żeby licznik ruszył, trzeba wkleić aktualny kod Workera w panelu
Cloudflare** (Workers & Pages → worker od `mmates.pl/r/*` → Edit code → Deploy). Podglądy linków
w komunikatorach i boty nie są liczone.

## Kalendarz iCloud (Meety → iPhone)

Każdy podpina **swój** kalendarz: avatar w prawym górnym rogu → Profil → „Kalendarz iCloud” (albo przycisk „Połącz z iCloud” na `/kalendarz.html`, albo podpowiedź w kalendarzyku wyboru terminu).

- **Parowanie:** Apple ID + **hasło do aplikacji** (account.apple.com → Logowanie i bezpieczeństwo → Hasła do aplikacji). Zwykłe hasło do Apple ID nie przejdzie (iCloud odda 401). Potem wybór kalendarza — domyślnie appka tworzy osobny „Cold Call — Meety”, który łatwo ukryć/usunąć na iPhonie. W oknie jest też „Wyślij testowe wydarzenie”.
- **Co trafia do kalendarza:** leady z ustawionym „Termin Google”. Domyślnie tylko *moje* (jestem w „Kto dzwonił”, a gdy nikt nie jest wpisany — termin ustawiono z mojego konta, `leads.google_term_by`); można przełączyć na „Całego zespołu”. Zmiana terminu przesuwa wydarzenie, wyczyszczenie terminu albo skasowanie leada/niszy je usuwa. Przeszłych Meetów nie dosyłamy wstecz (już wysłane zostają jako historia).
- **Jak to działa:** `server/calendarSync.js` uzgadnia stan (co powinno być w kalendarzu vs. co już wysłano — tabela `calendar_events`) po każdym udanym zapisie leadów/nisz/kont i dodatkowo co 10 minut. Klient CalDAV bez zależności: `server/caldav.js`; wydarzenia `.ics` w strefie `Europe/Warsaw`: `server/ics.js`.
- **Hasło do aplikacji** jest szyfrowane (AES-256-GCM). Klucz: `CALENDAR_SECRET` w `.env` albo — gdy go brak — `data/calendar.key` tworzony automatycznie (leży w `data/`, czyli na wolumenie Dockera, więc przeżywa redeploy). Utrata/zmiana klucza = trzeba połączyć kalendarze ponownie (appka sama to zgłosi).
- **Testy:** `npm test` (atrapa serwera iCloud w `server/calendarSync.test.js`). `CALDAV_SERVER_URL` służy wyłącznie do lokalnych testów z atrapą — na produkcji nie ustawiać.

## Wygląd

Styl „Liquid Glass” (ciemny): tokeny i hierarchia warstw szkła na początku `public/css/style.css`, wspólny materiał paneli na końcu pliku. Zasady produktu i tonu: `PRODUCT.md`.

## Wystawienie na zewnątrz

Bez otwierania portów na routerze: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — `cloudflared tunnel --url http://localhost:3000`.
