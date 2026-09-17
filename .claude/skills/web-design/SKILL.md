---
name: web-design
description: Użyj tego skilla, gdy tworzysz, przerabiasz lub oceniasz stronę internetową klienta agencji (lokalny biznes usługowy). Zawiera system projektowy Impeccable, wybór wariantu strony (Basic / Website+ / Pro+), pętlę budowa-sprawdzenie-poprawa oraz listę obowiązkowych elementów. Uruchamiaj przy prośbach typu "zrób stronę dla klienta X", "popraw stronę", "zaprojektuj landing page", oraz gdy w rozmowie pojawia się Booksy, rezerwacja online, brief klienta, DESIGN.md lub PRODUCT.md.
---

# Projektowanie stron dla klientów agencji

## Fundament: Impeccable

Ten projekt korzysta z open-source'owego systemu projektowego **Impeccable** (github.com/pbakaus/impeccable), który rozszerza wbudowany skill Anthropic `frontend-design` o konkretne reguły przeciwko "typowemu AI wyglądowi" (font Inter wszędzie, fioletowo-niebieskie gradienty, karty w kartach, szary tekst na kolorowym tle, animacje "bounce" itd.) oraz komendy `/impeccable audit`, `/impeccable critique`, `/impeccable polish`.

**Jednorazowy setup (raz dla całej agencji, nie per klient):**

1. `npx impeccable install` w katalogu głównym repo (albo w Claude Code: `/plugin marketplace add pbakaus/impeccable` → `/plugin` → zainstaluj).
2. Uruchom `/impeccable init`. Podczas wywiadu wybierz register **"Brand"** (strony klientów to landing page'e, nie aplikacje). Zapisze `PRODUCT.md` i `DESIGN.md` w `/design`.
3. `PRODUCT.md` i `DESIGN.md` to STAŁY fundament dla WSZYSTKICH klientów. Nie zmieniaj ich per projekt.

> To szybko rozwijające się narzędzie — jeśli komendy nie zgadzają się z tym, co widzisz po instalacji, wpisz `/impeccable` (pokaże aktualną listę) albo sprawdź impeccable.style.

### Jeden system, mała zmienna

`DESIGN.md` dzieli się na DWA rodzaje informacji — traktuj je zupełnie inaczej:

**STAŁE — obowiązują u każdego klienta, niezależnie od palety:**
- Named Rules (No-Cream, One Accent, No-Eyebrow, Flat-By-Default, max dwa kroje pisma)
- Skale spacingu, border-radius, zasady motion
- Kontrast WCAG AA i 44 px na elementach dotykowych

**ZMIENNE per klient — DESIGN.md to punkt startowy, nie szablon:**
- Paleta i typografia pochodzą z `brief.md`, logo i zdjęć klienta. Tokeny w `DESIGN.md` to
  wartość domyślna na wypadek, gdy brief milczy — nie sztywny standard. Odstępstwo uzasadnione
  briefem **nie jest błędem i nie wymaga dopisywania wyjątku**. Patrz „Hierarchia źródeł"
  na górze `DESIGN.md`.
- Układ sekcji (kolejność, proporcje, ile kolumn, jak hero wygląda)
- Które komponenty z sekcji 5 użyć — i czy w ogóle
- Struktura nawigacji
- Sposób prezentacji galerii, cennika, opinii

Sekcja 5 (Components) w DESIGN.md opisuje **możliwe wzorce** — nie obowiązkowy układ każdej strony. Dla każdego klienta buduj układ od zera, wychodząc od jego zdjęć i briefa — nie od komponentów z DESIGN.md. Komponenty to narzędzia w skrzynce, nie instrukcja montażu.

## Struktura repo

```
/design/PRODUCT.md          <- z /impeccable init, stałe dla całej agencji
/design/DESIGN.md           <- tokeny + Named Rules (patrz "Hierarchia źródeł" w tym pliku)
/design/STYLES.md           <- lookbook stylów 00-15
/design/SNIPPETS.md         <- KANONICZNE KOMPONENTY do wklejenia (lightbox, scroll-spy, header, "dziś"…)
/scripts/screenshot.mjs     <- kanoniczny skrypt zrzutów ekranu (mobile+desktop) — używaj jego, nie pisz ad-hoc Puppeteera
/clients/<nisza>/<active|churned>/<nazwa-klienta>/
  brief.md                  <- dane klienta (patrz niżej)
  inspo/                    <- screeny CUDZYCH stron internetowych, tylko styl/kierunek do zainspirowania się
  anty-inspo/               <- screeny tego, czego UNIKAĆ — złe przykłady, w tym własne poprzednie próby
  photos/                   <- PRAWDZIWE zdjęcia TEGO klienta (lokal, fryzury, praca) — do wstawienia na stronę
  index.html
  privacy.html              <- polityka prywatności (obowiązkowa, patrz sekcja RODO)
  galeria.html, o-nas.html  <- ewentualne podstrony, gdy treści za dużo na jedną stronę (wzorzec z Lidii)
```

## Krok 1: wybierz wariant strony

Sprawdź w `brief.md` klienta odpowiedzi na dwa pytania: **czy klient używa Booksy?** i **czy chce rezerwacji wprost na stronie?** Jeśli tych informacji brakuje w briefie — zapytaj o nie, zanim zaczniesz projektować.

**Wariant 1 — Basic** (klient NIE ma Booksy, nie chce rezerwacji online teraz)
- Zawiera: dane kontaktowe, cennik, opinie, zdjęcia.
- Brak przycisku rezerwacji. CTA to "Zadzwoń" / "Napisz".

**Wariant 2 — Website+** (klient MA i używa Booksy)
- Booksy wpięte czytelnie na stronie (widget albo wyraźny przycisk/link) — nie ukryte na dole.
- Strona pełni funkcję centrum zaufania i informacji. Booksy zostaje narzędziem rezerwacji, strona go nie zastępuje.

**Wariant 3 — Pro+** (rzadki wariant — klient NIE ma Booksy, ale chce rezerwację wprost na stronie)
- Na razie: prosty, estetyczny formularz kontaktowy / zapytanie o termin.
- Zostaw komentarz `<!-- TODO: tu wejdzie własny system rezerwacji agencji -->` w miejscu na przyszły booking. Nie zakładaj na sztywno Booksy.

## Krok 2: pętla budowa → sprawdzenie → poprawa

Ta pętla dotyczy nie tylko pierwszej budowy strony, ale KAŻDEJ zmiany w istniejącym `index.html` klienta — różni się tylko zakresem (patrz "Skala reakcji" poniżej).

### Skala reakcji na zmianę

- **Drobna poprawka** (zmiana fontu, koloru, pojedynczego tekstu, drobny layout jednej sekcji): zrób zmianę, zrób nowy zrzut ekranu żeby wizualnie potwierdzić że działa poprawnie, i na tym koniec. Nie odpalaj pełnego audytu ani reviewera dla tak małej zmiany.
- **Większa zmiana** (nowa sekcja, zmiana wariantu strony, przebudowa struktury/układu, redesign): przejdź przez pełną pętlę poniżej, łącznie z `/impeccable audit`/`critique` i subagentem `reviewer` na końcu.
- W razie wątpliwości którą kategorię wybrać — zapytaj użytkownika, zamiast zgadywać.

1. Przejrzyj folder `photos/` i `brief.md` klienta — zanim otworzysz DESIGN.md. Na podstawie zdjęć i briefa zdecyduj: jaki układ strony pasuje do TEGO klienta? Czy hero ma być pełnoekranowe ze zdjęciem? Czy dwukolumnowe? Czy cennik ma być tabelą czy kartami? Zapisz sobie te decyzje layoutu ZANIM sięgniesz po tokeny z DESIGN.md.
2. Wczytaj `/design/DESIGN.md` + `/design/PRODUCT.md` — ale tylko po tokeny (kolory, fonty, spacing). Nie kopiuj układu komponentów z sekcji 5 jako gotowej struktury strony.
3. Sprawdź folder `photos/` klienta. Jeśli są tam zdjęcia — to PRAWDZIWA treść, wstaw je bezpośrednio na stronę (galeria, tło hero itd.), nie traktuj ich jako inspiracji. Jeśli folder jest pusty — użyj placeholderów z placehold.co.
3. Sprawdź folder `inspo/`. Jeśli są tam screeny — to LUŹNA inspiracja stylu z cudzych stron, NIE wzór do skopiowania 1:1 i NIE treść do wstawienia. Nie przejmuj układu, treści ani unikalnych elementów tych stron, tylko ogólny nastrój, przefiltrowany przez DESIGN.md.
4. Sprawdź folder `anty-inspo/`. Jeśli są tam screeny — to przykłady tego, czego NIE robić dla tego klienta (może być np. poprzednia, odrzucona wersja tej samej strony). Świadomie odróżnij finalny projekt od tych przykładów — jeśli nie jesteś pewien czy jakiś element jest zbyt podobny do anty-inspo, zmień go.
5. Wygeneruj `index.html` (Tailwind CSS przez CDN, jeden plik) zgodnie z tokenami z DESIGN.md i wariantem z Kroku 1.
6. Zrób zrzuty ekranu: `node scripts/screenshot.mjs clients/<nisza>/<active|churned>/<klient>` — robi automatycznie wersję mobilną I desktopową każdej podstrony (z przescrollowaniem, żeby lazy-loading zdążył wczytać zdjęcia). Nie pisz własnych skryptów Puppeteer do zrzutów.
7. Sprawdź każdy punkt:
   - Zgodność kolorów/fontów/odstępów z DESIGN.md — żadnych przypadkowych wartości.
   - `/impeccable audit` — automatyczne wykrywanie typowych błędów AI.
   - `/impeccable critique` — ogólna ocena jakości designu.
   - Checklistę konwersji poniżej.
8. Popraw każdą znalezioną niezgodność w kodzie.
9. Zrzut ekranu ponownie, porównaj od nowa. Minimum 2 pełne rundy zanim strona jest gotowa.
10. Stop dopiero, gdy nie ma już niezgodności albo użytkownik powie, że wystarczy.
11. Gdy strona jest gotowa (nie w trakcie, tylko RAZ na koniec) — uruchom subagenta `reviewer`, żeby ocenił gotowy kod świeżym okiem, bez znajomości procesu budowy. Popraw jego uwagi, jeśli są zasadne, zanim pokażesz stronę klientowi.

## Standard wyposażenia strony (domyślnie, BEZ pytania)

To są elementy, o które użytkownik prosił przy większości klientów z osobna, bo nie było ich
w pierwszej wersji. Od teraz wchodzą **domyślnie na każdą stronę** — nie czekaj, aż ktoś poprosi,
i nie pytaj, czy dodać. Gotowy kod: **`/design/SNIPPETS.md`**.

1. **Galeria = lightbox.** Każda galeria (także złożona z samych placeholderów) jest klikalna:
   klik otwiera podgląd, strzałki `←`/`→` i dwa przyciski w stałym miejscu przewijają, `Esc`
   i klik poza zdjęciem zamykają, lista jest zapętlona, pod zdjęciem tylko licznik (żadnych
   podpisów). Lightbox otwiera oryginał, nie przyciętą miniaturę. Galeria może zawierać więcej
   zdjęć niż widocznych kafelków.
2. **Scroll-spy w headerze.** Sekcja, w której aktualnie jest użytkownik, podświetla się w nawigacji.
3. **Social media w headerze, obok telefonu** (nie obok sekcji) — z prawdziwymi linkami, w kolorach
   strony, nie w oryginalnych barwach marek.
4. **Header w jednej linii i bez ścisku na mobile.** Logo + sekcje + social + CTA w jednym rzędzie.
   Na telefonie numer znika, zostaje sama ikonka słuchawki. Żaden przycisk CTA nie może łamać się
   na dwie linijki — to najczęściej zgłaszany błąd mobilny.
5. **Godziny otwarcia z oznaczeniem „dziś"** — podpis + wyraźne podświetlenie wiersza (samo
   pogrubienie to za mało).
6. **Mapa przez całą szerokość strony**, na dole sekcji kontaktu, tuż nad stopką.
7. **CTA „Zostaw opinię"** z ikoną Google, jeśli klient ma opinie w Google. Link do wystawienia
   opinii zawsze podaje użytkownik — nie zgaduj `place_id`.
8. **Ikona po lewej stronie tekstu** w każdym CTA, które ma ikonę („Wyznacz trasę", social, telefon).

Odstępstwo od tej listy jest możliwe, ale musi wynikać z briefu i trzeba je nazwać w odpowiedzi
(np. „bez galerii — klient nie ma i nie będzie miał zdjęć").

## Checklist konwersji (obowiązkowa)

Zawsze, niezależnie od wariantu:
- Numer telefonu widoczny w headerze, klikalny na telefonie (`tel:`).
- Jasne CTA ("Umów wizytę" / "Zadzwoń"), nie ogólnikowe "Dowiedz się więcej".
- Godziny otwarcia i adres/mapa.
- Ikony social media, jeśli klient je ma — z PRAWDZIWYMI linkami. Nigdy nie zostawiaj `href="#"` z komentarzem TODO na stronie pokazywanej klientowi: znajdź profil sam (Google: "<nazwa> <miasto> facebook/instagram") albo zapytaj, zanim uznasz stronę za gotową.
- Liczba opinii / gwiazdki, jeśli dane dostępne.
- Zero żargonu technicznego (bez wzmianek o hostingu, stacku itd.).

## Powtarzalne błędy z praktyki (sprawdź ZAWSZE przed oddaniem)

Rzeczy, które użytkownik musiał poprawiać u więcej niż jednego klienta — sprawdzaj je z automatu:

1. **Kadry zdjęć.** Po wstawieniu prawdziwych zdjęć obejrzyj je na zrzutach mobile I desktop — twarz/fryzura nie może być ucięta przez `object-fit: cover`. Dobierz `object-position` świadomie (u M.E.N. hero wymagał `center 20%`, u Lidii kafel galerii dwóch rund poprawek). Zdjęcia pionowe w poziomych kadrach to główny winowajca.
2. **Lightbox = pełne zdjęcie.** Jeśli miniatura w galerii jest przycięta (`-cropped.jpg`), lightbox musi otwierać ORYGINAŁ (`data-full`), nie tę samą przyciętą miniaturę.
3. **Myślniki (—).** Impeccable wielokrotnie flagował "em-dash-overuse" u każdego klienta. W tekstach na stronę klienta pisz krótkie zdania z kropkami; maksymalnie 2-3 myślniki na całą stronę.
4. **Funkcje spoza briefu.** Elementy ze „Standardu wyposażenia strony" (lightbox, scroll-spy,
   social w headerze, „dziś", mapa full-width) są DOMYŚLNE i nie wymagają wzmianki w briefie —
   dodawaj je zawsze. Zakaz dotyczy nietypowych bajerów spoza tej listy: karuzel 3D, parallaksy,
   animacji scenowych, sliderów zespołu, efektów przewijania. Tych nie dodawaj bez briefu albo
   wyraźnej prośby.
5. **Kadry na szerokich ekranach.** Zdjęcia hero sprawdzaj także przy **2560×1440 i szerzej**, nie
   tylko na 1512 px (MacBook). Hero ucięte po bokach na dużym monitorze wracało cztery razy pod rząd
   u jednego klienta. Naprawiaj proporcje uniwersalnie, nie pod jedną konkretną rozdzielczość.
6. **Ikony marek.** Nie rysuj z pamięci ikon Facebooka, Instagrama, Google ani Booksy — kształty
   wychodzą krzywe i były odrzucane. Bierz gotowe ścieżki z `/design/SNIPPETS.md` albo plik od
   klienta. Kolor dopasuj do palety strony **od razu**, bez czekania na przypomnienie.
7. **Logo klienta ze zdjęcia telefonem.** Jeśli w `photos/` jest fotografia szyldu/wizytówki, a nie
   plik graficzny — odtwórz logo płasko (SVG/czysty wektor), nie wklejaj zdjęcia. Sprawdź detale:
   kropki nad literami, rozstaw znaków, kształt ornamentu.

Dodatkowo w Website+: link/widget Booksy musi być widoczny, nie ukryty.
Dodatkowo w Pro+: formularz rezerwacji/zapytania widoczny i prosty w użyciu.

## Zasady treści (copy)

**Strona najpierw trafia do wglądu właścicielce, dopiero potem do jej klientów.** To zmienia sposób
pisania wszystkich tekstów roboczych i placeholderów:

- Placeholdery i notatki na stronie mówią **do właścicielki**, nie o niej. Nie „Tu wstawimy kilka
  zdań o Magdzie", tylko „Tu wstawimy kilka zdań o Pani".
- **Zawsze per Pani/Pan.** Nigdy na Ty, chyba że użytkownik wyraźnie powie inaczej.
- Opis „o mnie" / „o nas" pisz **w pierwszej osobie**, jakby pisała go sama właścicielka
  („Prowadzę salon od 2015 roku…"), nie w trzeciej („Magda prowadzi salon…").
- **Jednoosobowa firma = liczba pojedyncza.** Sprawdź w briefie, ile osób pracuje. Jeśli jedna:
  „Jak mnie znaleźć", nie „Jak nas znaleźć"; „Pracuję", nie „Pracujemy".
- **Zero przepraszających wypełniaczy.** Nie pisz „Pełny cennik pojawi się wkrótce", „Zdjęcia
  zespołu wstawimy tutaj, gdy będą gotowe", „Do uzupełnienia". Brak danych → dashed placeholder
  bez tekstu tłumaczącego, a brakujące informacje wypisz użytkownikowi w odpowiedzi, nie na stronie.
- **Nie tłumacz na stronie, po co jest sekcja.** Zdania typu „Szukasz wizyty, a nie szkolenia?
  Wróć do oferty salonu" albo „To osobna działalność edukacyjna" były usuwane za każdym razem.
  Nawigacja ma to załatwiać sama.
- Nie zmyślaj treści opinii, cen ani godzin. Statystyki (ocena, liczba opinii) możesz pokazać,
  jeśli są prawdziwe — treść cytatu tylko od użytkownika.
- Maksymalnie 2–3 myślniki (—) na całą stronę; krótkie zdania z kropkami.

## Dyscyplina edycji

Przy poprawkach użytkownik opisuje JEDEN element. Najczęstsze źródło dodatkowych rund to zmiany
„przy okazji".

- **Ruszasz wyłącznie to, o co proszono.** Prośba „przesuń miskę w górę" nie jest zgodą na
  poprawienie odstępów sekcji, w której miska leży. Prośba „przesuń sekcje w headerze w lewo"
  nie obejmuje ikon social media stojących obok.
- Przy mikro-korektach pozycji zmieniaj tylko `transform`/`margin` tego jednego elementu.
  Nie przebudowuj siatki ani nie zmieniaj paddingu sekcji.
- Jeśli poprawka wymaga jednak ruszenia czegoś obok — **powiedz to w odpowiedzi**, zamiast zrobić
  po cichu.
- **Warianty pokazuj jako zrzuty ekranu, nie jako nazwy.** Prośba „daj 3 propozycje fontu" oznacza
  3 obrazy do obejrzenia. Zapisz je do `clients/<...>/<klient>/warianty/` i podaj ścieżki.
  Sama lista nazw fontów w tekście jest bezużyteczna — było zgłaszane dwa razy.
- **Podmiana fontu „w opisach" = tylko długie teksty i akapity.** Nie nagłówki, nie nawigacja,
  nie cennik, nie przyciski. Globalna podmiana była cofana dwa razy.

## SEO i wydajność (obowiązkowe)

Sprzedajemy lokalnym firmom widoczność — strona bez tego jest niekompletna.

- `<html lang="pl">`
- `<title>` = nazwa firmy + usługa + miasto (np. „NOVA — makijaż permanentny, Sulejów")
- `<meta name="description">` — jedno zdanie, konkretnie, bez marketingowej waty
- Open Graph: `og:title`, `og:description`, `og:image`, `og:url`.
  **Nazwy plików obrazów bez spacji i nawiasów** — psują podgląd linku w komunikatorach.
- JSON-LD `LocalBusiness` (albo węższy typ: `HairSalon`, `BeautySalon`, `ClothingStore`)
  z nazwą, adresem, telefonem, godzinami otwarcia i linkiem do map
- `favicon` — najlepiej element logo klienta
- Każdy `<img>`: `loading="lazy"`, jawne `width` i `height` (chroni przed CLS), opisowy `alt`
- Zdjęcia skompresowane do realnego rozmiaru wyświetlania. Zdjęcie 3777 px szerokości pod kafelek
  450 px to błąd, nawet jeśli wygląda dobrze.
- Obraz ukryty przez `hidden` / `display:none` **i tak się pobiera** — nie chowaj tak ciężkich
  zdjęć przed mobile; użyj `<picture>` albo w ogóle go tam nie wstawiaj.

## RODO i prywatność (obowiązkowe na każdej stronie)

- Stopka zawiera link "Polityka prywatności" prowadzący do osobnej podstrony/sekcji z podstawową informacją: jakie dane zbiera formularz kontaktowy (jeśli jest), po co, i że dane trafiają do właściciela firmy (nie do agencji).
- **Fonty Google:** nie ładuj ich z `fonts.googleapis.com` w locie — pobierz pliki raz i hostuj lokalnie w projekcie klienta. Ładowanie na żywo z serwerów Google wysyła IP odwiedzającego bez zgody, co jest problematyczne pod RODO.
- **Mapa Google Maps:** jeśli osadzona jako iframe, wspomnij o tym w polityce prywatności (przekazywanie danych do Google). Alternatywa: link "Wyznacz trasę" zamiast pełnego embedu, jeśli klient/agencja chce tego unikać całkowicie.
- To nie jest porada prawna — przy realnym kliencie warto, żeby ktoś (Ty albo klient) zerknął na treść polityki prywatności, zwłaszcza że ten sam szablon trafia do wielu klientów.

## Czego NIE robić

- Nie używaj sekcji 5 (Components) z DESIGN.md jako szablonu układu strony — to wzorce do użycia gdy pasują, nie obowiązkowa struktura każdej strony.
- Nie buduj każdej strony w tej samej kolejności sekcji — kolejność i układ wynikają ze zdjęć i briefa klienta, nie z poprzednich projektów.
- Nie ignoruj `anty-inspo/`, jeśli jest obecny — traktuj go jako konkretny, wizualny przykład błędu do uniknięcia, nie tylko jako ciekawostkę.
- Nie traktuj zdjęć z `photos/` jako inspiracji do "przemalowania" — to gotowa treść klienta, wstaw je wprost.
- Nie zmieniaj `DESIGN.md` / `PRODUCT.md` per projekt bez wyraźnej prośby.
- Unikaj estetyki SaaS/startupowej (gradientowe hero z abstrakcyjnymi kształtami, loga "trusted by", dashboardowy UI) — to lokalny biznes, nie aplikacja.
- Unikaj typowych "AI tells": font Inter, fioletowo-niebieskie gradienty, karty w kartach, szary tekst na kolorowym tle, czysty czarny #000, duże zaokrąglone ikonki nad nagłówkami, animacje "bounce".
- Nie przechodź w ton sprzedażowy/korporacyjny w treści strony.
- Nie wstawiaj żadnej treści pochodzącej od użytkownika (np. z formularza) na stronę przez `innerHTML`, `document.write` ani atrybuty typu `onerror`/`onload` z dynamiczną wartością — to otwiera na XSS. Jeśli formularz (wariant Pro+) ma kiedyś wyświetlać zgłoszenia, użyj gotowego zewnętrznego serwisu (np. Formspree, Netlify Forms) zamiast własnego kodu do tego celu.

## Domyślne ustawienia techniczne

- Tailwind CSS przez CDN (`<script src="https://cdn.tailwindcss.com"></script>`)
- Fonty Google pobrane i hostowane lokalnie w projekcie klienta, nie ładowane z `fonts.googleapis.com` (patrz RODO powyżej)
- Jeden plik `index.html`, chyba że projekt wyraźnie wymaga inaczej
- Placeholdery z `https://placehold.co/`, jeśli klient nie dostarczył zdjęć
- Mobile-first
