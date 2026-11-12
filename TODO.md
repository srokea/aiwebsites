# TODO

Stan na 12.11.2026. Szczegóły i dokładne kroki: `docs/KROK-PO-KROKU.md`.

## Do zrobienia przez Sylwestra (wymaga jego kont)

- [ ] **Zmienić hasło do serwera.** Było wklejone w rozmowie z Claude'em i daje uprawnienia administratora.
- [ ] **Ograniczyć klucz Google** do „Places API (New)": `console.cloud.google.com/apis/credentials` → klucz → „Ogranicz klucz".
- [ ] **Ustawić budżet 5 zł z alertem** w Google Cloud: „Rozliczenia" → „Budżety i alerty".
- [ ] **Założyć konto w Uptime Kumie** (`http://ADRES_SERWERA:3001`), dodać domeny klientów i powiadomienia.
- [ ] **Odnowić token GitHuba przed 12.12.2026** (`github.com/settings/tokens`, zakresy `repo` i `workflow`).
- [ ] **Uzupełnić link do opinii Google na karcie `001`** w panelu `/reviews.html` (przycisk zwraca „Brak linku").
- [ ] **Usunąć ręczny rekord DNS `www.psisalonpudelek.pl`** w panelu Cloudflare (adres z `www` nie działa).

## Do przekazania Nikodemowi

- [ ] Po `git pull` odtworzyć swój plik: `cp .claude/settings.local.example.json .claude/settings.local.json`.
- [ ] Przy następnym wdrożeniu Colibry licznik opinii wejdzie sam (jest już w kodzie).
- [ ] Alticcio: w Google 164 opinie, na stronie 105. Licznik gotowy, wystarczy oznaczyć liczbę atrybutem `data-opinie`.
- [ ] Aktualizacja webappa na serwerze tylko przez `sudo bash redeploy.sh`.

## Do zrobienia z Claude'em (wystarczy napisać)

- [ ] Skill do zdjęć (zmniejszanie, kadrowanie, WebP): `zrób skill do zdjęć`
- [ ] Dane strukturalne dla Grandy i Pudelka: `dodaj dane strukturalne Grandzie i Pudelkowi`
- [ ] Lokalne fonty zamiast Google w Filiżance i szablonie fotografa: `przenieś fonty na lokalne`
- [ ] Test całego procesu na prawdziwym kliencie: `/new-client <nisza> <nazwa>`, potem budowa i `/ship`
- [ ] Wdrożenie strony Kotas (licznik opinii jest już w kodzie)
- [ ] Puste linki na stronach Filiżanki i Szkatulskiego (potrzebne adresy od klientów)

## Decyzje odłożone

- Historia gita zawiera starą bazę webappa (repo jest publiczne). Sylwester zdecydował: zostaje jak jest.
- Psia Łapka: zostają liczby wpisane na sztywno, bez licznika.
- Glasomus: bez zmian.
- Agent Reach i Umami: nie instalujemy. Opis w `docs/POMYSLY.md`.

## Zrobione 12.11.2026

- Repo bazowe: agenci z modelami, skille, komendy, szablony, dokumentacja w `docs/`.
- Zamknięty wyciek `brief.md` na trzech stronach, nagłówki bezpieczeństwa na siedmiu.
- Licznik opinii Google działa na stronach Pudelek, NOVA i Atelier Piękna.
- Liczniki skanów i kliknięć kart opinii (Worker i webapp na serwerze).
- Codzienna kontrola stron w GitHub Actions, Uptime Kuma na serwerze.
- Node 22 i Chrome na Macu, logowanie na serwer kluczem SSH.
