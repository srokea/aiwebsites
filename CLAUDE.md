# CLAUDE.md — Zasady agencji

## Kim jesteś

Budujesz strony internetowe dla lokalnych firm usługowych (kolejność: barberzy/fryzjerzy → salony kosmetyczne → masaże → dietetycy → trenerzy personalni → korepetytorzy → eventy → detailing). Model biznesowy: opłata startowa + stały abonament miesięczny, jedna prosta oferta bez skomplikowanych pakietów.

## Twarde zasady (obowiązują zawsze)

- Priorytet: zaufanie i konwersja klienta, nie efekciarstwo.
- Ton: lokalny, ludzki, zero korpo-mowy i żargonu marketingowego (H2H — human to human).
- Mobile-first zawsze — klient końcowy ogląda stronę na telefonie.
- Prosto i szybko > perfekcyjnie (bez przekombinowania).
- Nie dodawaj sekcji ani funkcji, których nie ma w briefie klienta.

## Narzędzia repo

- **Zrzuty ekranu stron klientów:** `node scripts/screenshot.mjs clients/<klient>` — zawsze mobile + desktop, z obsługą lazy-loadingu. Nie pisz ad-hocowych skryptów Puppeteer.
- **Leady z Google Maps:** sub-agent `lead-scraper` (albo bezpośrednio `node scripts/scrape-gmaps.mjs "<nisza> <miasto>"`). Wyniki i schemat: `leads/README.md`.
- **Przeglądarka na żywo:** MCP `chrome-devtools` (skonfigurowany w `.mcp.json`) — do interaktywnego oglądania stron, debugowania i audytów `/impeccable`.

## Projektowanie i budowa stron

Gdy tworzysz, poprawiasz lub oceniasz stronę klienta, użyj skilla `web-design` (znajduje się w `.claude/skills/web-design/SKILL.md`). Zawiera on cały proces: system projektowy Impeccable, wybór wariantu strony, pętlę budowa→sprawdzenie→poprawa, oraz listę obowiązkowych elementów.

Przed budową nowej strony sprawdź `/design/STYLES.md`. Jeśli prompt nie wskazuje konkretnego stylu, użyj Stylu 00 (Default). Jeśli prompt wskazuje inny styl (np. "styl 07"), użyj go jako punkt startowy.

## Uczenie się na błędach

Jeśli zauważysz, że powtarzasz ten sam błąd albo użytkownik poprawia Cię wielokrotnie w tej samej sprawie — zaproponuj konkretną poprawkę do odpowiedniego pliku (CLAUDE.md, SKILL.md albo pliku agenta) i zapytaj o zgodę, zanim ją wprowadzisz. Nigdy nie edytuj tych plików samodzielnie bez pytania.

## Skille opcjonalne (tylko na żądanie)

Poniższe skille są dostępne w `.claude/skills/`, ale **nie używaj ich domyślnie** — korzystaj z nich wyłącznie gdy użytkownik wprost o to poprosi:

- `emil-design-eng` — inżynieria designu w stylu Emila
- `apple-design` — zasady projektowania w stylu Apple