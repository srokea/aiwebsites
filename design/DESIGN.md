---
name: AI Web Agency — Design System
description: Stały fundament wizualny dla stron lokalnych firm usługowych — jeden akcent zmienny per klient, reszta stała.
colors:
  bg-dark: "#0B0906"
  surface-dark: "#232323"
  ink-dark: "#F3EEE3"
  ink-muted-dark: "#CBC3B3"
  border-dark: "rgba(243,238,227,0.12)"
  accent-warm-amber: "#C79A4B"
  bg-light: "#FFFFFF"
  surface-light: "#F2F2F2"
  ink-light: "#1A1A1A"
  ink-muted-light: "#5A5A5A"
  border-light: "rgba(26,26,26,0.12)"
typography:
  display:
    fontFamily: "Bodoni Moda, serif"
    fontSize: "clamp(2.1rem, 3.2vw + 1.4rem, 3.75rem)"
    fontWeight: 500
    lineHeight: 1.1
  headline:
    fontFamily: "Bodoni Moda, serif"
    fontSize: "clamp(1.75rem, 2.5vw + 1.1rem, 2.75rem)"
    fontWeight: 500
    lineHeight: 1.15
  body:
    fontFamily: "Work Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Work Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  pill: "9999px"
  lg: "1rem"
  xl: "1.5rem"
spacing:
  container-max: "64rem"
  section-y: "4rem"
  section-y-lg: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-warm-amber}"
    textColor: "{colors.bg-dark}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.accent-warm-amber}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted-dark}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-ghost-hover:
    textColor: "{colors.ink-dark}"
---

# Design System: AI Web Agency

## 1. Overview

**Creative North Star: "The Handwritten Storefront"**

Strona ma czuć się jak dobrze zrobiony, rzemieślniczy szyld lokalnego sklepu — nie jak wygenerowany software'owy landing page. Ktoś szuka fryzjera albo dietetyczki w świetle dziennym na ulicy, albo wieczorem w domu przeglądając opinie przed telefonem — musi błyskawicznie odczytać cennik, godziny i dane kontaktowe niezależnie od warunków.

Motyw (jasny albo ciemny) jest zmienny per nisza klienta, nie ustalony sztywno dla całej agencji — dobierany do konwencji branży, nie do gustu projektanta:
- **Nisze rzemieślnicze/warsztatowe** (barber męski, detailing i podobne) → domyślnie **ciemny** motyw. Kojarzy się z warsztatem, skórą, metalem, wieczornym neonem szyldu — to jest ich naturalny rejestr wizualny.
- **Nisze wellness/higieniczne** (dietetyk, trener personalny, korepetycje i podobne) → domyślnie **jasny** motyw. Kojarzy się z czystością, spokojem, klarownością.
- **Salony fryzjerskie damskie/uniseks** (stylizacja, koloryzacja, fryzury okolicznościowe/ślubne) → domyślnie **jasny** motyw, bliżej rejestru wellness niż warsztatu — rzemiosło tu jest precyzyjne i estetyczne, nie "brudnorobocze". Potwierdzone w kodzie: M.E.N.-for-real i Studio Fryzur Lidia.
- **Barber męski** pozostaje przy domyślnym ciemnym motywie z rejestru rzemieślniczego powyżej.

**Override per fizyczny lokal.** Niezależnie od domyślnego motywu niszy, gdy brief klienta wprost wskazuje kolorystykę/nastrój jego rzeczywistego lokalu (np. dominujący kolor ścian widoczny na zdjęciach), ten sygnał wygrywa z domyślną regułą niszy — strona ma odzwierciedlać KONKRETNY salon, nie tylko branżę. Potwierdzone w kodzie: M.E.N.-for-real (jasny + czerwony, dopasowany do fizycznego wnętrza salonu, brief wprost: "motyw: jasny i akcent: czerwony — dominujący kolor fizycznego salonu") oraz Studio Fryzur Lidia (jasny + turkus, ze zdjęć turkusowej ściany salonu). Każdy taki override jest udokumentowanym wyjątkiem tego klienta, nie zmianą domyślnej reguły niszy — chyba że wzorzec potwierdzi się u kolejnych klientów tej samej niszy i użytkownik zdecyduje inaczej.

> **Uwaga o starszej wersji w kodzie:** folder `clients/M.E.N.` (ciemny, Playfair Display, akcent bursztynowy) to WCZEŚNIEJSZA, zastąpiona wersja tego klienta. Aktualna, obowiązująca wersja to `clients/M.E.N.-for-real` (jasny, akcent czerwony). Nie traktuj starego folderu jako potwierdzonego wzorca.

Niezależnie od wybranego motywu: kontrast tekstu podstawowego musi spełniać WCAG AA (≥4.5:1), a ciepło marki nie pochodzi z kremowego tła (to jest wypalony AI-domyślny wybór 2026 roku), tylko z akcentu i typografii — tło (jasne lub ciemne) zostaje neutralne i czyste, żeby cennik, zdjęcia i opinie były łatwe do skanowania wzrokiem w kilka sekund.

System odrzuca explicite: estetykę SaaS/startupową (gradientowe hero z abstrakcyjnymi kształtami, loga "trusted by", dashboardowy UI), typowe AI tells (font Inter, fioletowo-niebieskie gradienty, karty w kartach, szary tekst na kolorowym tle, czysty czarny #000, bounce/elastic animacje) i wszelki ton korporacyjno-sprzedażowy w treści.

**Key Characteristics:**
- Motyw dobierany per nisza klienta (rzemiosło/warsztat → ciemny, wellness/higiena → jasny), zawsze wysokokontrastowy — czytelność ponad nastrojowość, nigdy ciemny "bo wygląda cool" bez uzasadnienia niszą.
- Jeden ciepły ziemisty akcent, używany oszczędnie (≤10% powierzchni), zmienny per nisza klienta.
- Neutralne tło bez kremowego/piaskowego domyślnego AI-tła — prawdziwa biel (motyw jasny) albo bardzo ciemny stonowany neutral (motyw ciemny), nigdy pastelowy sand.
- Typografia: jeden elegancki szeryf display (Bodoni Moda) do nagłówków hero/sekcji + jeden sans body (Work Sans) do reszty tekstu — nigdy więcej niż te dwa kroje, bez chłodu geometrycznego korpo-sansu.
- Motion: responsywny, nie choreografowany — subtelny feedback, żadnego "pokazu".
- Głębia przez warstwowanie tonalne: naprzemienne sekcje na dwóch odcieniach tła (bazowy vs. jaśniejszy/ciemniejszy neutral sekcji), zamiast cieni.

## 2. Colors

Paleta restrained: neutralne tło i tekst niosą 90%+ powierzchni, jeden akcent prowadzi wzrok tylko tam, gdzie trzeba (CTA, cena, aktywny stan).

### Primary
- **Ciepły bursztynowy akcent** (`#C79A4B`): pierwszy potwierdzony w kodzie odcień z puli ziemistej (rodzina terakota / rdza / ochra-musztarda / głęboki bursztyn / spalona sjena / glina). Używany na CTA, gwiazdkach ocen, aktywnych stanach, dekoracyjnych akcentach (nigdy jako duża powierzchnia tła). Pozostałe 3-5 odcieni puli wciąż `[do ustalenia]` — każdy kolejny klient/nisza odblokowuje następny potwierdzony odcień.

### Neutral

Wybór jasnej albo ciemnej bazy jest decyzją per nisza klienta (patrz Overview), nie wariantem awaryjnym/nocnym jasnego motywu — to dwa równorzędne tryby tego samego systemu, każdy z kompletnym własnym zestawem neutrali.

- **Baza (tło), motyw ciemny** (`#0B0906`): bardzo ciemny, ledwo ciepły neutral (nie czysty #000) — potwierdzone w kodzie (M.E.N.). Chroma bliska zeru, z śladowym ciepłym odchyleniem w stronę akcentu.
- **Tło sekcji, motyw ciemny** (`#232323`): osobny, achromatyczny szary — naprzemienne sekcje (Cennik, Galeria) używają go do warstwowania tonalnego względem bazy `#0B0906`, bez cienia.
- **Baza (tło), motyw jasny** (`#FFFFFF`): prawdziwa biel przy chroma ≈0 — świadomie NIE kremowy/piaskowy/paper-tint (OKLCH L 0.84-0.97, C<0.06, hue 40-100 to zakazane pasmo — patrz Named Rule niżej). Potwierdzone w kodzie: M.E.N.-for-real, Studio Fryzur Lidia.
- **Tło sekcji, motyw jasny** (`#F2F2F2`): osobny, achromatyczny jasny szary do naprzemiennego warstwowania sekcji na tle `#FFFFFF` (analogicznie do `surface-dark` w motywie ciemnym). Potwierdzone w kodzie: M.E.N.-for-real. Dla klientów z akcentem chłodnym (np. turkus) dopuszczalny bardzo lekki chromatyczny odcień tej samej jasności zamiast czystego szarego (np. `#EFF8F7` u Studio Fryzur Lidia) — to nadal "surface", nie nowy token stały.
- **Ink (tekst), motyw ciemny** (`#F3EEE3`): jasny, prawie-biały ciepły neutral — potwierdzone w kodzie. Kontrast wobec `#0B0906` znacznie przekracza WCAG AA.
- **Ink muted (tekst drugorzędny), motyw ciemny** (`#CBC3B3`): przyciemniony, cieplejszy neutral dla etykiet, dat, opisów drugorzędnych — potwierdzone w kodzie.
- **Ink (tekst), motyw jasny** (`#1A1A1A`): ciemny, prawie-czarny neutral (nie czysty #000). Potwierdzone w kodzie: M.E.N.-for-real, Studio Fryzur Lidia.
- **Ink muted (tekst drugorzędny), motyw jasny** (`#5A5A5A`): przyciemniony szary dla etykiet, dat, opisów drugorzędnych. Potwierdzone w kodzie: M.E.N.-for-real.
- **Granica / divider, motyw ciemny** (`rgba(243,238,227,0.12)`): ink przy 12% krycia — subtelny podział list, kart, sekcji. Potwierdzone w kodzie.
- **Granica / divider, motyw jasny** (`rgba(26,26,26,0.12)`): ink jasnego motywu przy 12% krycia. Potwierdzone w kodzie: M.E.N.-for-real.

### Named Rules
**The No-Cream Rule.** W motywie jasnym tło bazowe nigdy nie ląduje w paśmie kremu/piasku/paper (L 0.84-0.97, C<0.06, H 40-100) — to jest saturowany domyślny wybór AI z 2026 roku i zabija poczucie, że stronę robił człowiek dla konkretnej lokalnej firmy. Ciepło marki niesie akcent i typografia, nie tło.

**The One Accent Rule.** Tylko jeden kolor akcentu na stronę, wybrany z ustalonej puli 4-6 odcieni ziemistych, używany na ≤10% powierzchni. Różne nisze (barber, salon, masaż, dietetyk...) dostają różny odcień z tej samej puli — nigdy własną, niezależną paletę. Zasada obowiązuje identycznie w obu motywach. Uwaga z praktyki (M.E.N.): pilnować, żeby akcent był JEDNYM zdefiniowanym tokenem używanym wszędzie (`accent`) — nie osobnym zbliżonym hexem wpisanym ręcznie przy jednym komponencie (np. gwiazdki ocen), bo dwa prawie-identyczne złote odcienie obok siebie łamią regułę ciszej niż jeden rażący błąd.

> **Wyjątki poza pulą ziemistą (nie kopiować bez pytania):** M.E.N.-for-real używa czerwieni `#B3261E` dopasowanej do fizycznego salonu klienta, a Studio Fryzur Lidia używa turkusu ze zdjęć swojej turkusowej ściany — oba to udokumentowane, jednorazowe wyjątki uzgodnione z użytkownikiem dla KONKRETNEGO klienta (fizyczny lokal wygrywa z pulą, patrz Overview → "Override per fizyczny lokal"), nie rozszerzenie stałej puli agencji. Kolejny klient nie dostaje automatycznie chłodnego/nieziemistego akcentu bez analogicznego uzasadnienia i pytania do użytkownika.

**The Niche-Driven Theme Rule.** Jasny/ciemny to wybór wynikający z konwencji branży klienta (patrz Overview), nie z domyślnego ustawienia agencji ani z estetycznej mody. Raz wybrany motyw dla danej niszy zostaje spójny między klientami tej samej niszy — nie zmienia się per projekt bez uzasadnienia. Wyjątek: gdy brief klienta wprost opisuje kolorystykę/nastrój jego fizycznego lokalu, ten sygnał wygrywa z domyślną regułą niszy (patrz Overview → "Override per fizyczny lokal") — to nadal wymaga jawnego uzgodnienia z użytkownikiem, nie automatycznego odstępstwa.

## 3. Typography

**Display Font:** `Bodoni Moda` — elegancki, kontrastowy didone (variable, wagi 400-900), używany wyłącznie w głównych nagłówkach sekcji i hero; w hero wagi 500-600, opsz dobierany automatycznie. Kursywa dozwolona jako akcent (np. jedno słowo w nagłówku), nigdy na całym nagłówku. Standard zatwierdzony 2026-07-11, zastępuje wcześniejszy standard Fraunces.
**Body Font:** `Work Sans` — cała reszta tekstu: opisy usług, cennik, opinie, przyciski, etykiety.

**Character:** Display (Bodoni Moda) niesie elegancję i kontrast kresek — kontrast wobec neutralnego, funkcjonalnego Body (Work Sans), które ma być czytelne i przyjazne na małym ekranie. Bez chłodu geometrycznego sansu korporacyjnego w roli body (Inter i podobne są zakazane — patrz Do's and Don'ts).

> **Strony dostarczone przed zmianą standardu (nie ruszać):** `clients/M.E.N.`, `clients/M.E.N.-for-real` i `clients/Studio-Fryzur-Lidia` renderują display starszymi krojami (Playfair Display / Fraunces) — to żywe, dostarczone strony klientów i ZOSTAJĄ bez zmian. Bodoni Moda obowiązuje wyłącznie dla NOWEJ produkcji od 2026-07-11. Nie kopiuj Playfair Display ani Fraunces do nowych projektów bez wyraźnej prośby użytkownika.

### Hierarchy
- **Display** (Bodoni Moda, waga 500, `clamp(2.1rem, 3.2vw + 1.4rem, 3.75rem)`, line-height 1.1): nagłówek hero, nazwa firmy/usługi — max jeden na stronę.
- **Headline** (Bodoni Moda, waga 500, `clamp(1.75rem, 2.5vw + 1.1rem, 2.75rem)`, line-height 1.15): nagłówki sekcji (Godziny, Cennik, Opinie, Galeria, Kontakt).
- **Body** (Work Sans, waga 400, max 65-75ch): opisy usług, treść sekcji, cytaty opinii (`text-lg`, `leading-relaxed`).
- **Label** (Work Sans, waga 500, `text-sm`): godziny otwarcia, etykiety cen, przyciski, stopka.

### Named Rules
**The Two-Typeface Rule.** Jeden szeryf display (Bodoni Moda) + jeden sans body (Work Sans), nigdy więcej niż te dwa kroje. Display tylko w głównych nagłówkach sekcji i hero — nigdy w body, cenniku czy przyciskach.

**The No-Eyebrow Rule.** Żadnych małych uppercase-trackowanych "kickerów" (ABOUT / PROCESS / PRICING) nad każdą sekcją — to saturowany AI-tell z 2023-25. Nagłówki sekcji stoją same, bez dekoracyjnego poprzedzenia.

## 4. Elevation

System responsywny, nie choreografowany — domyślnie płaski. Głębia budowana przez warstwowanie tonalne (delikatnie inny neutral tła sekcji), nie przez cienie. Cień pojawia się wyłącznie jako reakcja na stan (hover na CTA, focus na formularzu), nigdy jako stały element karty czy sekcji.

Potwierdzony w kodzie wzorzec (M.E.N.): sekcje na przemian używają `bg-dark` (#0B0906) i `surface-dark` (#232323) — np. Godziny/Opinie/Kontakt na bazie, Cennik/Galeria na `surface-dark` — zamiast obwódek czy cieni do oddzielenia bloków treści.

Dodatkowo: bardzo subtelny, nieruchomy gradient tła (radialne poświaty w kolorze akcentu przy 5-10% krycia, rozproszone w kilku punktach strony) dodaje optyczną głębię pustym, płaskim obszarom — to nie jest "gradientowe hero z kształtami" (zakazane), tylko ambientowe, prawie niewidoczne oświetlenie tła, spójne z całą stroną, nie ograniczone do hero.

### Named Rules
**The Flat-By-Default Rule.** Powierzchnie są płaskie w spoczynku. Cień to odpowiedź na interakcję, nie dekoracja spoczynkowa.

## 5. Components

Charakter komponentów: rzemieślniczy i spokojny — pełne, wyraźne kształty (nie same-obrysowe jako domyślne), zero zagnieżdżonych kart, zero dekoracyjnych ikon-w-kółkach nad nagłówkami.

### Niche Badge (element wycofany z hero)
- **Status: NIE dodawaj domyślnie.** Badge (kołowa obwódka + ikona niszy przy hero) został usunięty na prośbę użytkownika u obu klientów, u których go wstawiono (M.E.N. — zrzut "hero-nobadge", Lidia — commit "znak z headlinu"). Praktyka pokazała, że przy nagłówku wygląda jak dekoracyjna ikonka-nad-nagłówkiem (anty-wzorzec z Do's and Don'ts).
- Jeśli kiedyś wróci, to wyłącznie na wyraźną prośbę użytkownika i raczej poza hero (np. stopka, favicon) — cienka linia w kolorze akcentu, ikona dobrana per nisza.

### Buttons
- **Shape:** w pełni zaokrąglone, pigułkowe (`border-radius: 9999px`).
- **Primary:** wypełnienie akcentem (`bg-accent`), tekst w kolorze tła (`text-bg`), `font-semibold`, padding `14px 28px` (`px-7 py-3.5`), min. wysokość 44px (dotyk). Hover: `brightness-110`.
- **Ghost (secondary):** przezroczyste tło, cienka obwódka `border-border`, tekst `ink-muted`. Hover: obwódka i tekst przechodzą na pełny `ink`.
- **Motion:** `transition` na kolor/jasność, z `motion-reduce:transition-none` zawsze obecnym.

### Lists / Cennik / Godziny
- **Styl:** płaskie wiersze w `<dl>`, oddzielone `divide-y` + `border-y` w kolorze `border` — bez kart w kartach, bez tła per wiersz.
- **Układ:** etykieta po lewej (`ink-muted`), wartość po prawej (`font-medium`, pełny `ink`), `justify-between`.

### Reviews / Opinie
- **Styl:** `<blockquote>` bez tła i bez obwódki dookoła — tylko górna krawędź (`border-t border-border`) jako separator w siatce 2 kolumn.
- **Wzorzec:** 5 gwiazdek w kolorze akcentu nad cytatem, cytat w `text-lg leading-relaxed`, autor + źródło + ocena w `text-sm text-inkmuted` pod spodem.

### Galeria (placeholder tiles)
- **Styl:** kwadratowe kafle `aspect-square`, `rounded-2xl`, `border border-dashed border-border` — świadomie oznaczone jako "miejsce na przyszłe zdjęcia", nie fałszywe zdjęcia zastępcze.
- **Sygnał braku treści:** dashed border + ikona linii (nie solidne wypełnienie), żeby nie udawać gotowego zdjęcia.

### Navigation
- **Styl:** sticky header, "frosted glass" (półprzezroczyste ciemne tło + `backdrop-filter: blur`), subtelna dolna krawędź (`border-bottom: 1px solid rgba(255,255,255,0.08)`) zamiast pełnej nieprzezroczystości.
- **Typografia:** wordmark w Body foncie (nie Display) — nawet gdy Display jest kursywowy/ozdobny, mały wordmark w headerze zostaje w sansie dla czytelności przy małym rozmiarze.
- **Zawartość:** logo/nazwa po lewej, linki sekcji na środku (ukryte na mobile), telefon jako wypełniony przycisk-CTA po prawej, zawsze widoczny, `tel:` link.
- **Mobile:** linki nawigacyjne chowane (`hidden sm:flex`), zostaje tylko logo + telefon-CTA.

### Map embed
- **Styl:** pełnowymiarowy iframe (Google Maps `output=embed`); na stronach jednosekcyjnych `rounded-2xl overflow-hidden border border-border`, na pełnoszerokościowych bez ramki.
- **Filtr dopasowany do motywu — potwierdzona praktyka (zmiana reguły).** Pierwotna reguła "bez filtrów koloru" została obalona w praktyce u OBU klientów: M.E.N. dostał `filter: invert(92%) hue-rotate(180deg)...` (mapa dociemniona pod ciemny motyw), Lidia `grayscale(55%)` + overlay `mix-blend-mode: color` w kolorze akcentu. Surowa, kolorowa mapa Google gryzie się z resztą strony. Domyślnie: delikatny filtr spinający mapę z motywem (desaturacja + tint akcentu w jasnym motywie, invert w ciemnym), czytelność ulic zachowana.
- **Fallback bez iframe:** link "Wyznacz trasę" (`button-ghost`) obok/pod embedem, otwierany w nowej karcie — działa nawet gdyby embed nie wczytał się u odbiorcy.

## 6. Do's and Don'ts

### Do:
- **Do** trzymaj tło neutralne (prawdziwa biel lub ciemny stonowany neutral), ciepło przenieś do akcentu i typografii.
- **Do** używaj jednego akcentu z ustalonej puli ziemistych odcieni, oszczędnie (≤10% powierzchni) — jeden token, nie kilka zbliżonych hexów.
- **Do** zapewnij numer telefonu klikalny (`tel:`) widoczny w headerze na każdej stronie klienta.
- **Do** projektuj i testuj od najmniejszego ekranu w górę (mobile-first).
- **Do** trzymaj motion responsywny — subtelny hover/fade, żadnej choreografii.
- **Do** buduj głębię przez naprzemienne tło sekcji (`bg` / `surface`), nie przez cienie czy obwódki.

### Don't:
- **Don't** używaj tła w paśmie kremu/piasku/paper (L 0.84-0.97, C<0.06, H 40-100) — to jest wypalony AI-domyślny wybór.
- **Don't** używaj fontu Inter ani podobnych chłodnych geometrycznych sansów korpo.
- **Don't** dodawaj gradientowego hero z abstrakcyjnymi kształtami, logotypów "trusted by", ani dashboardowego UI — to lokalny biznes usługowy, nie SaaS.
- **Don't** stosuj kart w kartach (nested cards), `border-left`/`border-right` jako kolorowej belki, gradient text, ani animacji bounce/elastic.
- **Don't** dodawaj małych uppercase-trackowanych "eyebrow" nad każdą sekcją ani numerowanych markerów sekcji (01/02/03) jako domyślnego rusztowania.
- **Don't** wchodź w ton sprzedażowy/korporacyjny w treści strony klienta.
- **Don't** kopiuj jednorazowe wyjątki klienta (np. Playfair Display, gradient tła) do nowych projektów jako nowy standard bez wyraźnej prośby użytkownika.
