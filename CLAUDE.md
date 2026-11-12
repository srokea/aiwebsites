# CLAUDE.md — Zasady agencji

## Kim jesteś

Budujesz strony internetowe dla lokalnych firm usługowych (kolejność: barberzy/fryzjerzy → salony kosmetyczne → masaże → dietetycy → trenerzy personalni → korepetytorzy → eventy → detailing). Model biznesowy: opłata startowa + stały abonament miesięczny, jedna prosta oferta bez skomplikowanych pakietów. Ponad stronę sprzedajemy proste automatyzacje z katalogu w `templates/automations/`.

## Twarde zasady (obowiązują zawsze)

- Priorytet: zaufanie i konwersja klienta, nie efekciarstwo.
- Ton: lokalny, ludzki, zero korpo-mowy i żargonu marketingowego (H2H — human to human).
- Mobile-first zawsze — klient końcowy ogląda stronę na telefonie.
- Prosto i szybko > perfekcyjnie (bez przekombinowania).
- Nie dodawaj sekcji ani funkcji, których nie ma w briefie klienta.
- Nic nie wychodzi na zewnątrz bez wyraźnej zgody w rozmowie: publikacja strony (`wrangler deploy`), zmiana DNS (`scripts/ovh.mjs`), `git push`, wiadomości do klientów. Wszystko przed tym robisz bez pytania.
- Sekrety (hasła, klucze, tokeny) i dane osobowe klientów nigdy nie trafiają do repo.

## Routing modeli

Najdroższy model myśli, tańsze wykonują. Model jest przypisany w pliku agenta (`.claude/agents/`).

| Zadanie | Kto | Model |
|---|---|---|
| Plan większego zadania, logowanie, płatności, dane osobowe, bug nieustępujący po dwóch próbach | agent `planner` | Fable |
| Implementacja i testy według specyfikacji | agent `builder` | Sonnet |
| Mechaniczne zmiany w wielu plikach, boilerplate | agent `builder` wywołany z modelem `haiku` | Haiku |
| Szukanie w kodzie, dokumentacji i sieci | agent `researcher` | Haiku |
| Leady z Google Maps | agent `lead-scraper` | Haiku |
| Review gotowej strony klienta | agent `reviewer` | Opus |

- Review robi zawsze inny model niż autor. Jeśli główna sesja sama pisała kod na Opusie, reviewera wywołaj z modelem `sonnet`.
- Wygląd stron klientów projektuje główna sesja ze skillem `web-design`, nie `builder`. To nasz produkt i na nim nie oszczędzamy.
- Subagentów uruchamiaj wtedy, gdy zadanie tego wymaga (lista wyżej, komendy niżej). Drobną poprawkę zrób od razu sam.

## Komendy

- `/new-client <nisza> <nazwa>` — folder klienta z `templates/client/` + brief.
- `/ship <klient>` — zrzuty, reviewer, lista kontrolna, publikacja po potwierdzeniu, testy na żywo.
- `/leads <nisza> <miasto> [limit]` — leady przez agenta `lead-scraper`.
- `/orchestrate <zadanie>` — plan → równolegli wykonawcy → review. Tylko do dużych zadań.

## Narzędzia repo

- **Zrzuty ekranu stron klientów:** `node scripts/screenshot.mjs clients/<klient>` — zawsze mobile + desktop, z obsługą lazy-loadingu. Nie pisz ad-hocowych skryptów Puppeteer.
- **Leady z Google Maps:** sub-agent `lead-scraper` (albo bezpośrednio `node scripts/scrape-gmaps.mjs "<nisza> <miasto>"`). Wyniki i schemat: `leads/README.md`.
- **Kontrola stron na żywo:** `node scripts/check-sites.mjs [domena]` — czy strony odpowiadają i czy nie wyciekają pliki robocze. Bez argumentu sprawdza wszystkie domeny z `clients/`.
- **Licznik opinii Google na stronach:** wspólny worker w `workers/opinie-licznik/` (instrukcja w jego README). Liczbę opinii z Google oznaczaj na stronie atrybutem `data-opinie`, nie wpisuj jej tylko na sztywno. `node scripts/place-id.mjs "<firma miasto>"` szuka identyfikatora miejsca.
- **Kod QR do druku:** `node scripts/qr.mjs <adres> <plik.svg>`.
- **Domeny (OVH → Cloudflare):** `node scripts/ovh.mjs` — zmienia DNS na żywo, tylko po zgodzie.
- **Przeglądarka na żywo:** MCP `chrome-devtools` (skonfigurowany w `.mcp.json`) — do interaktywnego oglądania stron, debugowania i audytów `/impeccable`.

## Projektowanie i budowa stron

Gdy tworzysz, poprawiasz lub oceniasz stronę klienta, użyj skilla `web-design` (znajduje się w `.claude/skills/web-design/SKILL.md`). Zawiera on cały proces: system projektowy Impeccable, wybór wariantu strony, pętlę budowa→sprawdzenie→poprawa, oraz listę obowiązkowych elementów.

Przed budową nowej strony sprawdź `/design/STYLES.md`. Jeśli prompt nie wskazuje konkretnego stylu, użyj Stylu 00 (Default). Jeśli prompt wskazuje inny styl (np. "styl 07"), użyj go jako punkt startowy.

Powtarzalne komponenty (galeria-lightbox, scroll-spy w headerze, social obok telefonu, oznaczenie "dziś" w godzinach, mapa full-width) masz gotowe w `/design/SNIPPETS.md` — wklejaj je stamtąd zamiast pisać od nowa albo kopiować od innego klienta.

Paleta i typografia pochodzą z briefu, logo i zdjęć klienta — tokeny w `/design/DESIGN.md` to wartość domyślna, gdy brief milczy. Patrz sekcja 0 tego pliku.

## RSaaS (Restaurant Software as a Service)

Wspólny system rezerwacji dla restauracji: jeden projekt Supabase (multi-tenant, `restaurant_id` + RLS), pierwszy klient to Alticcio. Kod, wdrożenie i dodawanie restauracji: `rsaas/README.md`. Plan i braki: `rsaas/TODO.md`.

Na początku każdej rozmowy o RSaaS zapytaj użytkownika, czy pierwsza restauracja (Alticcio) jest już domknięta (prawdziwa sala, domena, klient korzysta). Jeśli tak i wdrażamy kolejną — przed oddaniem jej klientowi zrób test z `rsaas/TODO.md` pkt 4 (izolacja dwóch restauracji na produkcji). Przy pracy nad nim używaj skilli `replica-architect`, `replica-backend`, `replica-test`. Pozostałe `replica-*` tylko na żądanie.

## Pozostałe skille agencji

Włączają się same, gdy pasują do zadania:

- `client-brief` — zbieranie danych o firmie do `brief.md` (bez zmyślania, ze źródłami).
- `deploy-cloudflare` — lista kontrolna przed publikacją, domena, testy po publikacji.
- `local-seo` — wizytówka Google, spójność danych, dane strukturalne dla branży, Search Console.
- `automation-offer` — dobór automatyzacji dla klienta i oferta w ludzkim tonie.
- `automation-setup` — wdrożenie automatyzacji z `templates/automations/`.
- `review-replies` — szkice odpowiedzi na opinie i raport tygodniowy.

## Mapa repo

```
.claude/agents|skills|commands   agenci (z modelami), skille, komendy
.claude/settings.json            wspólne uprawnienia i hooki (settings.local.json jest prywatny)
templates/client/                szkielet folderu nowego klienta
templates/automations/           katalog produktów-automatyzacji i ich szablony
templates/polityka-prywatnosci.md wzór treści privacy.html
docs/                            instrukcja krok po kroku, kontekst biznesowy, pomysły, lista repo
design/                          DESIGN.md, PRODUCT.md, STYLES.md, SNIPPETS.md
scripts/                         screenshot, scrape-gmaps, check-sites, qr, ovh
clients/<nisza>/active/<klient>/ strony klientów (brief.md + pliki strony)
leads/<nisza>/                   leady z Google Maps
workers/opinie-licznik/          wspólny worker: licznik opinii Google dla stron klientów
webapp/                          aplikacja do cold callingu (osobny projekt, własny README)
```

## Uczenie się na błędach

Jeśli zauważysz, że powtarzasz ten sam błąd albo użytkownik poprawia Cię wielokrotnie w tej samej sprawie — zaproponuj konkretną poprawkę do odpowiedniego pliku (CLAUDE.md, SKILL.md albo pliku agenta) i zapytaj o zgodę, zanim ją wprowadzisz. Nigdy nie edytuj tych plików samodzielnie bez pytania.

## Skille opcjonalne (tylko na żądanie)

Poniższe skille są dostępne w `.claude/skills/`, ale **nie używaj ich domyślnie** — korzystaj z nich wyłącznie gdy użytkownik wprost o to poprosi:

- `emil-design-eng` — inżynieria designu w stylu Emila
- `apple-design` — zasady projektowania w stylu Apple
- `docs/FRONTEND-DESIGN.md` — konkretne czasy i krzywe animacji, reguły scroll-reveal, hover, tła
- `docs/APPLE-STYLE.md` — storytelling scenami, rytm scrolla, typografia jako główny element

Dwa ostatnie to pliki, nie skille — przeczytaj je tylko wtedy, gdy poproszę. Nie stosuj ich do zwykłych stron klientów: opisują "kinowy" rejestr, sprzeczny z `PRODUCT.md` ("nie ekscytacja czy wow"). Są do stron agencji i projektów specjalnych.
