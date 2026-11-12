# Automatyzacje: katalog produktów

Rzeczy, które sprzedajemy klientom ponad stronę. Zasada ta sama co przy stronach: **jedna prosta
dopłata do abonamentu za jeden produkt**, bez pakietów i poziomów.

| Produkt | Folder | Stan | Dla kogo | Cena |
|---|---|---|---|---|
| Opinie Google (karta NFC/QR z webappa albo strona `/opinia/` + odpowiedzi na opinie) | `opinie-google/` | **gotowy do pilotażu** (wersja 1) | każdy klient z wizytówką Google | DO USTALENIA |
| Licznik opinii na stronie (liczba i ocena z Google odświeżane codziennie, bez wdrażania strony) | `workers/opinie-licznik/` | **zbudowany, czeka na klucz Google i wdrożenie** | klienci, którzy pokazują na stronie opinie z Google | w abonamencie |
| Ścieżka wizyty (potwierdzenia, przypomnienia, wiadomość po wizycie) | brak | w planach | klienci BEZ Booksy, z rezerwacją u nas | nie oferować |
| Recepcja głosowa (odbieranie telefonów) | brak | w planach, na końcu | po sprawdzeniu jakości po polsku | nie oferować |

Kolumnę „Cena" uzupełniają właściciele agencji. Dopóki jest tam „DO USTALENIA", skill
`automation-offer` nie poda klientowi kwoty, tylko o nią zapyta.

## Zasady wspólne dla wszystkich produktów

**Opinie (zasady Google, sprawdzone w listopadzie 2026 w jego polityce treści):**
- O opinię prosimy każdego klienta. Nie wybieramy zadowolonych i nie robimy „ankiety wstępnej",
  po której tylko część osób dostaje link do Google.
- Nic w zamian za opinię: żadnych rabatów, gratisów, losowań.
- Nie zniechęcamy do opinii negatywnych i nie naciskamy na wystawienie opinii na miejscu.
- Pracownicy nie dostają norm typu „pięć opinii tygodniowo".

Złamanie tych zasad kończy się usuwaniem opinii przez Google, a to klient traci, nie my.

**Dane osobowe:**
- Wersja 1 „Opinii Google" nie przetwarza danych osobowych po naszej stronie.
- Każdy produkt, który wysyła SMS-y albo e-maile do klientów naszego klienta, wymaga umowy
  powierzenia danych i sprawdzenia zgód. Prośba o opinię wysłana SMS-em bywa traktowana jak
  marketing. Bez tych dwóch rzeczy nie uruchamiamy wysyłek.
- Branże medyczne (dentysta, fizjoterapia, dietetyk kliniczny) to dane o zdrowiu. Nie bierzemy
  ich jako pierwszych klientów na automatyzacje.

**Technologia:**
- To, co wymaga serwera, stawiamy na Cloudflare Workers, tam gdzie stoją strony.
- Booksy nie udostępnia samoobsługowego API (jest tylko dla partnerów), więc niczego nie opieramy
  na danych z Booksy.
- API wizytówki Google wymaga wniosku o dostęp i wizytówki zweryfikowanej od co najmniej 60 dni.
  Do czasu przyznania dostępu limit zapytań wynosi zero.

## Jak dodać nowy produkt

Folder z plikami `README.md` (co to jest i jak wdrożyć), `wymagania.md` (czego potrzebujemy od
klienta), `teksty.md` (gotowe komunikaty), `test-plan.md` (jak sprawdzić po wdrożeniu), `rodo.md`.
Dopisz wiersz w tabeli wyżej. Produkt bez przejścia `test-plan.md` u prawdziwego klienta ma stan
„pilotaż", nie „gotowy".
