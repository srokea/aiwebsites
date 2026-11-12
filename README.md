# AI Web Agency: repo bazowe

Wszystko, czego używamy do pracy w Claude Code: zasady, agenci, skille, komendy, szablony i strony
klientów. Zasady dla Claude'a są w `CLAUDE.md`, kontekst biznesowy w `docs/AI_WEB_AGENCY_CONTEXT.md`.

## Gdzie co jest

| Plik lub folder | Co zawiera |
|---|---|
| `docs/KROK-PO-KROKU.md` | **zacznij tutaj:** jak robimy stronę klienta od leada do dosprzedaży |
| `TODO.md` | co zostało do zrobienia i kto ma to zrobić |
| `CLAUDE.md` | zasady dla Claude'a: routing modeli, komendy, narzędzia |
| `docs/AI_WEB_AGENCY_CONTEXT.md` | kontekst biznesowy: oferta, cold calling, obiekcje |
| `docs/PRZYDATNE-REPO.md` | sprawdzone narzędzia open source |
| `docs/POMYSLY.md` | pomysły na później |
| `docs/APPLE-STYLE.md`, `docs/FRONTEND-DESIGN.md` | styl „kinowy", tylko na żądanie |
| `clients/` | strony klientów |
| `templates/` | szkielet nowego klienta i katalog automatyzacji |
| `workers/` | wspólne workery Cloudflare (licznik opinii) |
| `webapp/`, `rsaas/` | aplikacja do cold callingu i system rezerwacji (osobne projekty) |
| `redeploy.sh`, `rollback.sh` | aktualizacja webappa na serwerze; muszą zostać w katalogu głównym |

## Pierwsze uruchomienie (około 5 minut)

1. **Node.js 22** z nodejs.org (ta sama linia co w `webapp/Dockerfile`; na Node 26 nie buduje się
   baza webappa). Bez Node nie działają skrypty, wrangler ani podgląd stron w przeglądarce
   (MCP `chrome-devtools`). Sprawdzenie: `node -v`.
2. **Google Chrome** (albo Edge). Używają go zrzuty ekranu i scraper leadów.
3. W katalogu repo: `npm install`. Dla webappa osobno: `cd webapp && npm install && npm test`.
4. **Własny plik ustawień (zalecane).** Skopiuj wzór i wpisz pełną ścieżkę do folderu `design`
   na swoim komputerze:
   ```
   cp .claude/settings.local.example.json .claude/settings.local.json
   ```
   Ten plik jest prywatny i nie trafia do gita. Bez niego Impeccable znajduje `PRODUCT.md`
   i `DESIGN.md` tylko wtedy, gdy polecenie rusza z katalogu głównego repo. Z pełną ścieżką
   działa także z folderu klienta.
5. **Cloudflare:** `npx wrangler login`, potem `npx wrangler whoami` ma pokazać konto agencji.
6. **OVH** (tylko jeśli przepinasz domeny): klucze w `~/.ovh.conf`, opis w `scripts/ovh.mjs`.
7. Otwórz folder w Claude Code i zaakceptuj zaufanie do projektu. Dopiero wtedy działają wspólne
   uprawnienia, hooki i serwer MCP.

> **Uwaga przy pierwszym `git pull` po tej zmianie:** plik `.claude/settings.local.json` przestał
> być wspólny. Git usunie Twoją kopię, więc po pullu wykonaj krok 4. Hooki Impeccable są teraz
> we wspólnym `settings.json`, nie trzeba ich przenosić.

## Codzienna praca

Cały proces z gotowymi poleceniami do wklejenia: **`docs/KROK-PO-KROKU.md`**. Tam też jest, który
model wybrać do czego.

## Uprawnienia

Wspólne reguły są w `.claude/settings.json`:

- **bez pytania:** skrypty z `scripts/`, `git status/diff/log/add/commit`, `wrangler dev`,
- **zawsze z pytaniem, także w trybie bypass:** publikacja (`wrangler deploy`), sekrety i bazy
  Cloudflare, `scripts/ovh.mjs` (DNS), `redeploy.sh`, `rollback.sh`, `docker`,
- **zablokowane:** czytanie `.env`, `.dev.vars`, `haslo.txt`, `webapp/data/` i `~/.ovh.conf` oraz
  `git push --force`.

Swoje dodatkowe zgody (np. `git push`) trzymasz w prywatnym `settings.local.json`.

## Czego nie ruszać bez uzgodnienia

- `design/DESIGN.md` i `design/PRODUCT.md`: wspólny fundament wszystkich stron.
- `.claude/skills/impeccable/` i agenci `impeccable-*`: kod zewnętrzny, aktualizowany w całości.
- `CLAUDE.md`, pliki skilli i agentów: zmiany po uzgodnieniu między nami.
- `webapp/data/`: żywe dane, nigdy w repo (historia w `.gitignore`).

## Automatyzacje

Katalog i zasady: `templates/automations/README.md`. Gotowy do pilotażu jest jeden produkt,
**Opinie Google** (strona `/opinia/`, kod QR, odpowiedzi na opinie raz w tygodniu). Cenę wpisujemy
w tabeli w tym pliku. Dopóki jej tam nie ma, Claude nie poda klientowi żadnej kwoty.

## Narzędzia z zewnątrz

Co sprawdziliśmy, czego używamy i czego nie: `docs/PRZYDATNE-REPO.md`. Pomysły odłożone na później:
`docs/POMYSLY.md`.
