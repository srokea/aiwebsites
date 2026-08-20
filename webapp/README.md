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

Zawieszone = `Oczekiwanie` i `Oddzwonić - Poczta` — czekają na kolejny telefon, więc zostają w „do zrobienia". Pozostałe statusy (`Dopięte`, `Google Meet`, `SMS`, `Nie`) zamykają temat.

## Wystawienie na zewnątrz

Bez otwierania portów na routerze: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — `cloudflared tunnel --url http://localhost:3000`.
