---
name: client-brief
description: Zbiera dane o firmie klienta i zapisuje je jako brief.md w jego folderze. Użyj przy nowym kliencie albo leadzie, dla którego robimy koncepcję strony, przy prośbach typu „zrób brief", „zbierz dane o firmie X", „przygotuj klienta", oraz gdy użytkownik wkleja zrzuty lub linki do wizytówki Google, Facebooka, Instagrama albo Booksy firmy. Ten skill kończy się na briefie i nie buduje strony.
---

# Brief klienta

Brief to jedyne źródło prawdy o kliencie. Strona powstaje później, ze skilla `web-design`,
i bierze z briefu wszystko: wariant, dane, treści, paletę. Błąd w briefie ląduje na stronie.

Wzór pliku: `templates/client/brief.md`. Zapisujesz do `clients/<nisza>/active/<slug>/brief.md`.
Jeśli folderu jeszcze nie ma, załóż go komendą `/new-client`.

## Zasady, od których nie ma wyjątków

1. **Niczego nie zmyślasz.** Cen, godzin, opinii, usług, e-maila, historii firmy. Brak danych
   zapisujesz jako brak.
2. **Każda informacja ma źródło** (Google, Facebook, Instagram, Booksy, rozmowa z klientem).
3. **Niepotwierdzone oznaczasz „DO POTWIERDZENIA".** Dotyczy wszystkiego, czego klient sam nie
   powiedział albo co pochodzi z jednego, niepewnego źródła.
4. **Opinie i listy usług przepisujesz dosłownie.** Opinię uciętą w źródle („… Więcej") bierzesz
   tylko do ostatniego pełnego zdania. Nie dopowiadasz końcówki.
5. **Cudze demo to nie źródło.** Jeśli lead ma już koncepcję od innej agencji, nie przejmuj z niej
   treści. Często są tam dopisane usługi i dane, których klient nie potwierdził.
6. **Linku do wystawienia opinii Google nie zgadujesz.** Podaje go klient albo bierzemy go z jego
   wizytówki.

## Kolejność pracy

1. **Przeczytaj, co wkleił użytkownik** (zrzuty, linki, notatki z rozmowy). To ma pierwszeństwo.
2. **Uzupełnij z publicznych źródeł:** wizytówka Google (nazwa, adres, telefon, godziny, ocena,
   liczba opinii), Facebook i Instagram (bio, usługi, ton, branding), Booksy (cennik, pracownicy,
   zdjęcia). Sprawdź, czy dane w tych miejscach się zgadzają. Rozjazd (inny telefon, inne godziny)
   zapisz w briefie jako rzecz do wyjaśnienia.
3. **Zadaj brakujące pytania jednym razem**, tylko te, na które nie znalazłeś odpowiedzi:
   - Czy klient używa Booksy albo innego systemu rezerwacji? Czy chce rezerwacji na stronie?
   - Ile osób pracuje w firmie?
   - Czy ma domenę?
   - Czy da zdjęcia i logo? W jakiej formie?
   - Czego na pewno nie chce na stronie?
4. **Wybierz wariant strony** (Basic, Website+, Pro+) według skilla `web-design` i uzasadnij go
   jednym zdaniem. Bez odpowiedzi na pytania o Booksy i rezerwację wariant zostaje jako założenie
   robocze z oznaczeniem DO POTWIERDZENIA.
5. **Opisz styl z materiałów klienta**, a nie z głowy: logo, szyld, zdjęcia lokalu, okładki w social
   mediach. Podaj, skąd jest każdy kolor. Hex zapisz jako orientacyjny, z uwagą, żeby dostroić go
   z pliku w `photos/`. Jeśli materiały sobie przeczą, zapisz obie wersje i zapytaj.
6. **Zapisz brief** i wypisz użytkownikowi w odpowiedzi listę „Do potwierdzenia z klientem".

## Na co uważać

- **Godziny u usługodawców bez lokalu** (fotograf, ogrodnik, trener) to zwykle godziny kontaktu,
  a nie otwarcia. Zapisz to w briefie, żeby strona nie pokazała „Otwarte".
- **Cennik „na wycenę"** to świadomy format dla części branż, a nie brak danych. Zapisz decyzję.
- **Mało opinii albo brak** oznacza brak sekcji z cytatami. Zamiast niej może być zachęta do
  wystawienia opinii.
- **Dane wrażliwe** (PESEL, numer konta, dane z umowy) nie trafiają do briefu. Brief leży w repo.

## Wynik

Plik `brief.md` według wzoru plus krótka odpowiedź: wybrany wariant, lista rzeczy do potwierdzenia,
czego brakuje do rozpoczęcia budowy (najczęściej zdjęć). Nie zaczynaj budowy strony w tym samym kroku.
