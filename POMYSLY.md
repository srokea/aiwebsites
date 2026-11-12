# Pomysły na później

Rzeczy, do których warto wrócić. Każdy wpis: co to, po co nam, co blokuje.

## Agent Reach (dostęp Claude'a do YouTube'a, Reddita, X i innych)

- **Co to:** [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach), MIT. Daje agentowi
  czytanie i przeszukiwanie kilkunastu serwisów bez płatnych API.
- **Po co nam:** research przed rozmową z klientem (co o firmie piszą ludzie), szukanie inspiracji,
  podglądanie, co działa u konkurencji w danej niszy.
- **Jak bezpiecznie:** tylko źródła publiczne, bez logowania (YouTube, Reddit, GitHub, RSS).
- **Czego nie robić:** część zalogowana (Instagram, LinkedIn, X) działa na kopii sesji z Chrome.
  Te serwisy banują konta za automaty, więc jeśli już, to na koncie zapasowym, nigdy na firmowym.
- **Stan:** niezainstalowane. Do sprawdzenia, czy da się włączyć same publiczne źródła.

## Umami (statystyki odwiedzin dla klientów)

- **Co to:** statystyki bez cookies, na naszym serwerze.
- **Po co nam:** „w tym miesiącu stronę odwiedziło 340 osób" to argument przy przedłużaniu abonamentu.
- **Co blokuje:** musi być dostępne z internetu (publiczny adres w tunelu Cloudflare), a każda strona
  klienta dostaje skrypt i dopisek w polityce prywatności.

## Licznik opinii z Booksy

- Część klientów pokazuje na stronie opinie z Booksy, a nie z Google. Booksy nie ma otwartego API.
- Do sprawdzenia: czy klient może dać nam dostęp partnerski albo czy wystarczy ręczna aktualizacja
  raz w miesiącu.

## Automatyczne odpowiedzi na opinie (wersja 2 „Opinii Google")

- Wymaga wniosku o dostęp do API wizytówki Google (wizytówka zweryfikowana od 60 dni).
- Sens dopiero po pierwszym płacącym kliencie na wersję 1.

## Skill do zdjęć

- Zmniejszanie, kadrowanie i konwersja do WebP przed wstawieniem na stronę (biblioteka sharp).
- Kadry i waga zdjęć to najczęstszy powód poprawek.
