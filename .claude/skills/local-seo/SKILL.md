---
name: local-seo
description: Lokalne SEO dla strony klienta ponad podstawy ze skilla web-design, czyli wizytówka Google (Google Business Profile), spójność danych NAP, dane strukturalne dla konkretnej branży, Search Console, katalogi firm. Użyj przy prośbach typu „SEO dla klienta", „pozycjonowanie lokalne", „dlaczego nie widać ich w Google", „wizytówka Google", „mapy Google", „Search Console", po wdrożeniu nowej domeny oraz gdy klient pyta, co ma zrobić, żeby być wyżej.
---

# Lokalne SEO

Dla lokalnej firmy usługowej o widoczności decyduje głównie **wizytówka Google**, a strona ją
wzmacnia. Podstawy na stronie (title, description, Open Graph, JSON-LD, szybkość) są w skillu
`web-design` i sprawdza je `reviewer`. Tutaj jest reszta.

Uczciwie wobec klienta: nie obiecujemy pozycji ani terminów. Mówimy, co robimy i po co.

## 1. Spójność danych (NAP)

Nazwa, adres i telefon muszą być **identyczne** w czterech miejscach: strona, wizytówka Google,
Facebook, Booksy. Sprawdź znak po znaku: numer lokalu, skróty („ul."), stary numer telefonu.

Rozjazd zgłoś użytkownikowi z nazwą miejsca i poprawną wersją. Wizytówkę i profile poprawia klient,
my poprawiamy stronę. Źródłem prawdy jest to, co potwierdził klient, a nie to, co widać w Google.

## 2. Wizytówka Google

Nie mamy do niej dostępu, chyba że klient doda nas jako menedżera. Przygotuj dla klienta krótką
listę „do zrobienia w wizytówce", tylko z punktów, które u niego faktycznie kuleją:

- **Kategoria główna** jak najwęższa (np. „Barber", nie „Fryzjer"), plus 2-3 dodatkowe.
- **Link do strony** ustawiony na nową domenę. Osobno link do rezerwacji (Booksy), jeśli jest.
- **Godziny** zgodne ze stroną, uzupełnione godziny świąteczne.
- **Usługi z cenami** wpisane w wizytówce, zgodne z cennikiem na stronie.
- **Zdjęcia:** lokal z zewnątrz (żeby dało się trafić), wnętrze, efekty pracy, zespół.
  Świeże, dodawane regularnie.
- **Opis firmy:** co robi i gdzie, prostym językiem, bez listy słów kluczowych.
- **Odpowiedzi na opinie:** na wszystkie, także stare. Pomaga skill `review-replies`.
- **Nowe opinie:** regularny dopływ jest ważniejszy niż jednorazowy zryw. To sprzedajemy jako
  produkt „Opinie Google" (`templates/automations/opinie-google/`).

Zasady Google dotyczące opinii, których pilnujemy u każdego klienta:
- prosimy **wszystkich** klientów, nie tylko zadowolonych,
- żadnych rabatów ani gratisów za opinię,
- nie zniechęcamy do opinii negatywnych i nie przepuszczamy klientów przez „ankietę wstępną".

## 3. Dane strukturalne dla branży

Zamiast ogólnego `LocalBusiness` użyj najwęższego pasującego typu ze schema.org:

| Branża | Typ |
|---|---|
| Barber, fryzjer | `HairSalon` |
| Kosmetyczka, makijaż, paznokcie | `BeautySalon` (paznokcie: `NailSalon`) |
| Masaż, spa | `DaySpa` albo `HealthAndBeautyBusiness` |
| Dentysta | `Dentist` |
| Trener personalny, siłownia | `ExerciseGym` albo `SportsActivityLocation` |
| Restauracja, kawiarnia | `Restaurant`, `CafeOrCoffeeShop` |
| Sklep | `Store` albo węższy (`ClothingStore`, `Florist`) |
| Detailing, warsztat | `AutoRepair`, `AutoWash` |
| Fotograf, ogrodnik, korepetytor, eventy | `LocalBusiness` albo `ProfessionalService` |

Pola, które mają być zawsze: `name`, `address` (`PostalAddress` z `streetAddress`, `postalCode`,
`addressLocality`, `addressCountry: "PL"`), `telephone` w formacie `+48…`, `url`, `image`,
`openingHoursSpecification`, `sameAs` (profile social), `geo` jeśli znamy współrzędne.

Na co uważać:
- **Firma dojeżdżająca do klienta** (ogrodnik, fotograf): dodaj `areaServed` z nazwami miejscowości.
  Adresu domowego nie eksponuj, jeśli klient go nie pokazuje.
- **Kilka lokalizacji:** osobny blok z własnym `@id` dla każdej, najlepiej na osobnej podstronie.
- **`aggregateRating` i `review` z opinii Google: nie dodawaj.** Google nie pokazuje gwiazdek dla
  opinii, które firma sama o sobie zamieszcza, a oznaczanie cudzych opinii jako własnych jest
  wbrew jego wytycznym. Ocenę i liczbę opinii pokazujemy na stronie jako zwykły tekst.
- Dane w JSON-LD muszą zgadzać się z tym, co widać na stronie. Żadnych pól „na zapas".

Sprawdzenie: wklej adres strony w Rich Results Test (search.google.com/test/rich-results).

## 4. Strona: rzeczy lokalne

- Nazwa miejscowości w `<title>`, w `<h1>` albo tuż pod nim i w `meta description`. Naturalnie,
  raz, bez wyliczanek „fryzjer Piotrków, fryzjer Bełchatów, fryzjer Łódź".
- Adres w `<address>`, telefon jako `tel:`, link „Wyznacz trasę".
- `sitemap.xml` i `robots.txt` z docelową domeną. Podstrony typu `privacy.html` z `noindex`.
- Jedna wersja adresu: `www` i wersja bez `www` nie mogą obie pokazywać tej samej treści bez
  przekierowania albo `<link rel="canonical">`.

## 5. Search Console (po każdym wdrożeniu nowej domeny)

1. Dodaj usługę typu „Domena" w Google Search Console.
2. Weryfikacja rekordem TXT w DNS. DNS jest w Cloudflare, więc rekord dodaje użytkownik w panelu.
3. Prześlij `sitemap.xml`.
4. Po kilku dniach sprawdź, czy strona główna jest zaindeksowana.

Dostęp do Search Console zostaje na koncie agencji. Klient dostaje dostęp, jeśli poprosi.

## 6. Katalogi firm

Dopiero gdy punkty 1-5 są zrobione. Wpisy z tymi samymi danymi NAP w kilku miejscach, które mają
sens dla danej branży: Facebook, Booksy, Mapy Apple (Apple Business Connect), Bing Places,
Panorama Firm, pkt.pl. Nie kupujemy pakietów „500 katalogów".

## Wynik pracy

Krótka odpowiedź dla użytkownika w trzech częściach:
1. **Poprawione na stronie** (co i gdzie).
2. **Do zrobienia przez klienta w wizytówce** (lista gotowa do przesłania, językiem klienta).
3. **Do zrobienia przez nas poza repo** (Search Console, rekord DNS).

Bez audytów na dziesięć stron i bez punktacji. Klient ma dostać listę, którą zrobi w kwadrans.
