---
description: Duże zadanie w trybie plan → równolegli wykonawcy → review (planner, builder, reviewer)
argument-hint: <opis zadania>
disable-model-invocation: true
---

Zadanie do rozpisania i wykonania: $ARGUMENTS

Ten tryb opłaca się tylko przy zadaniu, które da się podzielić na co najmniej trzy niezależne
części (webapp, sklep, automatyzacja). Dla jednej strony-wizytówki albo poprawki zużywa więcej
tokenów, niż oszczędza. Jeśli zadanie jest małe, powiedz to i zrób je zwyczajnie.

## Przebieg

1. **Czysty start.** Sprawdź `git status`. Wykonawcy pracują na kopiach repo (worktree) tworzonych
   z ostatniego commita, więc niezacommitowane zmiany do nich nie trafią. Jeśli są, zapytaj
   użytkownika, czy je zacommitować.
2. **Plan.** Uruchom agenta `planner` z pełnym opisem zadania. Jeśli zwróci sekcję „Do decyzji"
   z pytaniami, zadaj je użytkownikowi i dopiero potem idź dalej.
3. **Pokaż plan użytkownikowi** w skrócie (lista zadań, co równolegle, co po kolei) i poczekaj
   na akceptację.
4. **Wykonanie.** Dla każdego zadania uruchom agenta `builder`, przekazując mu całą specyfikację
   zadania słowo w słowo. Zadania oznaczone jako równoległe uruchom jednocześnie, każde w izolacji
   worktree. Zadania zależne uruchamiaj po zakończeniu poprzednich.
   Zmiany czysto mechaniczne (zmiana nazw, kopiowanie szablonu) zlecaj builderowi z modelem `haiku`.
5. **Scalenie.** Zbierz raporty. Zmiany z worktree scal do bieżącej gałęzi. Przy konflikcie nie
   rozstrzygaj na ślepo: plan miał gwarantować rozłączne pliki, więc konflikt oznacza błąd planu.
6. **Review innym modelem niż autor.**
   - Strona klienta: subagent `reviewer`.
   - Kod (webapp, workery, skrypty): agent ogólny z modelem `opus`, który dostaje specyfikację
     zadania i `git diff`, a zwraca listę odstępstw od specyfikacji i błędów, najpoważniejsze
     pierwsze.
7. **Poprawki.** Zasadne uwagi wracają do `builder` jako nowe, wąskie zadanie. Najwyżej dwie rundy
   review i poprawek. Jeśli po dwóch rundach coś nadal nie przechodzi, zatrzymaj się i pokaż
   użytkownikowi, co zostało.
8. **Raport końcowy:** co zrobione, jak sprawdzone, co niezałatwione, co wymaga decyzji.

## Granice

- Żaden agent nie publikuje, nie pushuje i nie zmienia DNS. To robi użytkownik albo `/ship`.
- Pliki ignorowane przez gita (`node_modules`, `.dev.vars`, `webapp/data/`) nie istnieją
  w worktree. Zadanie, które ich potrzebuje, wykonuj bez izolacji, po kolei.
- Jeśli planner albo builder zgłasza, że specyfikacja jest niejasna, wróć do użytkownika.
  Nie dopowiadaj za niego.
