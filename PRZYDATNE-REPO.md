# Przydatne repozytoria

Lista narzędzi open source, które mogą się przydać w agencji albo w innych projektach.
Wszystkie sprawdzone na GitHubie 12.11.2026: istnieją, są rozwijane, licencja jak w tabeli.
Gwiazdki zaokrąglone. Przed instalacją sprawdź właściciela repo, bo popularne projekty mają
dużo podróbek o podobnych nazwach.

„U nas" mówi, czy tego używamy. Powody decyzji „nie" są w `KROK-PO-KROKU.md`.

## Claude Code: skille i wtyczki

| Repo | Co robi | Licencja | Gwiazdki | U nas |
|---|---|---|---|---|
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | zasady i audyt projektowania interfejsów, wykrywa „wygląd AI" | Apache-2.0 | 109k | używamy |
| [anthropics/skills](https://github.com/anthropics/skills) | oficjalne skille Anthropic (dokumenty, prezentacje, tworzenie skilli) | brak w API | 193k | wzorzec do pisania własnych |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | oficjalny katalog wtyczek do Claude Code | Apache-2.0 | 47k | do przeglądania |
| [cloudflare/skills](https://github.com/cloudflare/skills) | skille do Workers, wranglera, Durable Objects | Apache-2.0 | 3k | warto dodać sam `wrangler`, gdy będzie więcej workerów |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 24 skille inżynierskie: specyfikacja, plan, testy, review, publikacja | MIT | 116k | nie w całości; dobre do większych aplikacji |
| [obra/superpowers](https://github.com/obra/superpowers) | metodyka pracy z agentem: burza mózgów, plan, TDD | MIT | 317k | nie; do projektów czysto programistycznych |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | skille Vercela (React, wytyczne interfejsów) | brak w API | 34k | przy projektach w React/Next |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | skille marketingowe: teksty, SEO, konwersja | MIT | 60k | nie; przy własnym produkcie SaaS |
| [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | rozbudowany audyt SEO, w tym lokalne | MIT | 28k | nie; mamy krótki `local-seo` |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | graf wiedzy o dużym kodzie zamiast czytania plików | Apache-2.0 | 146k | przy dużym repo (np. gdy urośnie webapp) |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | pilnuje, żeby agent pisał mniej kodu | MIT | 190k | test na projekcie backendowym, nie na stronach |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | lista zasobów do Claude Code | inna | 58k | do szukania nowości |

## Strony: jakość i utrzymanie

| Repo | Co robi | Licencja | Gwiazdki | U nas |
|---|---|---|---|---|
| [GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse) | audyt szybkości, dostępności i SEO jednej strony | Apache-2.0 | 31k | wbudowany w Chrome |
| [harlan-zw/unlighthouse](https://github.com/harlan-zw/unlighthouse) | Lighthouse dla wszystkich podstron naraz | MIT | 5k | przed oddaniem większej strony |
| [lycheeverse/lychee](https://github.com/lycheeverse/lychee) | szybkie wykrywanie martwych linków | Apache-2.0 | 4k | do rozważenia |
| [lovell/sharp](https://github.com/lovell/sharp) | zmniejszanie i konwersja zdjęć (WebP, AVIF) w Node | Apache-2.0 | 33k | pod przyszły skill do zdjęć |
| [soldair/node-qrcode](https://github.com/soldair/node-qrcode) | generator kodów QR | MIT | 8k | używamy (`scripts/qr.mjs`) |
| [upptime/upptime](https://github.com/upptime/upptime) | monitoring stron i strona statusu na GitHub Actions, bez serwera | MIT | 17k | gdy codzienna kontrola przestanie wystarczać |
| [louislam/uptime-kuma](https://github.com/louislam/uptime-kuma) | monitoring z powiadomieniami, wymaga serwera | MIT | 94k | później |
| [umami-software/umami](https://github.com/umami-software/umami) | statystyki odwiedzin bez cookies, wymaga serwera | MIT | 40k | gdy klienci zaczną pytać o statystyki |

## Automatyzacje i obsługa klienta

| Repo | Co robi | Licencja | Gwiazdki | U nas |
|---|---|---|---|---|
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | wspólna skrzynka: czat na stronie, WhatsApp, Instagram, e-mail | MIT (część enterprise osobno) | 40k | pod automatyzacje z wiadomościami |
| [activepieces/activepieces](https://github.com/activepieces/activepieces) | automatyzacje „klocki" jak n8n | mieszana, sprawdź przed użyciem komercyjnym | 25k | nie sprawdzałem licencji szczegółowo |
| [calcom/cal.diy](https://github.com/calcom/cal.diy) | rezerwacja terminów jak Calendly | MIT | 50k | nie; autorzy odradzają produkcję |
| [documenso/documenso](https://github.com/documenso/documenso) | podpisywanie umów online | AGPL-3.0 | 16k | gdyby podpis w webappie przestał wystarczać |
| [every-app/open-seo](https://github.com/every-app/open-seo) | badanie słów kluczowych i pozycji, płatne dane DataForSEO | MIT | 27k | przy większym kliencie z budżetem na SEO |
| [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) | scraper Google Maps na większą skalę | MIT | 8k | nie; mamy własny, a scraping jest wbrew regulaminowi Google |

## Narzędzia osobiste

| Repo | Co robi | Licencja | Gwiazdki |
|---|---|---|---|
| [OpenWhispr/openwhispr](https://github.com/OpenWhispr/openwhispr) | dyktowanie zamiast pisania, działa lokalnie | MIT | 11k |
| [CapSoftware/Cap](https://github.com/CapSoftware/Cap) | nagrywanie ekranu jak Loom, np. krótka prezentacja koncepcji dla leada | AGPL-3.0 | 25k |
| [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | zamiennik Notion na własnym serwerze | AGPL-3.0 | 79k |
| [opf/openproject](https://github.com/opf/openproject) | zarządzanie projektami dla większych zespołów | GPL-3.0 | 17k |
| [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) | klonowanie głosu i lektor lokalnie | AGPL-3.0 | 109k |
| [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) | interfejs do generowania obrazów i wideo (modele płatne osobno) | MIT | 34k |

## Sprawdzone i odradzane

| Repo | Powód |
|---|---|
| cheaper-inference/OmniRoute | obchodzenie limitów dostawców, podszywanie się pod ich aplikacje, ryzyko blokady konta |
| Panniantong/Agent-Reach | scraping zalogowanych kont w serwisach, które tego zabraniają |
| govijr/terminal-mac | bardzo wczesna wersja, bez notaryzacji Apple; wrócić za kilka miesięcy |

## Jak oceniać nowe narzędzie z rolki

1. Znajdź oryginalne repo (nie fork) i sprawdź datę ostatniego commita.
2. Przeczytaj licencję. AGPL i „fair-code" ograniczają sprzedaż klientom.
3. Zapytaj: jaki nasz konkretny problem to rozwiązuje? Jeśli żadnego, odpuść.
4. Sprawdź, czy wymaga serwera. Każdy serwer to coś, co trzeba aktualizować i pilnować.
5. „Darmowe" obejścia limitów i scraping bez API to zwykle łamanie regulaminu.
