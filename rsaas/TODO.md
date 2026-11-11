# RSaaS — do zrobienia

Kolejność = priorytet. Przy każdym punkcie: po co, zakres, co trzeba ustalić.

## 1. Rezerwacje telefoniczne w panelu

**Po co:** dziś obsługa widzi i anuluje rezerwacje, ale nie doda rezerwacji przyjętej przez telefon. Stolik zajęty telefonicznie jest wtedy dalej wolny w internecie, więc może dojść do podwójnej rezerwacji. To pierwsza rzecz, o którą zapyta każda restauracja.

**Zakres:**
- Panel: przycisk „Dodaj rezerwację”, czyli data, godzina, liczba osób, czas, imię, telefon i opcjonalnie e-mail i komentarz.
- System dobiera stolik tak samo jak online. Opcjonalnie obsługa może wybrać konkretny stolik.
- Baza: nowa funkcja `staff_create_reservation` sprawdza, czy osoba jest obsługą tej restauracji. Pole `source` przyjmuje wartość `online` albo `telefon`, a w panelu pojawia się znacznik „telefon”.
- Rezerwacja telefoniczna ignoruje limity gościa: minimalne wyprzedzenie, horyzont i limit na numer.
- Ta sama blokada podwójnej rezerwacji co dla rezerwacji online (constraint w bazie). Realtime działa od razu.
- Mail do gościa tylko wtedy, gdy obsługa poda e-mail.
- Testy: izolacja (obsługa A nie doda rezerwacji u B) i wyścig online kontra telefon.

## 2. Restauracja sama zmienia godziny, stoliki i zasady (do zbudowania)

**Odpowiedź: tak, da się.** Ten sam panel dostaje zakładkę „Ustawienia”, a uprawnienia działają tak jak przy rezerwacjach, czyli obsługa widzi i zmienia tylko swoją restaurację.

**Zakres:**
- **Godziny otwarcia:** każdy dzień tygodnia, w tym „zamknięte”.
- **Stoliki:** dodawanie, zmiana liczby miejsc i „od ilu osób”, wyłączanie stolika. Usuwania nie ma, bo stolik mógł mieć rezerwacje.
- **Zasady:** maks. grupa online, czasy przy stoliku, wyprzedzenie, horyzont, limit na numer, treść zasad, termin odwołania z maila.
- **Wyłączenie rezerwacji online** jednym przyciskiem, np. na remont albo zamkniętą imprezę.
- **Kontrola poprawności w bazie:** największy stolik musi mieć co najmniej tyle miejsc, ile wynosi maks. grupa, a zmiana nie może unieważnić przyszłych rezerwacji.
- **Opcjonalnie dni wyjątkowe**, np. „24.12 zamknięte”. Tego dziś w ogóle nie ma.
- **Przy okazji:** godziny na stronie (tabela i JSON-LD) wczytywane z bazy. Znika wtedy problem „godziny w dwóch miejscach”.

**Do ustalenia:** czy każdy pracownik może zmieniać ustawienia, czy tylko właściciel. Wtedy w tabeli `staff` potrzebna jest rola `owner` lub `staff`.

## 3. Maile nie w spamie

**Dlaczego dziś trafiają do spamu:** maile wychodzą ze zwykłego `@gmail.com` restauracji. Gmail już je podpisuje (SPF i DKIM przechodzą), więc nie chodzi o brakujący „autentykator”. Problemem jest świeże konto bez historii, które nagle wysyła automatyczne maile z linkami. Filtry traktują to podejrzliwie.

**Rozwiązanie:** wysyłka przez serwis do maili transakcyjnych z **domeny agencji**. Przykład: Resend, plan darmowy 3000 maili/mies.
- Nadawca np. `rezerwacje@<domena-agencji>.pl` z nazwą restauracji („Alticcio”), a w polu Reply-To mail restauracji. Odpowiedź gościa trafia do restauracji.
- W DNS domeny agencji dodajemy raz SPF, DKIM i DMARC. To jest ta „weryfikacja”, o którą pytasz, i działa dla wszystkich restauracji.
- Koniec z hasłami do aplikacji Gmail w każdej restauracji, a limit wysyłki jest wspólny i przewidywalny.
- Resend ma umowę powierzenia danych (RODO), czego zwykły Gmail nie ma.
- Zmiana w kodzie jest mała: `rsaas/server/smtp.js` zastępuje wywołanie API Resend. Ten sam serwis może wysyłać maile Supabase Auth (reset hasła).

**Do ustalenia:** domena agencji, której użyjemy. Potrzebny jest dostęp do jej DNS.

**Na teraz:** przy testach oznaczaj maile „To nie spam”, bo to buduje reputację skrzynki.

## 4. Druga restauracja: test na produkcji (OBOWIĄZKOWY po domknięciu Alticcio)

**Kiedy:** gdy Alticcio jest zamknięte (prawdziwa sala, domena, klient działa) i wdrażamy drugą restaurację — przed oddaniem jej klientowi.

**Co to znaczy:** cały system jest zbudowany tak, żeby restauracje się nie widziały. Restauracja A nie widzi rezerwacji B, a godzina zajęta w A nie znika w B. Sprawdzają to testy w bazie z dwiema restauracjami testowymi. Na prawdziwej produkcji działa jednak na razie tylko jedna restauracja. Przy dodawaniu drugiej trzeba więc raz, ręcznie, sprawdzić to na żywo:
- rezerwacja w B nie zajmuje godziny w A, i odwrotnie,
- panel A nie pokazuje rezerwacji B, a konto obsługi B nie wejdzie do panelu A,
- mail z B ma nazwę, adres i kolory B, a link „Odwołaj” prowadzi na stronę B,
- realtime: zmiana w B nie odświeża kalendarza A.

To jednorazowa kontrola, ok. 15 minut przy wdrożeniu drugiego klienta.

## Czeka na klienta

- **Alticcio:** prawdziwa lista stolików i domena. Wtedy: `new_restaurant.sql` z prawdziwą salą, domena w Cloudflare Pages, zdjęcie `noindex`, domena w Turnstile i w Supabase (`site_url` oraz adresy powrotne panelu).

## Kiedy będą płacący klienci

- **Supabase Pro (~100 zł/mies.):** dzienne backupy z przywracaniem jednym kliknięciem i brak usypiania. Patrz README, sekcja „Kiedy Pro”.
