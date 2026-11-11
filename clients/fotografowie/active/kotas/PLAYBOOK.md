# PLAYBOOK — jak budować frontend na tym szablonie

Ten plik jest dla Ciebie, przyszły Claude. Opisuje **sprawdzone w praktyce
wzorce** wyciągnięte z budowy pierwszego prawdziwego klienta na tym
szablonie (`clients/fotografowie/active/szkatulski`) — łącznie z błędami,
które tam popełniliśmy i jak je naprawiliśmy. `README.md` w tym samym
folderze opisuje deployment i API — **przeczytaj go najpierw**, ten plik
zakłada, że już go znasz i skupia się na samym froncie.

Nie jest to plan wdrożenia konkretnej funkcji (to robi `plan.md` obok —
osobny temat: zarządzanie hasłem panelu). To jest przewodnik "jak myśleć
o froncie", kiedy dostajesz kolejnego fotografa do zrobienia.

---

## 0. Najważniejsze: `public/index.html` to placeholder, nie produkt

Backend (worker, D1, R2, panel admina) jest **identyczny dla każdego
klienta** — nie ruszasz go. Ale `public/index.html` + `public/assets/public.css`
w tym folderze to celowo ubogi, generyczny szkielet ("PLACEHOLDER
PORTFOLIO — zastąp ten plik własnym frontendem klienta", patrz komentarz
na górze pliku). **Każdy nowy klient dostaje bespoke frontend**, zaprojektowany
pod jego branżę/nisze (sport, śluby, portrety...), paletę i styl — tak samo
jak każda inna strona w tym repo (patrz `CLAUDE.md`, skill `web-design`).

Nie kopiuj ślepo layoutu Szkatulskiego (sidebar z kategoriami, filtrowanie,
mozaika) do kolejnego klienta, jeśli jego brief tego nie potrzebuje — to by
było dokładnie to, przed czym ostrzega `CLAUDE.md` ("Nie dodawaj sekcji ani
funkcji, których nie ma w briefie klienta"). Fotograf z jedną kategorią
zdjęć może w ogóle nie potrzebować sidebaru czy filtrów — wystarczy prosta
siatka jak w tym szablonie.

To, co **warto** przenosić między klientami, to konkretne **techniki**
poniżej — rozwiązują realne problemy CSS/JS niezależnie od tego, jak
wygląda dany layout.

---

## 1. Mozaika: CSS Grid + container queries (już jest w szablonie)

`public/assets/public.css` (`.grid`) i panel admina (`public/admin/index.html`)
używają tego samego mechanizmu:

```css
.grid-wrap { container-type: inline-size; }
.grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));   /* 2 kolumny < 700px */
  grid-auto-rows: minmax(calc((100cqw - 5*gap) / 6 * .75), auto);
  grid-auto-flow: dense;
}
.item { grid-column: span var(--w); grid-row: span var(--h); }
```

**Dlaczego container query (`cqw`), nie `vw`:** wysokość wiersza musi się
przeliczać względem szerokości SAMEJ SIATKI, nie całego viewportu — inaczej
sidebar/padding obok siatki psuje proporcje kafelków. To jest KLUCZOWA
sztuczka, użyj jej wszędzie, gdzie budujesz mozaikę o zmiennych rozmiarach
kafelków (nie tylko w portfolio fotografów).

**Dlaczego `grid-auto-flow: dense`:** wypełnia luki po mniejszych kafelkach
zamiast zostawiać dziury — wystarcza dla MAŁEJ liczby zdjęć na album, jak
w tym placeholderze. **Przy większej galerii (kilkadziesiąt+ zdjęć, jak u
Szkatulskiego) samo `dense` NIE wystarczy** — patrz punkt 3, tam jest
gotowy, przetestowany "skyline" packing w JS, który realnie to naprawia
(nie jest to nieuchronne ograniczenie CSS, jak początkowo sądziliśmy).

**Jeśli budujesz frontend, który IGNORUJE `grid_w`/`grid_h`** (np. Pinterest-owa
mozaika z naturalnymi proporcjami zdjęcia zamiast siatki 6-kolumnowej, tak
jak pierwsza wersja Szkatulskiego) — **nie rób tego**. Panel admina daje
klientowi suwaki do zmiany rozmiaru kafelka; jeśli strona te wartości
ignoruje, klient widzi w panelu jedno, a na stronie coś innego, i to wygląda
jak bug (bo nim jest). Zawsze podłącz `grid_w`/`grid_h` do realnego layoutu,
nawet jeśli Twój frontend ma inny system kolumn niż domyślne 6 — przelicz
proporcjonalnie, nie olewaj pola.

**Bloki tekstu (`type: 'text'`) też muszą trafić na stronę**, z tego samego
powodu — panel pozwala je dodać, więc strona musi je pokazać. Wzorzec
renderowania (fonty, `--fs` skalowane przez `cqw`, sanitized HTML) jest
gotowy w `public/index.html` (`buildText`) — kopiuj go, nie wymyślaj od nowa.
Fonty bloków tekstu (Playfair, Lora, Great Vibes...) są hostowane lokalnie
w `public/assets/fonts/admin/` i ładowane przez `admin-fonts.css` — jeśli
Twój bespoke frontend ma inny plik CSS niż `public.css`, i tak dociągnij
ten plik z fontami (przez `<link>`), inaczej bloki tekstu polecą na
fallbackach (`sans-serif`/`serif`/`cursive`) zamiast wybranego fontu.

---

## 2. Akordeon (rozwijane sekcje) — UŻYWAJ `height` mierzonego w JS, NIE `max-height`

Jeśli budujesz jakikolwiek rozwijany element (FAQ, podkategorie w sidebarze,
cokolwiek z efektem "rozwiń/zwiń") — **nie rób tego przez zgadywany
`max-height`**:

```css
/* ŹLE — tak zaczęliśmy u Szkatulskiego i klient od razu to wychwycił: */
.panel { max-height: 0; transition: max-height 280ms ease; }
.panel.is-open { max-height: 480px; }   /* 480 to strzal "na oko" */
```

**Problem:** przeglądarka animuje CAŁĄ zadeklarowaną wartość (0 → 480px),
nie rzeczywistą wysokość treści. Jeśli treść ma np. 120px, animacja
wizualnie kończy się po ok. 1/4 czasu trwania (bo `max-height` tylko
OGRANICZA, nie rozciąga) — reszta czasu animuje coś niewidocznego. Efekt:
wygląda jak nagły skok, nie płynne rozwinięcie. Im większy zapas między
zgadywaną wartością a realną treścią, tym gorzej to wygląda.

**Poprawnie — zmierz `scrollHeight` w JS i animuj `height` do dokładnej
wartości:**

```js
function setOpen(el, open) {
  const current = el.getBoundingClientRect().height;
  el.style.height = current + 'px';
  void el.offsetHeight;               // wymuszony reflow — inaczej brak animacji

  if (open) {
    el.style.height = el.scrollHeight + 'px';   // dokladny cel, nie zgadywanie
  } else {
    el.style.height = '0px';
  }
}
```

Po zakończeniu animacji (`transitionend` na `height`, gdy stan jest
otwarty) ustaw `style.height = 'auto'` z powrotem — inaczej zmiana
szerokości ekranu (np. dłuższy tekst zawija się inaczej) zostanie
uwięziona w nieaktualnej wartości px. Gotowy, przetestowany kod:
`clients/fotografowie/active/szkatulski/public/assets/js/gallery.js`
(`setSubfiltersOpen` + `transitionend` listener obok).

To dotyczy KAŻDEGO rozwijanego elementu w dowolnym froncie w tym repo, nie
tylko portfolio fotografów.

---

## 3. Paginacja / "pokaż więcej" w MOZAICE — renderuj wszystko, przycinaj WYSOKOŚĆ

Pierwsza wersja tego punktu (jeśli widzisz ją w historii gita) mówiła
"dokładaj nowe kafle do DOM zamiast rebuildować" — **to było niewystarczające
i powodowało realnego buga**: gdy w DOM było tylko pierwszych 12 zdjęć
(reszta doklejana dopiero po kliknięciu), `grid-auto-flow: dense` nie miało
z czego wypełniać luk po większych kaflach — zostawały czarne dziury,
które znikały dopiero po "Pokaż więcej" (czyli dokładnie wtedy, gdy reszta
zdjęć wreszcie trafiała do DOM i dense mogło ich użyć do załatania gapów).

**Poprawnie:** renderuj ZAWSZE całą (przefiltrowaną) listę do gridu —
dense potrzebuje pełnego materiału, żeby dobrze upakować siatkę. "Zwinięcie"
widoku to WYŁĄCZNIE przycięcie WYSOKOŚCI kontenera (`overflow: hidden` +
`height`), nie inny zestaw danych w DOM:

```js
// Po wyrenderowaniu WSZYSTKICH kafli:
const gridTop = container.getBoundingClientRect().top;
const collapsedHeight = Math.max(
  ...tiles.slice(0, PAGE_SIZE).map(t => t.getBoundingClientRect().bottom - gridTop),
);
container.style.height = collapsedHeight + 'px';   // reszta jest juz w DOM, tylko przycieta
```

"Pokaż więcej" animuje `height` do `container.scrollHeight` (technika z
punktu 2 — zmierzone, nie zgadywane). Gotowy kod: `gallery.js` →
`renderGrid()` + `setGridExpanded()`.

**Aktualizacja — `dense` finalnie NIE wystarczyło.** Pierwotnie ten punkt
mówił "to problem kombinatoryczny, nie buduj własnego bin-packera, koszt/zysk
się nie zwraca" — to była zła kalkulacja. W praktyce **dłuższy ciąg zdjęć
o TYM SAMYM kształcie z rzędu** (np. kilka pionowych "z telefonu" wgranych
jedno po drugim) zostawiał spory, wyraźnie widoczny pusty prostokąt —
`grid-auto-flow: dense` skanuje wiersz po wierszu i łata TYLKO dokładne
dziury, na które trafi w kolejności DOM; nie szuka aktywnie globalnie
najniższego wolnego miejsca. Klient to zauważył i słusznie nie zaakceptował
tłumaczenia "to ograniczenie CSS".

**Poprawka: własny "skyline" packing zamiast polegania na `dense`.** Śledzimy
wysokość KAŻDEJ kolumny osobno (tablica `heights`) i dla każdego kafla
aktywnie szukamy kolumny startowej, w której zmieści się najwyżej —
dokładnie tak działa prawdziwy masonry (Pinterest/Packery), tylko wyrażony
przez jawne `grid-column`/`grid-row` zamiast `span` + auto-placement:

```js
function packTiles(list, tiles, columns) {
  const heights = new Array(columns).fill(0);
  list.forEach((entry, i) => {
    const w = Math.min(entry.w, columns);
    let bestCol = 0, bestTop = Infinity;
    for (let col = 0; col <= columns - w; col++) {
      let segTop = 0;
      for (let c = col; c < col + w; c++) segTop = Math.max(segTop, heights[c]);
      if (segTop < bestTop) { bestTop = segTop; bestCol = col; }
    }
    for (let c = bestCol; c < bestCol + w; c++) heights[c] = bestTop + entry.h;
    tiles[i].style.gridColumn = (bestCol + 1) + ' / span ' + w;
    tiles[i].style.gridRow = (bestTop + 1) + ' / span ' + entry.h;
  });
}
```

Gotowy, przetestowany kod (z uwzględnieniem osobnej liczby kolumn na
mobile/desktop): `gallery.js` → `packTiles()`, wywoływane w `renderGrid()`
zaraz po zbudowaniu wszystkich kafli, przed pomiarem `collapsedHeight`.

**Ważna konsekwencja:** jawne `grid-column`/`grid-row` ustawione w JS
NIE przeliczają się same przy zmianie breakpointu (w odróżnieniu od
`span var(--w)` + auto-placement, które CSS przelicza samo po media query).
Trzeba nasłuchiwać zmiany breakpointu i przepakować:

```js
const DESKTOP_GRID = window.matchMedia('(min-width: 768px)');
DESKTOP_GRID.addEventListener('change', () => renderGrid());
```

Bez tego zmiana szerokości okna w poprzek granicy 6-kolumnowego/2-kolumnowego
layoutu zostawia kafle z pozycjami policzonymi dla NIEAKTUALNEJ liczby kolumn.

**Skyline sam z siebie WCIĄŻ nie gwarantuje równej prawej krawędzi**, jeśli
szerokości w wierszu nie sumują się dokładnie do liczby kolumn (np. 3+2=5
z 6) — zostaje samotna, JEDNOKOLUMNOWA reszta, której praktycznie nic nie
wypełni (zdjęcia mają zwykle szerokość 2+). Klient to złapał na żywym
przykładzie (zdjęcie auta + stos wydrukowanych zdjęć, 3+2 z 6 kolumn).
Dopisz domykanie takiej reszty od razu przy skyline, nie osobnym przebiegiem:

```js
// Po znalezieniu bestCol/bestTop, przed zapisaniem do heights:
let finalW = w;
if (
  bestCol + finalW < columns
  && heights[bestCol + finalW] <= bestTop
  && (bestCol + finalW + 1 >= columns || heights[bestCol + finalW + 1] > bestTop)
) {
  finalW += 1; // samotna reszta tuz obok — domykamy, zamiast zostawiac dziure
}
```

Warunek świadomie NIE domyka reszt szerszych niż 1 kolumna — te wciąż ma
szansę wypełnić kolejne zdjęcie o normalnej szerokości (2+), więc zgarnianie
ich na zapas tylko psułoby packing gdzie indziej. Zamyka wyłącznie
przypadek "already unfillable" — dokładnie ten, który faktycznie się
zdarza w praktyce.

---

## 4. Wejście kafelków (fade + stagger) — teraz jest domyślnie w szablonie

Dodaliśmy do `public/assets/public.css` (`.item` / `.item.is-in`) i
`public/index.html` (`buildAlbum`) prosty fade-in ze stopniowym opóźnieniem
przy pierwszym renderze albumu — wcześniej kafelki po prostu "wskakiwały"
bez żadnej animacji, co przy przełączaniu zakładek wyglądało toporne.
Respektuje `prefers-reduced-motion` (JS pomija stagger, CSS ma już globalny
override `transition-duration: .01ms` na dole `public.css`).

Jeśli Twój bespoke frontend ma własny plik CSS/JS (a będzie miał, patrz
punkt 0), **przenieś ten wzorzec tam** zamiast zaczynać bez animacji od zera.

---

## 5. Layout: `.wrap` się centruje — czasem NIE tego chcesz

Domyślny `.wrap` (`max-width` + `margin: 0 auto`) centruje treść z równymi
marginesami po obu stronach. To dobre dla tekstowych sekcji, ale dla
GALERII/MOZAIKI ZE ZDJĘCIAMI często chcesz, żeby sekcja stała bliżej lewej
krawędzi i wykorzystała maksimum szerokości — zwłaszcza z sidebarem kategorii
z boku, gdzie centrowanie generuje dwa duże, puste marginesy zamiast oddać tę
przestrzeń zdjęciom. U Szkatulskiego rozwiązanie to nadpisanie `.wrap`
scope'owane do sekcji portfolio:

```css
@media (min-width: 900px) {
  #portfolio .wrap { max-width: none; margin-left: 0; margin-right: 0; }
}
```

Nie zmieniaj globalnego `.wrap` — to by przesunęło WSZYSTKIE sekcje na
stronie (hero, cennik, kontakt...), nie tylko galerię.

---

## 6. Czego świadomo NIE przenosiliśmy do szablonu (YAGNI)

**Rolki wideo (`type: 'video'`, upload plakatu, itd.)** — Szkatulski ma to
dodane w swoim własnym `worker/` (patrz jego `README.md`, sekcja "Czym
różni się od portfolio-template"), bo akurat potrzebował. Nie scalaliśmy
tego z powrotem do wspólnego szablonu — to większa zmiana (schemat D1,
worker, panel), a dopóki żaden konkretny klient tego nie potrzebuje, dodanie
tego "na zapas" to niepotrzebne ryzyko i koszt utrzymania. **Jeśli kolejny
klient potrzebuje rolek — skopiuj rozwiązanie z instancji Szkatulskiego**
(`worker/items.js` → `uploadVideo`, `schema.sql` → kolumna `poster_key`),
nie wymyślaj od nowa.

**Aktualizacja — hero-slideshow i "Zaufali mi" TRAFIŁY do szablonu**, w
odróżnieniu od rolek powyżej. Różnica: to nie zmiana w `items.js`/portfolio
(ryzykowna, bo dotyka rdzenia galerii), tylko OSOBNE tabele/moduły
(`worker/settings.js`, `hero.js`, `trusted.js`, patrz README "API — pełna
lista endpointów") — nawet jeśli klient z nich nie korzysta, nic w
portfolio się nie zmienia, zero ryzyka regresji. Backend + panel admina są
gotowe u KAŻDEGO klienta od razu. Czego nadal NIE ma w szablonie: samo
renderowanie na stronie publicznej (slideshow w hero, sekcja "Zaufali mi")
— to zostaje bespoke per klient, tak jak reszta frontendu (punkt 0). Gotowy,
przetestowany wzorzec do skopiowania: `active/szkatulski/public/assets/js/site.js`
(`startHeroSlideshow`, sekcja "zaufali mi") + `public/index.html` (`.hero__slides`,
`#trusted`).

**Panel admina (ustawienia strony) też przeszedł redesign w szablonie** —
segmentowany przełącznik "Statyczne zdjęcie / Slajdy z albumu" zamiast
gołych radio-buttonów, pusty stan z wyjaśnieniem w "Zaufali mi" zamiast
samotnego przycisku, spójny placeholder awatara. To CSS/HTML w
`public/admin/index.html` na tych samych zmiennych motywu co reszta panelu
(`var(--panel)`, `var(--line)`, `var(--accent)`) — więc kolejny klient z
innym motywem panelu (jasny zamiast ciemnego, inny akcent) dostaje ten
wygląd "za darmo" przez podmianę zmiennych w `:root`, bez ruszania
struktury. **To rozróżnienie działa też w drugą stronę dla frontendu
publicznego**: sama galeria/hero/"zaufali mi" na stronie klienta może
wyglądać kompletnie inaczej niż u Szkatulskiego (ciemny, "modern") — np.
biały, czysty, "fancy" motyw u kolejnego klienta — ale mechanika pod spodem
(te same endpointy, ten sam kształt danych, ten sam panel admina) zostaje
identyczna. Zmiana motywu to zawsze praca w `public/index.html` +
`public/assets/public.css` (i ewentualnie `public/assets/js/site.js` przy
renderowaniu), nigdy w `worker/`.

**Sidebar z kategoriami + akordeon + filtrowanie "Wszystko"** — to bespoke
UX Szkatulskiego (fotograf sportowy/eventowy z 5 stałymi kategoriami).
Fotograf ślubny z 3 albumami rocznie prawdopodobnie tego nie potrzebuje —
zwykłe zakładki (jak w tym szablonie) wystarczą. Buduj sidebar tylko gdy
liczba kategorii/albumów faktycznie tego wymaga.

---

## 7. Podnoszenie tła nawigacji przy scrollu — obserwuj sekcję, nie licz vh

Wzorzec "nav jest przezroczysty na hero, robi się kryjący po zescrollowaniu"
łatwo zepsuć stałym progiem typu `scrollY > window.innerHeight * 0.8`.
To działa TYLKO na stronie z pełnoekranowym hero (próg dobrany pod JEGO
wysokość) — na krótszych podstronach (np. "Portfolio" z krótkim tytułem,
bez dużego zdjęcia) próg 80vh jest nieosiągalny w normalnym scrollu, więc
nav zostaje przezroczysty mimo że już leży na treści (galeria, formularz...).

**Poprawnie:** `IntersectionObserver` na konkretnym elemencie "nagłówka"
danej strony (nie na całej sekcji — jeśli Twoja `<section>` zawiera też
resztę treści pod tytułem, obserwujesz w praniu prawie całą wysokość
strony i observer prawie nigdy nie zgłosi "wyszło z widoku"):

```js
const heroSentinel = document.querySelector('.hero') || document.querySelector('.section-head');
const observer = new IntersectionObserver(
  ([entry]) => nav.classList.toggle('is-lifted', !entry.isIntersecting),
  { rootMargin: `-${nav.offsetHeight}px 0px 0px 0px` }, // "nie przecina" = schowany za navem
);
observer.observe(heroSentinel);
```

Ujemny `rootMargin` o wysokość samego navu sprawia, że próg to dokładnie
moment, w którym nav zaczałby leżeć na kolejnej treści — bez zgadywania,
działa identycznie na krótkim i długim nagłówku. Kod: `site.js`.

---

## 8. Poziome listy pigułek (mobile) ≠ pionowe listy (desktop) — różne animacje

Jeśli ten sam komponent (np. filtr kategorii) renderuje się jako **pionowa
lista w sidebarze na desktopie** i **pozioma, przewijana lista pigułek na
telefonie** (`overflow-x: auto`), NIE używaj tej samej animacji
rozwijania dla obu:

- **Pionowa lista (desktop):** `height` 0→`scrollHeight` (punkt 2) ma sens —
  rozwinięcie faktycznie odpycha treść pod spodem.
- **Pozioma lista pigułek (mobile):** animowanie `height` nie ma sensu
  (to jeden poziomy rządek, nie stos) i **`overflow: hidden` na tym
  elemencie zabija `overflow-x: auto` odziedziczone z rodzica** —
  przewijanie pigułek się psuje w trakcie/po animacji. Tam wystarczy
  zwykły fade opacity.

Drugi, mniej oczywisty bug z tej samej rodziny: jeśli JS **przenosi**
element podfiltrów w DOM (np. `activeButton.after(subfiltersEl)`, żeby
wstawić go pod aktywną pozycją w pionowej liście), ta sama linijka na
mobile wstawi go JAKO KOLEJNĄ POZYCJĘ tego samego poziomego scrollera
pigułek — trzeba przewinąć cały rządek w bok, żeby go zobaczyć. Rozwiązanie:
warunkuj przenoszenie od aktualnego layoutu (`matchMedia('(min-width: 900px)')`)
i na mobile zostaw element na jego STATYCZNEJ pozycji z HTML (osobny rząd
pod całą listą kategorii). Kod: `gallery.js` → `renderSubfilters`,
`isSidebarLayout()`.

---

## 9. Checklist przy nowym kliencie-fotografie

1. Przeczytaj brief — ile kategorii/albumów, czy klient wspomina rolki,
   teksty w galerii, konkretny styl wizualny.
2. Skopiuj `portfolio-template/` (kroki 1-10 w `README.md`) — backend
   zostaje bez zmian.
3. Zaprojektuj `public/index.html` + własny CSS pod brief klienta, używając
   skilla `web-design` (paleta z briefu/logo klienta, nie domyślna z
   `DESIGN.md`, chyba że brief milczy).
4. Podłącz REALNE `grid_w`/`grid_h` i bloki tekstu do swojego layoutu
   (punkt 1) — nawet jeśli Twój układ nie jest 6-kolumnową siatką.
5. Jeśli dodajesz cokolwiek rozwijanego — technika z punktu 2 (i uwaga
   z punktu 8, jeśli komponent inaczej wygląda na mobile i desktopie).
6. Jeśli masz paginację/"pokaż więcej" w mozaice — renderuj całość i
   przycinaj wysokość, nie liczbę kafli w DOM (punkt 3).
7. Jeśli strona ma osobny (krótszy) nagłówek zamiast pełnoekranowego hero
   — sprawdź podnoszenie tła navu przy scrollu (punkt 7), łatwo to
   przeoczyć bo na desktopie z długą stroną wygląda OK, a problem widać
   dopiero na krótszych podstronach.
8. Przetestuj mobile + desktop (`node scripts/screenshot.mjs` albo MCP
   `chrome-devtools`), z prawdziwymi (albo realistycznymi testowymi) danymi
   z API — puste `LOCAL_PHOTOS` nie pokaże Ci, jak wygląda mozaika.
