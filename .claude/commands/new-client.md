---
description: Zakłada folder nowego klienta z szablonu i prowadzi przez brief
argument-hint: <nisza> <nazwa firmy>
disable-model-invocation: true
---

Nowy klient: $ARGUMENTS

Pierwsze słowo to nisza (nazwa folderu w `clients/`, np. `fryzjerzy`, `kosmetyczki`), reszta to
nazwa firmy. Jeśli brakuje któregoś z nich, zapytaj i nie zgaduj.

1. **Slug:** nazwa firmy małymi literami, bez polskich znaków, spacje zamienione na myślniki,
   bez znaków specjalnych (np. „Studio Urody Żaneta" → `studio-urody-zaneta`).
2. **Sprawdź, czy klient już nie istnieje:** `ls clients/*/active/` oraz pliki w `leads/`.
   Jeśli istnieje, zatrzymaj się i powiedz to.
3. **Załóż folder:** jeśli nie ma `clients/<nisza>/active/`, utwórz go. Potem
   `cp -R templates/client clients/<nisza>/active/<slug>`.
4. **Uzupełnij od razu to, co pewne:** `name` w `wrangler.jsonc` (slug), dzisiejszą datę
   w `compatibility_date`, ścieżkę folderu w `brief.md`. Domenę zostaw jako znacznik, dopóki klient
   jej nie potwierdzi.
5. **Brief:** uruchom skill `client-brief` dla tej firmy.
6. **Na koniec wypisz:** ścieżkę folderu, wybrany wariant strony, listę „do potwierdzenia
   z klientem" i czego brakuje, żeby zacząć budowę (zwykle zdjęć w `photos/`).

Nie zaczynaj budowy strony w tej komendzie. Następny krok to skill `web-design`, gdy brief jest
gotowy.
