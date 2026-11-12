---
description: Sprawdza stronę klienta i publikuje ją na Cloudflare (z potwierdzeniem przed publikacją)
argument-hint: <klient>
disable-model-invocation: true
---

Publikacja strony klienta: $ARGUMENTS

Znajdź folder klienta w `clients/*/active/` po nazwie lub jej fragmencie. Jeśli pasuje więcej niż
jeden albo żaden, zapytaj.

1. **Co się zmieniło:** `git status` i `git diff --stat` dla folderu klienta. Ustal, czy to nowa
   strona lub większa przebudowa, czy drobna poprawka (według „Skali reakcji" w skillu `web-design`).
2. **Zrzuty ekranu:** `node scripts/screenshot.mjs <folder>`, obejrzyj mobile i desktop.
3. **Reviewer:** tylko przy nowej stronie albo większej przebudowie, jeden raz. Uruchom subagenta
   `reviewer`, popraw zasadne uwagi. Przy drobnej poprawce pomiń.
4. **Lista kontrolna** ze skilla `deploy-cloudflare`, wszystkie punkty, łącznie z próbą na sucho.
5. **Zatrzymaj się i pokaż wynik:** co jest gotowe, co budzi wątpliwości, co dokładnie zostanie
   opublikowane i pod jakim adresem. Poproś o wyraźne potwierdzenie.
6. **Po potwierdzeniu:** `npx wrangler deploy` z folderu klienta.
7. **Testy po publikacji:** `node scripts/check-sites.mjs <domena>` i pokaż wynik.
8. **Podsumuj jednym akapitem** i wypisz, co użytkownik ma sprawdzić sam na telefonie.

Jeśli na którymkolwiek etapie coś nie przechodzi, nie publikuj „mimo to". Napisz, co blokuje.
Commit i push tylko na wyraźną prośbę.
