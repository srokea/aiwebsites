# AI Web Agency: repo bazowe

Wszystko, czego używamy do pracy w Claude Code: zasady, agenci, skille, komendy, szablony i strony
klientów. Zasady dla Claude'a są w `CLAUDE.md`, kontekst biznesowy w `AI_WEB_AGENCY_CONTEXT.md`.

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

| Chcę… | Wpisuję |
|---|---|
| założyć nowego klienta | `/new-client fryzjerzy Nazwa Firmy` |
| zbudować albo poprawić stronę | zwykłą prośbę, np. „zrób stronę dla klienta X" (skill `web-design`) |
| opublikować stronę | `/ship nazwa-klienta` |
| zebrać leady | `/leads barber Bełchatów 20` |
| sprawdzić, czy strony klientów żyją | `node scripts/check-sites.mjs` |
| zaproponować klientowi opinie Google | „napisz ofertę na opinie dla klienta X" |
| wdrożyć opinie u klienta | „wdróż opinie u klienta X" |
| odpowiedzieć na opinie | wklejam opinie i piszę „przygotuj odpowiedzi dla klienta X" |
| zrobić coś dużego (webapp, sklep) | `/orchestrate opis zadania` |

## Jak oszczędzamy tokeny

Modele są przypisane do agentów (tabela w `CLAUDE.md`): Fable planuje, Sonnet pisze kod, Haiku
szuka i zbiera leady, Opus robi review. Dwie praktyczne zasady:

- Zwykłe poprawki i kod rób w sesji na Sonnecie (`/model sonnet`). Do planowania i trudnych rzeczy
  sesja sama sięgnie po agenta `planner` na Fable.
- Strony klientów projektuj na najlepszym modelu, jaki masz. To jest to, co sprzedajemy.

`/orchestrate` nie jest tańsze przy małych zadaniach. Kilku agentów naraz zużywa więcej tokenów
niż jedna sesja. Zysk pojawia się dopiero przy zadaniu z co najmniej trzema niezależnymi częściami.

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

## Narzędzia z zewnątrz: co sprawdziliśmy (listopad 2026)

Żeby nie wracać do tych samych rolek. Stan z GitHuba na 12.11.2026.

| Narzędzie | Decyzja | Powód |
|---|---|---|
| Impeccable (pbakaus/impeccable) | używamy | podstawa skilla `web-design` |
| cloudflare/skills (oficjalne, Apache-2.0) | do rozważenia | warto dodać sam skill `wrangler`; cały plugin dokłada wiele skilli i 5 serwerów MCP, za dużo |
| Uptime Kuma (MIT) | później | monitoring stron klientów, gdy `check-sites` przestanie wystarczać; wymaga serwera |
| Upptime (MIT) | do rozważenia | darmowy monitoring stron klientów na GitHub Actions, bez własnego serwera; lżejszy niż Uptime Kuma |
| lychee, Unlighthouse | do rozważenia | sprawdzanie martwych linków i audyt Lighthouse wszystkich podstron naraz |
| Umami (MIT) | później | statystyki bez cookies dla klientów, gdy zaczną o nie pytać; wymaga serwera |
| Chatwoot (MIT) | później | wspólna skrzynka pod automatyzacje z wiadomościami |
| Open SEO (MIT) | później | wymaga płatnego klucza DataForSEO |
| claude-seo, marketingskills (MIT) | nie instalujemy | mamy własny, krótki `local-seo`; tamte to dziesiątki skilli pod duże serwisy |
| Graphify (Apache-2.0) | później | sens tylko dla `webapp/` |
| Ponytail (MIT) | test na jednym projekcie | autor podaje 22% mniej tokenów, niezależny pomiar ok. 8%; może kłócić się z `web-design` |
| Agent Skills, Superpowers (MIT) | nie instalujemy w całości | za dużo skilli naraz; pojedyncze pomysły można przenieść ręcznie |
| OmniRoute | nie | obchodzenie limitów, podszywanie się pod klientów dostawców, kod klientów u przypadkowych firm |
| Agent Reach | nie | scraping zalogowanych kont (LinkedIn, IG, X) łamie ich regulaminy |
| n8n | nie jako baza | według FAQ licencji hostowanie danych klientów na naszej instancji wymaga wersji Enterprise |
| Cal.diy | nie | autorzy sami piszą: nie do użytku produkcyjnego |
| terminal-mac | nie teraz | wydanie sprzed kilku dni, bez notaryzacji Apple |
| Open Generative AI, VoiceStudio, AppFlowy, OpenProject | nie | nie rozwiązują żadnego naszego problemu |
| OpenWhispr, Cap | prywatnie, jeśli ktoś chce | dyktowanie i nagrywanie ekranu, poza repo |
