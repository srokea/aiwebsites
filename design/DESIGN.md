<!-- SEED: re-run /impeccable document once pierwsza strona klienta istnieje w kodzie, żeby wyciągnąć realne tokeny i komponenty. -->

---
name: AI Web Agency — Design System
description: Stały fundament wizualny dla stron lokalnych firm usługowych — jeden akcent zmienny per klient, reszta stała.
---

# Design System: AI Web Agency

## 1. Overview

**Creative North Star: "The Handwritten Storefront"**

Strona ma czuć się jak dobrze zrobiony, rzemieślniczy szyld lokalnego sklepu — nie jak wygenerowany software'owy landing page. Ktoś szuka fryzjera albo dietetyczki w świetle dziennym na ulicy, albo wieczorem w domu przeglądając opinie przed telefonem — musi błyskawicznie odczytać cennik, godziny i dane kontaktowe niezależnie od warunków.

Motyw (jasny albo ciemny) jest zmienny per nisza klienta, nie ustalony sztywno dla całej agencji — dobierany do konwencji branży, nie do gustu projektanta:
- **Nisze rzemieślnicze/warsztatowe** (barber, detailing i podobne) → domyślnie **ciemny** motyw. Kojarzy się z warsztatem, skórą, metalem, wieczornym neonem szyldu — to jest ich naturalny rejestr wizualny.
- **Nisze wellness/higieniczne** (dietetyk, trener personalny, korepetycje i podobne) → domyślnie **jasny** motyw. Kojarzy się z czystością, spokojem, klarownością.

Niezależnie od wybranego motywu: kontrast tekstu podstawowego musi spełniać WCAG AA (≥4.5:1), a ciepło marki nie pochodzi z kremowego tła (to jest wypalony AI-domyślny wybór 2026 roku), tylko z akcentu i typografii — tło (jasne lub ciemne) zostaje neutralne i czyste, żeby cennik, zdjęcia i opinie były łatwe do skanowania wzrokiem w kilka sekund.

System odrzuca explicite: estetykę SaaS/startupową (gradientowe hero z abstrakcyjnymi kształtami, loga "trusted by", dashboardowy UI), typowe AI tells (font Inter, fioletowo-niebieskie gradienty, karty w kartach, szary tekst na kolorowym tle, czysty czarny #000, bounce/elastic animacje) i wszelki ton korporacyjno-sprzedażowy w treści.

**Key Characteristics:**
- Motyw dobierany per nisza klienta (rzemiosło/warsztat → ciemny, wellness/higiena → jasny), zawsze wysokokontrastowy — czytelność ponad nastrojowość, nigdy ciemny "bo wygląda cool" bez uzasadnienia niszą.
- Jeden ciepły ziemisty akcent, używany oszczędnie (≤10% powierzchni), zmienny per nisza klienta.
- Neutralne tło bez kremowego/piaskowego domyślnego AI-tła — prawdziwa biel (motyw jasny) albo bardzo ciemny stonowany neutral (motyw ciemny), nigdy pastelowy sand.
- Typografia: jeden kursywowy szeryf script display (Italianno) do nagłówków hero/sekcji (krótkie frazy, zawsze duży rozmiar) + jeden sans body (Work Sans) do reszty tekstu — nigdy więcej niż te dwa kroje, bez chłodu geometrycznego korpo-sansu.
- Motion: responsywny, nie choreografowany — subtelny feedback, żadnego "pokazu".

## 2. Colors

Paleta restrained: neutralne tło i tekst niosą 90%+ powierzchni, jeden akcent prowadzi wzrok tylko tam, gdzie trzeba (CTA, cena, aktywny stan).

### Primary
- **Ciepły ziemisty akcent** (`[do ustalenia przy implementacji]`): jeden kolor z rodziny terakota / rdza / ochra-musztarda / głęboki bursztyn / spalona sjena / glina, wybierany per klient z ustalonej puli 4-6 odcieni. Używany na CTA, aktywnych stanach, akcentach cenowych — nigdy jako duża powierzchnia tła.

### Neutral

Wybór jasnej albo ciemnej bazy jest decyzją per nisza klienta (patrz Overview), nie wariantem awaryjnym/nocnym jasnego motywu — to dwa równorzędne tryby tego samego systemu, każdy z kompletnym własnym zestawem neutrali.

- **Baza (tło), motyw jasny** (`[do ustalenia przy implementacji]`): prawdziwa biel przy chroma ≈0 — świadomie NIE kremowy/piaskowy/paper-tint (OKLCH L 0.84-0.97, C<0.06, hue 40-100 to zakazane pasmo — patrz Named Rule niżej).
- **Baza (tło), motyw ciemny** (`[do ustalenia przy implementacji]`): bardzo ciemny stonowany neutral (nie czysty #000) — chroma niska, ewentualnie lekko przechylona w stronę akcentu, nigdy w stronę mulistej zieleni/niebieskości typowej dla dashboardów SaaS.
- **Ink (tekst)** (`[do ustalenia przy implementacji]`): w motywie jasnym — ciemny, prawie-czarny neutral (nie czysty #000); w motywie ciemnym — jasny, prawie-biały neutral (nie czysty #FFF). W obu przypadkach kontrast tekstu podstawowego ≥4.5:1 wobec tła (WCAG AA).
- **Granica / divider** (`[do ustalenia przy implementacji]`): subtelny neutral o niskim kontraście względem tła danego motywu, bez wyraźnego odcienia.

### Named Rules
**The No-Cream Rule.** W motywie jasnym tło bazowe nigdy nie ląduje w paśmie kremu/piasku/paper (L 0.84-0.97, C<0.06, H 40-100) — to jest saturowany domyślny wybór AI z 2026 roku i zabija poczucie, że stronę robił człowiek dla konkretnej lokalnej firmy. Ciepło marki niesie akcent i typografia, nie tło.

**The One Accent Rule.** Tylko jeden kolor akcentu na stronę, wybrany z ustalonej puli 4-6 odcieni ziemistych, używany na ≤10% powierzchni. Różne nisze (barber, salon, masaż, dietetyk...) dostają różny odcień z tej samej puli — nigdy własną, niezależną paletę. Zasada obowiązuje identycznie w obu motywach.

**The Niche-Driven Theme Rule.** Jasny/ciemny to wybór wynikający z konwencji branży klienta (patrz Overview), nie z domyślnego ustawienia agencji ani z estetycznej mody. Raz wybrany motyw dla danej niszy zostaje spójny między klientami tej samej niszy — nie zmienia się per projekt bez uzasadnienia.

## 3. Typography

**Display Font:** `Italianno` — kursywowy font script (jedna waga, regular), używany wyłącznie w głównych nagłówkach sekcji i hero. Krój jest już z natury kursywny — nie łączyć z dodatkowym stylem `italic`.
**Body Font:** `Work Sans` — cała reszta tekstu: opisy usług, cennik, opinie, przyciski, etykiety.

**Character:** Display (Italianno) niesie romantyczny, rzemieślniczy, odręczny charakter — silny kontrast wobec neutralnego, funkcjonalnego Body (Work Sans), które niesie czytelność. Bez chłodu geometrycznego sansu korporacyjnego w roli body (Inter i podobne są zakazane — patrz Do's and Don'ts).

**Uwaga o czytelności.** Italianno jest bardzo ozdobnym, cienkim krojem script — czytelny tylko w dużych rozmiarach i przy krótkich frazach (nazwa firmy, 1-3 słowa nagłówka). Nigdy nie używać go w body, cenniku, przyciskach, etykietach czy jakimkolwiek tekście poniżej ok. 2rem — tam zawsze Work Sans.

### Hierarchy
- **Display** (Italianno, `clamp()` do ustalenia, zawsze duży): nagłówek hero, nazwa firmy/usługi — max jeden na stronę.
- **Headline** (Italianno): nagłówki sekcji (cennik, opinie, o nas) — krótkie frazy, nie całe zdania.
- **Body** (Work Sans, waga do ustalenia, max 65-75ch): opisy usług, treść sekcji.
- **Label** (Work Sans, waga do ustalenia): godziny otwarcia, etykiety cen, przyciski.

### Named Rules
**The Two-Typeface Rule.** Jeden kursywowy szeryf script display (Italianno) + jeden sans body (Work Sans), nigdy więcej niż te dwa kroje. Display tylko w głównych nagłówkach sekcji i hero — nigdy w body, cenniku czy przyciskach.

**The No-Eyebrow Rule.** Żadnych małych uppercase-trackowanych "kickerów" (ABOUT / PROCESS / PRICING) nad każdą sekcją — to saturowany AI-tell z 2023-25. Nagłówki sekcji stoją same, bez dekoracyjnego poprzedzenia.

## 4. Elevation

System responsywny, nie choreografowany — domyślnie płaski. Głębia budowana przez warstwowanie tonalne (delikatnie inny neutral tła sekcji), nie przez cienie. Cień pojawia się wyłącznie jako reakcja na stan (hover na CTA, focus na formularzu), nigdy jako stały element karty czy sekcji.

### Named Rules
**The Flat-By-Default Rule.** Powierzchnie są płaskie w spoczynku. Cień to odpowiedź na interakcję, nie dekoracja spoczynkowa.

## 5. Components

*(Brak komponentów do udokumentowania — projekt jest przed-implementacyjny. Ta sekcja wypełni się realnymi wzorcami przy pierwszym `/impeccable document` w trybie skanowania, po zbudowaniu pierwszej strony klienta.)*

Kierunki na start (do potwierdzenia w Scan mode):
- **Przyciski**: pełne (nie same-obrysowe) dla CTA głównego, oszczędny akcent-fill; brak `border-left`/`border-right` jako kolorowej belki.
- **Nawigacja**: prosta, mobile-first — numer telefonu klikalny (`tel:`) zawsze widoczny w headerze.
- **Cennik / listy usług**: bez zagnieżdżonych kart w kartach — pełne wiersze albo lekkie tło sekcji, nie karta-w-karcie.

## 6. Do's and Don'ts

### Do:
- **Do** trzymaj tło neutralne (prawdziwa biel lub ciemny stonowany neutral), ciepło przenieś do akcentu i typografii.
- **Do** używaj jednego akcentu z ustalonej puli ziemistych odcieni, oszczędnie (≤10% powierzchni).
- **Do** zapewnij numer telefonu klikalny (`tel:`) widoczny w headerze na każdej stronie klienta.
- **Do** projektuj i testuj od najmniejszego ekranu w górę (mobile-first).
- **Do** trzymaj motion responsywny — subtelny hover/fade, żadnej choreografii.

### Don't:
- **Don't** używaj tła w paśmie kremu/piasku/paper (L 0.84-0.97, C<0.06, H 40-100) — to jest wypalony AI-domyślny wybór.
- **Don't** używaj fontu Inter ani podobnych chłodnych geometrycznych sansów korpo.
- **Don't** dodawaj gradientowego hero z abstrakcyjnymi kształtami, logotypów "trusted by", ani dashboardowego UI — to lokalny biznes usługowy, nie SaaS.
- **Don't** stosuj kart w kartach (nested cards), `border-left`/`border-right` jako kolorowej belki, gradient text, ani animacji bounce/elastic.
- **Don't** dodawaj małych uppercase-trackowanych "eyebrow" nad każdą sekcją ani numerowanych markerów sekcji (01/02/03) jako domyślnego rusztowania.
- **Don't** wchodź w ton sprzedażowy/korporacyjny w treści strony klienta.
