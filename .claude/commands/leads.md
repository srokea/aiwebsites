---
description: Zbiera leady z Google Maps dla niszy i miasta (subagent lead-scraper)
argument-hint: <nisza> <miasto> [limit]
disable-model-invocation: true
---

Zbierz leady: $ARGUMENTS

Ostatni argument, jeśli jest liczbą, to limit firm (domyślnie 20). Reszta to zapytanie do Google
Maps, np. „barber Bełchatów".

1. Uruchom subagenta `lead-scraper` z tym zapytaniem i limitem. To on odpala
   `scripts/scrape-gmaps.mjs`, usuwa duplikaty, uzupełnia social media i ocenia leady.
2. Po zakończeniu przenieś pliki CSV i JSON z `leads/` do folderu niszy (`leads/<nisza>/`),
   zgodnie z `leads/README.md`. Jeśli folderu niszy nie ma, utwórz go.
3. Pokaż użytkownikowi tylko podsumowanie od subagenta i ścieżkę do pliku CSV.

Jedno zapytanie naraz. Nie uruchamiaj kilku scrapów równolegle ani w pętli po wielu miastach bez
prośby: skrypt jest do ręcznego researchu na małą skalę.
