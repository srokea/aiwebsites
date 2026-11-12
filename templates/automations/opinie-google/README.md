# Opinie Google (wersja 1)

## Co klient dostaje

Jednym zdaniem dla klienta: **„Stawiamy przy kasie kod, którym klienci w kilka sekund wystawiają
opinię w Google, a my pilnujemy, żeby na każdą opinię była odpowiedź."**

1. **Strona do opinii**, w jednym z dwóch wariantów:
   - **Karta w naszym systemie** (`mmates.pl/r/<slug>`): zakładana w panelu webappa
     (`/reviews.html`), działa też z kartą NFC. Domyślny wybór, bo już istnieje i nie wymaga
     wdrożenia.
   - **Strona `/opinia/` na domenie klienta**, w kolorach jego strony, z dodatkowymi przyciskami
     (rezerwacja, social media, telefon). Dla klientów, którzy mają u nas stronę i chcą własny adres.
2. **Kod QR do druku** (stojak przy kasie, wizytówka, naklejka na lustrze). Kod prowadzi na stronę
   klienta, a nie wprost do Google, więc po wydrukowaniu wciąż da się zmienić, dokąd kieruje.
3. **Odpowiedzi na opinie.** Raz w tygodniu przygotowujemy szkice odpowiedzi na nowe opinie.
   Właściciel akceptuje je jedną wiadomością. Trudne opinie zawsze zostawiamy jemu, z naszą
   propozycją.
4. **Krótki raport raz w tygodniu:** ile opinii przybyło, jaka jest średnia, na ile odpowiedziano.

## Czego w wersji 1 nie ma i dlaczego

- **Automatycznego pobierania opinii i publikowania odpowiedzi.** API wizytówki Google wymaga
  wniosku o dostęp, a do czasu jego przyznania nie przepuszcza żadnych zapytań. Najpierw sprawdzamy
  na pilotażu, czy klienci za to płacą, potem składamy wniosek i automatyzujemy.
- **SMS-ów po wizycie.** Wymagają numeru klienta i godziny wizyty, czyli danych z systemu
  rezerwacji. Booksy ich nie udostępnia. Do tego dochodzą zgody i umowa powierzenia.
- **Licznika skanów.** Liczy się liczba nowych opinii, a tę widać w wizytówce.

## Wdrożenie krok po kroku

Robi to skill `automation-setup`. Całość to około godziny pracy.

1. Zbierz od klienta rzeczy z `wymagania.md` i dopisz je do jego `brief.md`.
2. Wariant z kartą: załóż kartę w panelu `/reviews.html` i przejdź do kroku 6 z adresem
   `https://mmates.pl/r/<slug>`. Wariant `/opinia/`: skopiuj `hub/index.html` do folderu klienta
   jako `opinia/index.html` i idź dalej po kolei.
3. Podmień wszystkie znaczniki WIELKIMI LITERAMI. Kolory i kroje pisma przepisz ze strony głównej
   klienta. Usuń przyciski, na które nie ma linku.
4. Zrób zrzuty ekranu i przejdź `test-plan.md`.
5. Wdróż stronę (skill `deploy-cloudflare`, po zgodzie użytkownika).
6. Wygeneruj kod: `node scripts/qr.mjs <adres strony do opinii> clients/.../qr-opinia.svg`
7. Przygotuj materiał do druku (tekst w `teksty.md`) i wyślij klientowi razem z krótką instrukcją.

## Obsługa co tydzień

1. Otwórz wizytówkę klienta i zbierz nowe opinie (jako menedżer wizytówki albo z tego, co
   właściciel przesłał).
2. Skill `review-replies` przygotowuje szkice.
3. Wyślij właścicielowi szkice i raport (wzór w `teksty.md`). Po akceptacji wklej odpowiedzi
   w wizytówce albo zostaw to jemu, zależnie od ustaleń w briefie.

## Zasady, których nie łamiemy

Pełna lista w `templates/automations/README.md`. Najważniejsze: prosimy wszystkich, nic w zamian
za opinię, żadnego odsiewania niezadowolonych. Strona `/opinia/` celowo nie ma pytania
„Czy jesteś zadowolony?" przed linkiem do Google.

## Co dalej (wersja 2, po pierwszym płacącym kliencie)

Wniosek o dostęp do API wizytówki Google, a po jego przyznaniu worker, który sam pobiera nowe
opinie, przygotowuje szkice i wysyła je właścicielowi do akceptacji. Plan rozpisuje agent `planner`.
