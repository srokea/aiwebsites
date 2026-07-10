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

**STAŁE — nigdy nie zmieniaj per klient:**
- Kolory (tokeny: bg, surface, ink, accent, border)
- Typografia (Fraunces dla nagłówków, Work Sans dla reszty, skale clamp()) — Playfair Display u M.E.N. i Lidii to udokumentowane, jednorazowe wyjątki (patrz DESIGN.md), nie standard
- Spacing, border-radius, motion
- Named Rules (No-Cream Rule, One Accent Rule itd.)

**ZMIENNE per klient — DESIGN.md to tylko punkt startowy, nie szablon:**
- Układ sekcji (kolejność, proporcje, ile kolumn, jak hero wygląda)
- Które komponenty z sekcji 5 użyć — i czy w ogóle
- Struktura nawigacji
- Sposób prezentacji galerii, cennika, opinii

Sekcja 5 (Components) w DESIGN.md opisuje **możliwe wzorce** — nie obowiązkowy układ każdej strony. Dla każdego klienta buduj układ od zera, wychodząc od jego zdjęć i briefa — nie od komponentów z DESIGN.md. Komponenty to narzędzia w skrzynce, nie instrukcja montażu.

## Struktura repo

```
/design/PRODUCT.md          <- z /impeccable init, stałe dla całej agencji
/design/DESIGN.md           <- z /impeccable init, stałe dla całej agencji
/scripts/screenshot.mjs     <- kanoniczny skrypt zrzutów ekranu (mobile+desktop) — używaj jego, nie pisz ad-hoc Puppeteera
/clients/<nazwa-klienta>/
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
6. Zrób zrzuty ekranu: `node scripts/screenshot.mjs clients/<klient>` — robi automatycznie wersję mobilną I desktopową każdej podstrony (z przescrollowaniem, żeby lazy-loading zdążył wczytać zdjęcia). Nie pisz własnych skryptów Puppeteer do zrzutów.
7. Sprawdź każdy punkt:
   - Zgodność kolorów/fontów/odstępów z DESIGN.md — żadnych przypadkowych wartości.
   - `/impeccable audit` — automatyczne wykrywanie typowych błędów AI.
   - `/impeccable critique` — ogólna ocena jakości designu.
   - Checklistę konwersji poniżej.
8. Popraw każdą znalezioną niezgodność w kodzie.
9. Zrzut ekranu ponownie, porównaj od nowa. Minimum 2 pełne rundy zanim strona jest gotowa.
10. Stop dopiero, gdy nie ma już niezgodności albo użytkownik powie, że wystarczy.
11. Gdy strona jest gotowa (nie w trakcie, tylko RAZ na koniec) — uruchom subagenta `reviewer`, żeby ocenił gotowy kod świeżym okiem, bez znajomości procesu budowy. Popraw jego uwagi, jeśli są zasadne, zanim pokażesz stronę klientowi.

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
4. **Funkcje spoza briefu.** Lightbox na stronie głównej Lidii został zbudowany i potem usunięty na prośbę użytkownika — to koszt podwójnej pracy. Zanim dodasz interaktywny bajer (lightbox, karuzela, animacja), sprawdź brief; jak go tam nie ma, nie dodawaj (twarda zasada z CLAUDE.md).

Dodatkowo w Website+: link/widget Booksy musi być widoczny, nie ukryty.
Dodatkowo w Pro+: formularz rezerwacji/zapytania widoczny i prosty w użyciu.

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
