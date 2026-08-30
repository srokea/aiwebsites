# SNIPPETS.md — kanoniczne komponenty stron klienckich

Gotowy kod do wklejenia do `index.html` klienta. To są elementy, o które użytkownik prosił przy
większości klientów z osobna — mają wchodzić na stronę **domyślnie, bez pytania** (patrz „Standard
wyposażenia strony" w `.claude/skills/web-design/SKILL.md`).

**Jak używać:**
- Kopiuj kod do `index.html` klienta. Nie linkuj tego pliku, nie twórz wspólnych plików JS/CSS —
  każdy klient zostaje samodzielnym, jednoplikowym projektem.
- Podmień kolory na paletę TEGO klienta. W kodzie poniżej wszystkie miejsca do podmiany są
  oznaczone komentarzem `/* TOKEN */` albo klasą Tailwind z tokenu (`bg-ink`, `text-shell`, `bg-accent`).
- Zachowaj `id`, `data-*` i nazwy klas — skrypty na nich polegają.
- Zachowaj `min-h-[44px] min-w-[44px]` na wszystkim klikalnym (wymóg dotykowy z PRODUCT.md).

**Referencja produkcyjna:** `clients/kosmetyczki/active/NOVA-Magdalena-Kowalska-2/index.html`
zawiera wszystkie te komponenty razem, w działającej formie. W razie wątpliwości sprawdź tam.

---

## 1. Lightbox galerii

Najczęściej powtarzana prośba (11 z ~20 sesji). Pełne, wymagane zachowanie:

- klik w kafelek otwiera podgląd
- strzałki `←` / `→` na klawiaturze przewijają, `Esc` zamyka
- **dwie strzałki nawigacyjne w stałym miejscu** — nie skaczą zależnie od proporcji zdjęcia
- **klik gdziekolwiek poza zdjęciem zamyka** (nie tylko X)
- **zapętlenie**: za ostatnim zdjęciem stoi pierwsze
- **bez podpisów/opisów między zdjęciem a strzałkami** — pod zdjęciem tylko licznik `3 / 10`
- lightbox otwiera **oryginał** (`src` z tablicy), nie przyciętą miniaturę z kafelka
- tło: przyciemnienie + `backdrop-blur`, nigdy pełne, nieprzezroczyste zaćmienie w kolorze marki
- galeria może mieć **więcej zdjęć niż kafelków** — kafelków zostaje np. 6, ale przewijać można do 10
- obsługuje jednocześnie prawdziwe zdjęcia i dashed-placeholdery (gdy klient nie dosłał jeszcze zdjęć)

### Kafelek galerii

```html
<button type="button" class="gallery-tile group relative aspect-square overflow-hidden rounded-2xl"
        data-group="efekty" data-index="0" aria-label="Powiększ zdjęcie 1">
  <img src="photos/galeria/01.jpg" alt="Opisowy alt — co widać na zdjęciu"
       loading="lazy" width="800" height="800"
       class="h-full w-full object-cover transition duration-300 group-hover:scale-105">
  <span class="gallery-hint" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
      <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>
    </svg>
  </span>
</button>
```

Wariant bez zdjęcia (klient nie dosłał) — dashed placeholder, **bez tekstu tłumaczącego**:

```html
<button type="button" class="gallery-tile group relative aspect-square rounded-2xl border border-dashed border-border"
        data-group="efekty" data-index="0" aria-label="Miejsce na zdjęcie 1">
  <span class="gallery-hint" aria-hidden="true"><!-- ta sama ikona lupy --></span>
</button>
```

### CSS

```css
.gallery-tile { cursor: zoom-in; -webkit-tap-highlight-color: transparent; }
.gallery-hint {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  border-radius: inherit;
  background: rgba(26,22,20,.12);  /* TOKEN: ink z niskim alfa */
  color: #1A1614;                  /* TOKEN: ink */
  opacity: 0; transition: opacity .2s ease;
}
.gallery-tile:hover .gallery-hint,
.gallery-tile:focus-visible .gallery-hint { opacity: 1; }
```

### Markup modala (raz na stronę, przed `</body>`)

```html
<div id="lightbox"
     class="fixed inset-0 z-50 hidden items-center justify-center bg-[rgba(26,22,20,.92)] p-4 backdrop-blur-sm"
     role="dialog" aria-modal="true" aria-label="Podgląd zdjęcia z galerii">

  <button type="button" id="lightboxClose" aria-label="Zamknij podgląd"
          class="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(251,246,244,.14)] text-shell transition-colors hover:bg-[rgba(251,246,244,.26)] sm:right-6 sm:top-6">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
  </button>

  <button type="button" id="lightboxPrev" aria-label="Poprzednie zdjęcie"
          class="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(251,246,244,.14)] text-shell transition-colors hover:bg-[rgba(251,246,244,.26)] sm:left-5">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
  </button>

  <button type="button" id="lightboxNext" aria-label="Następne zdjęcie"
          class="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(251,246,244,.14)] text-shell transition-colors hover:bg-[rgba(251,246,244,.26)] sm:right-5">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
  </button>

  <figure class="mx-auto flex max-h-full max-w-3xl flex-col items-center">
    <img id="lightboxImg" src="" alt=""
         class="hidden max-h-[75vh] w-auto rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,.35)]">
    <div id="lightboxPh"
         class="flex aspect-[4/5] max-h-[75vh] w-[min(80vw,420px)] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-shell/40 p-8 text-center text-shell/80">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>
      <span id="lightboxPhText" class="text-[.78rem] font-semibold uppercase tracking-[1.5px]"></span>
    </div>
    <figcaption id="lightboxCounter" class="mt-5 text-[.8rem] font-semibold uppercase tracking-[1.5px] text-shell/70" aria-live="polite"></figcaption>
  </figure>
</div>
```

`figcaption` to **wyłącznie licznik**. Nie wstawiaj tam opisu zdjęcia — użytkownik kazał to usuwać
(„usunmy maly opis miedzy strzalkami a zdjeciem, po prostu czyste zdjecie i strzalki").

### Skrypt

Obsługuje wiele niezależnych grup galerii na jednej stronie (np. Efekty / Certyfikaty / Salon) —
strzałki przewijają tylko w obrębie otwartej grupy. Jeśli klient ma jedną galerię, zostaw jeden klucz.

```html
<script>
(function () {
  var GALLERIES = {
    // Kafelków może być mniej niż wpisów — przewijanie idzie przez CAŁĄ listę.
    efekty: [
      { src: 'photos/galeria/01.jpg', alt: 'Opis 1' },
      { src: 'photos/galeria/02.jpg', alt: 'Opis 2' }
      // …dopisz wszystkie zdjęcia, także te bez własnego kafelka
    ]
    // Brak zdjęć od klienta? Zostaw src pusty: { src: '', alt: 'zdjęcie 1' }
  };

  var lightbox = document.getElementById('lightbox');
  var tiles = document.querySelectorAll('.gallery-tile');
  if (!lightbox || !tiles.length) return;

  var img = document.getElementById('lightboxImg');
  var ph = document.getElementById('lightboxPh');
  var phText = document.getElementById('lightboxPhText');
  var counter = document.getElementById('lightboxCounter');
  var btnClose = document.getElementById('lightboxClose');
  var btnPrev = document.getElementById('lightboxPrev');
  var btnNext = document.getElementById('lightboxNext');
  var currentGroup = Object.keys(GALLERIES)[0];
  var current = 0;
  var lastFocused = null;

  function items() { return GALLERIES[currentGroup] || []; }

  function render() {
    var item = items()[current];
    if (!item) return;
    if (item.src) {
      img.src = item.src; img.alt = item.alt;
      img.classList.remove('hidden'); ph.classList.add('hidden');
    } else {
      phText.textContent = item.alt;
      img.classList.add('hidden'); ph.classList.remove('hidden');
    }
    counter.textContent = (current + 1) + ' / ' + items().length;
  }

  function open(group, index) {
    currentGroup = group; current = index;
    lastFocused = document.activeElement;
    render();
    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
    document.body.style.overflow = 'hidden';
    btnClose.focus();
  }

  function close() {
    lightbox.classList.add('hidden');
    lightbox.classList.remove('flex');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  // Modulo = zapętlenie w obie strony.
  function next() { var n = items().length; current = (current + 1) % n; render(); }
  function prev() { var n = items().length; current = (current - 1 + n) % n; render(); }

  tiles.forEach(function (tile) {
    tile.addEventListener('click', function () {
      open(tile.getAttribute('data-group') || currentGroup,
           parseInt(tile.getAttribute('data-index'), 10));
    });
  });

  btnClose.addEventListener('click', close);
  btnNext.addEventListener('click', next);
  btnPrev.addEventListener('click', prev);

  // Klik w tło (nie w zdjęcie) zamyka.
  lightbox.addEventListener('click', function (e) { if (e.target === lightbox) close(); });

  document.addEventListener('keydown', function (e) {
    if (lightbox.classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });
})();
</script>
```

---

## 2. Header: logo + sekcje + social + telefon

Trzy osobne, powtarzalne prośby w jednym komponencie (social w headerze — 13 sesji;
scroll-spy — 10 sesji; ciasny header na mobile — 4 sesje).

Zasady, których trzeba pilnować:
- **wszystko w JEDNEJ linii** z logo — sekcje nigdy pod spodem
- **na mobile numer znika, zostaje sama ikonka słuchawki** (`hidden sm:inline` na numerze).
  Przycisk CTA z numerem łamiący się na dwie linijki to najczęściej zgłaszany błąd mobilny
- sekcje przewijalne poziomo na mobile (`overflow-x-auto` + ukryty scrollbar), nie zawijane
- social media **obok telefonu**, nie obok sekcji
- ikony marek w kolorach strony (`bg-ink`), nie w oryginalnych barwach Facebooka/Instagrama

```html
<header class="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
  <div class="mx-auto flex max-w-content items-center gap-3 px-5 py-3 sm:gap-5 sm:px-7">

    <a href="index.html" aria-label="NAZWA KLIENTA, strona główna" class="inline-flex shrink-0 items-center">
      <img src="logo/logo-nav.png" alt="NAZWA" width="1224" height="356" class="h-[20px] w-auto sm:h-[24px]">
    </a>

    <nav aria-label="Sekcje strony"
         class="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:justify-center sm:gap-2">
      <a href="#uslugi"  data-nav="uslugi"  class="navlink">Usługi</a>
      <a href="#galeria" data-nav="galeria" class="navlink">Galeria</a>
      <a href="#opinie"  data-nav="opinie"  class="navlink">Opinie</a>
      <a href="#kontakt" data-nav="kontakt" class="navlink">Kontakt</a>
    </nav>

    <div class="flex shrink-0 items-center gap-2">
      <a href="INSTAGRAM_URL" target="_blank" rel="noopener" aria-label="Instagram"
         class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-ink text-bg transition-colors hover:bg-accent">
        <!-- ikona: patrz sekcja 6 -->
      </a>
      <a href="FACEBOOK_URL" target="_blank" rel="noopener" aria-label="Facebook"
         class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-ink text-bg transition-colors hover:bg-accent">
        <!-- ikona: patrz sekcja 6 -->
      </a>
      <a href="tel:+48000000000"
         class="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-[.9rem] font-semibold tracking-tight text-bg transition-colors hover:bg-accent">
        <!-- ikona telefonu -->
        <span class="hidden sm:inline">000 000 000</span>
      </a>
    </div>
  </div>
</header>
```

Website+ (klient ma Booksy): dodaj ikonę Booksy w tej samej grupie, przed CTA telefonicznym.

### CSS

```css
section[id] { scroll-margin-top: 78px; }   /* wysokość headera — inaczej kotwice chowają nagłówki */

.scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

.navlink {
  display: inline-flex; align-items: center; min-height: 36px; flex-shrink: 0;
  padding: 0 .7rem; border-radius: 999px; white-space: nowrap;
  font-size: .84rem; font-weight: 600; letter-spacing: -.01em;
  color: #6B5A56;                              /* TOKEN: ink-muted */
  transition: background-color .15s, color .15s;
}
.navlink:hover { color: #1A1614; }             /* TOKEN: ink */
.navlink.active { background: #1A1614; color: #FBF6F4; }  /* TOKEN: ink / bg */
```

### Scroll-spy

```html
<script>
(function () {
  if (!('IntersectionObserver' in window)) return;
  var links = {};
  document.querySelectorAll('.navlink[data-nav]').forEach(function (a) { links[a.dataset.nav] = a; });
  var current = null;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      if (current) current.classList.remove('active');
      current = links[entry.target.id] || null;
      if (current) current.classList.add('active');
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  Object.keys(links).forEach(function (id) {
    var section = document.getElementById(id);
    if (section) observer.observe(section);
  });
})();
</script>
```

`rootMargin: '-45% 0px -50% 0px'` = sekcja liczy się jako aktywna, gdy jest mniej więcej na środku
ekranu. Nie zmieniaj bez powodu — inne wartości powodują migotanie na krótkich sekcjach.

---

## 3. Godziny otwarcia z oznaczeniem „dziś"

Prośba przy 4 kolejnych klientach od 19.08. Wymagane: **podpis „dziś" + wyraźne podświetlenie
wiersza**. Samo pogrubienie było zgłaszane jako „słabo widać".

Wiersze tabeli muszą mieć `data-day` (poniedziałek = 0):

```html
<tr data-day="0"><th scope="row">Poniedziałek</th><td>9:00 – 17:00</td></tr>
<tr data-day="1"><th scope="row">Wtorek</th><td>9:00 – 17:00</td></tr>
<!-- … -->
<tr data-day="6"><th scope="row">Niedziela</th><td>Zamknięte</td></tr>
```

```css
tr.today th, tr.today td {
  background: rgba(138,74,64,.09);   /* TOKEN: accent z niskim alfa */
  color: #1A1614;                    /* TOKEN: ink */
  font-weight: 600;
}
tr.today th { border-radius: 10px 0 0 10px; }
tr.today td { border-radius: 0 10px 10px 0; }

.today-badge {
  display: inline-flex; align-items: center; margin-left: .5rem;
  padding: .1rem .5rem; border-radius: 999px;
  background: #8A4A40; color: #FBF6F4;   /* TOKEN: accent / bg */
  font-size: .64rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase;
  vertical-align: middle;
}
```

```html
<script>
(function () {
  var todayIdx = (new Date().getDay() + 6) % 7;  // JS: niedziela=0 → nasz układ: poniedziałek=0
  var row = document.querySelector('tr[data-day="' + todayIdx + '"]');
  if (!row) return;
  row.classList.add('today');
  var th = row.querySelector('th');
  if (th) {
    var badge = document.createElement('span');
    badge.className = 'today-badge';
    badge.textContent = 'dziś';
    th.appendChild(badge);
  }
})();
</script>
```

Ten sam wzorzec stosuj do cennika dziennego, jeśli klient go ma (np. `inaczej-szanel` — cennik
tygodniowy z podświetleniem dzisiejszego dnia).

---

## 4. Mapa na całą szerokość + „Wyznacz trasę"

Prośba przy 4 klientach. Mapa idzie **na sam dół sekcji kontaktu, przez całą szerokość strony**
(poza kontenerem `max-w-*`), tuż nad stopką.

```html
<div class="w-full">
  <iframe src="GOOGLE_MAPS_EMBED_URL" title="Mapa dojazdu do ADRES"
          loading="lazy" referrerpolicy="no-referrer-when-downgrade"
          class="map block h-[320px] w-full border-0 sm:h-[400px]"></iframe>
</div>
```

```css
.map { filter: grayscale(.55) sepia(.18) contrast(1.02); }  /* dostrój do motywu klienta */
```

Przycisk „Wyznacz trasę" — **ikona po lewej od tekstu**, jak w social media (prośba powtarzalna):

```html
<a href="https://www.google.com/maps/dir/?api=1&destination=ADRES+URLENCODED"
   target="_blank" rel="noopener"
   class="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border px-5 text-[.9rem] font-semibold text-ink transition-colors hover:bg-ink hover:text-bg">
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7m0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5"/>
  </svg>
  Wyznacz trasę
</a>
```

**Uwaga RODO:** iframe Google Maps musi być wspomniany w `privacy.html`.

---

## 5. CTA „Zostaw opinię" (Google)

Prośba przy 4 klientach. Link zawsze podaje użytkownik — jeśli go nie masz, **zapytaj**, nie zgaduj
`place_id`.

```html
<a href="LINK_DO_WYSTAWIENIA_OPINII" target="_blank" rel="noopener"
   class="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-accent px-6 text-[.9rem] font-semibold text-bg transition-colors hover:brightness-110">
  <!-- Logo Google w JEDNYM kolorze strony (currentColor), nie w oryginalnych czterech barwach -->
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.7 3-4.3 3-7.3 0-.7-.06-1.4-.18-2.05z"/>
    <path d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.2-2.48c-.9.6-2.05.95-3.42.95-2.6 0-4.8-1.76-5.6-4.13H3.1v2.6A10 10 0 0 0 12 22"/>
    <path d="M6.4 13.92a6 6 0 0 1 0-3.84V7.48H3.1a10 10 0 0 0 0 9.04z"/>
    <path d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.84-2.84C16.95 3.03 14.7 2 12 2A10 10 0 0 0 3.1 7.48l3.3 2.6C7.2 7.74 9.4 5.98 12 5.98"/>
  </svg>
  Zostaw opinię
</a>
```

Reguła ogólna: **logo zewnętrznej marki w CTA przyjmuje kolor strony, nie własny.**
Użytkownik prosił o to przy Google, Booksy, Facebooku i przy grafikach dekoracyjnych.

---

## 6. Ikony marek

**Nie rysuj tych ikon z pamięci.** Cztery razy trzeba było je poprawiać („ikonka fb dalej jest dziwna
wszędzie, pobierz oryginalną ikonę facebooka"). Kształt bierz stąd albo z pliku dostarczonego przez
klienta; kolor zawsze `currentColor` i sterowany klasą rodzica.

### Instagram
```html
<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.25.07 1.62.07 4.81s0 3.56-.07 4.81c-.05 1.17-.25 1.8-.41 2.23a3.7 3.7 0 0 1-.9 1.38 3.7 3.7 0 0 1-1.38.9c-.42.16-1.06.36-2.23.41-1.25.06-1.62.07-4.85.07s-3.6 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.56 2.2 15.19 2.2 12s0-3.56.07-4.81c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.44 2.21 8.8 2.2 12 2.2m0 1.98c-3.14 0-3.51.01-4.75.07-1.15.05-1.77.24-2.18.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.18-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05 1.15.24 1.77.4 2.18.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.18.4 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c1.15-.05 1.77-.24 2.18-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.18.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-1.15-.24-1.77-.4-2.18a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.18-.4-1.24-.06-1.61-.07-4.75-.07m0 3.37a5.45 5.45 0 1 1 0 10.9 5.45 5.45 0 0 1 0-10.9m0 8.99a3.54 3.54 0 1 0 0-7.08 3.54 3.54 0 0 0 0 7.08m6.94-9.21a1.27 1.27 0 1 1-2.55 0 1.27 1.27 0 0 1 2.55 0"/></svg>
```

### Facebook
```html
<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12"/></svg>
```

### Telefon
```html
<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z"/></svg>
```

### Booksy
Booksy nie ma stabilnej, publicznej ścieżki SVG. **Poproś użytkownika o plik** albo użyj pliku
z `photos/` klienta (kilku klientów już go dostarczyło, np. `Patent-na-Pazur/photos/unnamed.png`).
Nie rysuj monogramu „B" z pamięci — było odrzucane.

---

## 7. Sticky CTA „Umów wizytę" (opcjonalny)

Nie domyślny — dodawaj tylko gdy użytkownik poprosi albo gdy strona jest długa i telefon znika
z pola widzenia. Wzorzec z `Julia_Bednarska_Make-up`.

```html
<a href="tel:+48000000000"
   class="fixed bottom-5 right-5 z-40 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-accent px-6 text-[.95rem] font-semibold text-bg shadow-lg transition-transform hover:scale-[1.02] motion-reduce:transition-none">
  <!-- ikona telefonu -->
  Umów wizytę
</a>
```

---

## 8. Podświetlenie aktywnej pozycji — inne zastosowania

Ten sam mechanizm co scroll-spy przydaje się do:
- cennika tygodniowego (podświetl dzisiejszy dzień) — `inaczej-szanel`
- listy lokalizacji przy klientach wielosalonowych — `granda-barber-shop`

Trzymaj jedną klasę `.active` i jeden token koloru na całą stronę — nie twórz osobnych,
prawie identycznych odcieni dla każdego przypadku (One Accent Rule z `DESIGN.md`).
