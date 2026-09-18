/* ============================================================================
   gallery.js — galeria z filtrowaniem, lightbox i sekcja wideo.
   ----------------------------------------------------------------------------
   Jedno źródło danych, dwa widoki: strona publiczna i panel admina czytają
   te same endpointy workera. Gdy API nie jest jeszcze wdrożone (API_BASE
   pusty) albo nie odpowiada, galeria leci na zdjęciach z repo, żeby strona
   nigdy nie pokazała pustej sekcji.
   ========================================================================== */

/* Wlasny zakres, patrz komentarz w site.js. */
(function () {
  'use strict';

  /* ---------------------------------------------------------- konfiguracja --- */

  // TODO: po wdrożeniu workera (patrz README.md) wpisz tu jego adres,
  // np. 'https://portfolio-suszka.xxx.workers.dev'. Pusty = tryb lokalny.
  // Wyjątek: lokalny serwer statyczny (4325) + `wrangler dev` (8787) to dwa
  // różne porty, więc na localhost trzeba adres workera podać jawnie.
  const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : 'https://portfolio-suszka.project6osss.workers.dev';

  // Kategorie portfolio sa w pelni dynamiczne: kazdy folder z panelu, ktory
  // ma choc jedno zdjecie, staje sie osobna zakladka filtra — pod nazwa
  // i w kolejnosci, jaka Magda ustawil w panelu (position). Nie trzeba juz
  // dopasowywac nazwy folderu do sztywnej listy slow kluczowych po polsku —
  // to byl realny blad: foldery nazwane po angielsku ("Cars", "Events")
  // nigdy nie trafialy na strone, bo nie pasowaly do zadnego wpisu.

  // Zdjęcia leżące w repo. Po wdrożeniu panelu rolę tej listy przejmuje API,
  // a ona zostaje jako zapas na wypadek, gdyby worker nie odpowiedział.
  // `album` odpowiada nazwie albumu w panelu — patrz "podfiltry" niżej: kiedy
  // w kategorii jest więcej niż jeden nazwany album, strona sama pokazuje
  // dodatkowy rząd pigułek (np. konkretne auta pod "Ciąża"). Magda zarządza
  // tym sam w panelu, dodając kolejne albumy — nic tu nie trzeba przepinać.
  //
  // Pusta celowo: `public/photos/` zostało wyczyszczone, Magda wgrywa
  // portfolio od nowa przez panel. Pusta tablica = uczciwe kafle-placeholdery
  // zamiast połamanych <img> wskazujących na nieistniejące pliki.
  const LOCAL_PHOTOS = [];

  // Rolki. Pusta tablica = sekcja pokazuje uczciwe kafle-placeholdery 9:16.
  // Format wpisu: { src, poster, caption }
  const LOCAL_VIDEOS = [];

  const PAGE_SIZE = 12;
  const STAGGER = 25;

  /* ------------------------------------------------------------------ stan --- */

  let photos = [];
  let videos = [];
  let activeFilter = 'all';
  let activeAlbum = 'all';
  let gridExpanded = false;

  const filtersEl = document.getElementById('filters');
  const subfiltersEl = document.getElementById('subfilters');
  const masonryEl = document.getElementById('masonry');
  const moreWrap = document.getElementById('galleryMore');
  const moreBtn = document.getElementById('moreBtn');
  const reelsEl = document.getElementById('reels');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------- pomocnicze --- */

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  /** Nazwa albumu ("Ciąża") -> slug do URL ("bmw-e30"). Uzywane tez do
      zamiany nazwy folderu z panelu na slug kategorii w URL/filtrach. */
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * W widoku "Wszystko" przeplatamy kategorie po jednym zdjeciu na kolejke.
   * Bez tego siatka `columns` uklada sport w jednej kolumnie, a auta w drugiej
   * i portfolio wyglada jak dwa niezalezne stosy zamiast jednej galerii.
   */
  function interleave(list) {
    const slugs = [];
    list.forEach((photo) => { if (!slugs.includes(photo.cat)) slugs.push(photo.cat); });
    const queues = slugs.map((slug) => list.filter((photo) => photo.cat === slug));
    const out = [];
    for (let i = 0; out.length < list.length; i++) {
      queues.forEach((queue) => { if (queue[i]) out.push(queue[i]); });
    }
    return out;
  }

  function visiblePhotos() {
    if (activeFilter === 'all') return interleave(photos.filter((photo) => photo.inGallery));
    const inCategory = photos.filter((photo) => photo.cat === activeFilter);
    if (activeAlbum === 'all') return inCategory;
    return inCategory.filter((photo) => slugify(photo.album) === activeAlbum);
  }

  /** Nazwane albumy obecne w danej kategorii, w kolejności pierwszego wystąpienia. */
  function albumsInCategory(slug) {
    const names = [];
    photos.filter((photo) => photo.cat === slug).forEach((photo) => {
      if (photo.album && !names.includes(photo.album)) names.push(photo.album);
    });
    return names;
  }

  /* ----------------------------------------------------------------- dane --- */

  /**
   * Zdjęcia, bloki tekstu i rolki z workera: /api/folders + /api/folders/:id/content
   * dla każdej kategorii. Zdjęcia i teksty trafiają do wspólnej listy "photos"
   * (z polem `type`) — obie renderowane są jako kafle mozaiki (patrz renderGrid),
   * `grid_w`/`grid_h` z panelu decyduje o rozmiarze kafla dokladnie tak samo
   * jak w samym panelu (patrz applyGridSize).
   */
  async function loadFromApi() {
    const response = await fetch(API_BASE + '/api/folders');
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || 'Bład API');

    // Kazdy folder z panelu to potencjalna kategoria — slug robimy z jego
    // realnej nazwy (slugify), zeby dzialalo bez wzgledu na jezyk/pisownie.
    const folders = payload.data.map((folder) => ({ ...folder, slug: slugify(folder.name) }));

    const results = await Promise.all(folders.map(async (folder) => {
      const res = await fetch(API_BASE + '/api/folders/' + folder.id + '/content');
      const body = await res.json();
      if (!body.ok) return { photos: [], videos: [] };

      const items = body.data.flatMap((album) => album.items.map((item) => ({ item, album })));

      return {
        photos: items
          .filter(({ item }) => item.type === 'photo' || item.type === 'text')
          .map(({ item, album }) => {
            const base = {
              cat: folder.slug,
              // Nazwa folderu z panelu = etykieta zakladki filtra — pokazujemy
              // ja dokladnie tak, jak Magda ja napisal (patrz renderFilters).
              catLabel: folder.name,
              // Nazwa albumu z panelu napędza podfiltry "Ciąża" —
              // pusta nazwa (sekcja bez nagłówka) po prostu nie tworzy podfiltra.
              album: album.name || null,
              gridW: item.grid_w,
              gridH: item.grid_h,
            };
            return item.type === 'photo'
              ? {
                  ...base,
                  type: 'photo',
                  url: item.url,
                  alt: item.display_name || 'Zdjecie z portfolio, kategoria ' + folder.name,
                  caption: item.display_name || '',
                }
              : { ...base, type: 'text', html: item.html, style: item.style };
          }),
        videos: items
          .filter(({ item }) => item.type === 'video')
          .map(({ item }) => ({
            src: item.url,
            poster: item.poster || null,
            caption: item.display_name || '',
          })),
      };
    }));

    const photos = results.flatMap((r) => r.photos);
    const apiVideos = results.flatMap((r) => r.videos);
    if (!photos.length) throw new Error('Portfolio w panelu jest jeszcze puste');
    return { photos, videos: apiVideos };
  }

  // Kategorie sa teraz w calosci tym, co jest w panelu — nic juz nie odsiewa
  // zdjec z portfolio po nazwie folderu, wiec `inGallery` zawsze jest prawda.
  // Pole zostaje (zamiast usuwac filtr .inGallery w kilku miejscach nizej),
  // gdyby kiedys wrocil pomysl na folder celowo niewidoczny w portfolio.
  // `type` domyslnie 'photo' — LOCAL_PHOTOS (zapas, gdy API nie odpowiada)
  // moze go nie miec.
  function decorate(list) {
    return list.map((photo) => ({ ...photo, inGallery: true, type: photo.type || 'photo' }));
  }

  /* -------------------------------------------------------------- filtry --- */

  function renderFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = '';

    // Zakladka pokazuje sie TYLKO gdy ma choc jedno zdjecie — jak Magda
    // usunie w panelu caly folder danej niszy (albo jeszcze nic tam nie
    // wgral), pigulka znika zamiast wisiec z (0). "Wszystko" tak samo:
    // bez tego zniknieciaby zostala samotna pigulka bez sensu.
    //
    // Lista kategorii jest budowana z samych zdjec (kolejnosc pierwszego
    // wystapienia = kolejnosc folderow z panelu, patrz loadFromApi), nie
    // ze sztywnej listy — kazdy folder z choc jednym zdjeciem staje sie
    // widoczna zakladka, pod wlasna nazwa z panelu.
    const totalInGallery = photos.filter((photo) => photo.inGallery).length;
    const seenSlugs = [];
    photos.filter((photo) => photo.inGallery).forEach((photo) => {
      if (!seenSlugs.includes(photo.cat)) seenSlugs.push(photo.cat);
    });
    const categoryEntries = seenSlugs.map((slug) => {
      const withSlug = photos.filter((photo) => photo.cat === slug);
      return { slug, label: withSlug[0].catLabel || slug, count: withSlug.length };
    });

    if (!totalInGallery || !categoryEntries.length) {
      filtersEl.hidden = true;
      if (activeFilter !== 'all') activeFilter = 'all';
      return;
    }
    filtersEl.hidden = false;

    const entries = [{ slug: 'all', label: 'Wszystko', count: totalInGallery }, ...categoryEntries];

    // Aktywna kategoria wlasnie zniknela (admin usunal jej ostatnie zdjecie) —
    // wracamy do "Wszystko" zamiast zostawiac filtr wskazujacy donikad.
    if (!entries.some((entry) => entry.slug === activeFilter)) activeFilter = 'all';

    entries.forEach((entry) => {
      const button = el('button', 'filter');
      button.type = 'button';
      button.dataset.slug = entry.slug;
      button.setAttribute('aria-pressed', String(entry.slug === activeFilter));

      // Strzalka tylko tam, gdzie faktycznie jest co rozwinac (2+ nazwane
      // albumy = te same warunki co przy pokazywaniu podfiltrow nizej).
      // Obraca sie w dol, gdy kategoria jest aktywna (patrz CSS .filter--has-children).
      const hasChildren = entry.slug !== 'all' && albumsInCategory(entry.slug).length >= 2;
      if (hasChildren) button.classList.add('filter--has-children');
      const chevron = hasChildren
        ? '<svg class="filter__chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">'
          + '<path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" stroke-width="1.4" '
          + 'stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '';

      button.innerHTML = chevron + entry.label
        + ' <span class="filter__count">(' + entry.count + ')</span>';
      button.addEventListener('click', () => setFilter(entry.slug));
      filtersEl.append(button);
    });
  }

  function syncFilterButtons() {
    if (!filtersEl) return;
    filtersEl.querySelectorAll('.filter').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.slug === activeFilter));
    });
  }

  /**
   * Rozwija/zwija #subfilters animujac RZECZYWISTA wysokosc tresci (zmierzona
   * przez scrollHeight), nie zgadywany max-height. Zgadywany max-height (np.
   * "480px, powinno wystarczyc") przeskakuje: przegladarka animuje cala
   * zadeklarowana wartosc, wiec przy tresci krotszej niz cap ruch konczy sie
   * dlugo przed uplywem czasu animacji i wyglada jak nagly skok zamiast
   * plynnego rozwiniecia. Mierzac scrollHeight na biezaco dostajemy dokladny
   * cel — animacja zawsze trwa cala zadeklarowana dlugosc.
   */
  // Sidebar (pionowa lista, patrz CSS) dostaje plynne rozwijanie WYSOKOSCI.
  // Pigulki na telefonie (poziomy rzad z przewijaniem) — tylko fade opacity,
  // patrz komentarz przy .filters--sub w CSS czemu height tam nie pasuje.
  const isSidebarLayout = () => window.matchMedia('(min-width: 900px)').matches;

  function setSubfiltersOpen(open) {
    if (open) {
      subfiltersEl.removeAttribute('aria-hidden');
      subfiltersEl.classList.add('is-open');
    } else {
      subfiltersEl.classList.remove('is-open');
      subfiltersEl.setAttribute('aria-hidden', 'true');
    }

    if (!isSidebarLayout()) return;

    const current = subfiltersEl.getBoundingClientRect().height;

    // Chromium ma quirk: scrollHeight kontenera flex-direction:column +
    // overflow:hidden, gdy jego WLASNA wysokosc jest mala/zerowa, raportuje
    // wysokosc TYLKO JEDNEJ "linii" tresci (np. 26px), nie sumy wszystkich
    // dzieci (np. 95px) — mimo flex-shrink:0 na dzieciach. Przelaczanie
    // display na chwile "naprawia" odczyt, ale zaburza zaraz potem wlasciwa
    // animacje wysokosci (przegladarka gubi wtedy referencje do poprzedniej
    // klatki, wiec transition juz sie nie odpala). Zamiast tego mierzymy
    // rozpietosc od gory pierwszego do dolu ostatniego dziecka bezposrednio —
    // dzieci maja stabilny, wlasny rozmiar (flex-shrink:0) niezalezny od
    // ograniczenia rodzica, wiec to zawsze daje prawdziwa wartosc, bez
    // dotykania stylu rodzica przed docelowa animacja.
    let target = 0;
    if (open && subfiltersEl.children.length) {
      const kids = subfiltersEl.children;
      target = kids[kids.length - 1].getBoundingClientRect().bottom - kids[0].getBoundingClientRect().top;
    }

    subfiltersEl.style.height = current + 'px';
    // Wymuszony reflow — zeby przegladarka zdazyla "zobaczyc" wartosc
    // startowa, zanim w tej samej klatce ustawimy docelowa (inaczej brak animacji).
    void subfiltersEl.offsetHeight;
    subfiltersEl.style.height = target + 'px';
  }

  // Po dojechaniu animacji przy otwarciu wracamy do height:auto, zeby np.
  // zmiana szerokosci ekranu (i wysokosci zawinietego tekstu) nie zostala
  // uwięziona w stalej wartosci px zmierzonej przy innej szerokosci.
  if (subfiltersEl) {
    subfiltersEl.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'height' && subfiltersEl.classList.contains('is-open')) {
        subfiltersEl.style.height = 'auto';
      }
    });
  }

  /**
   * Podfiltry albumów — pojawiają się TYLKO gdy w aktywnej kategorii jest
   * więcej niż jeden nazwany album (np. Magda dodał w panelu osobne albumy
   * "Ciąża", "Ciąża" pod folderem "Ciąża"). Jeden album albo brak
   * nazwanych albumów = rząd zostaje pusty i ukryty, bez przełącznika,
   * który i tak niczego by nie zawężał.
   */
  function renderSubfilters() {
    if (!subfiltersEl) return;

    // W SIDEBARZE (pionowa lista) podfiltry maja sie pojawiac pod WLASNIE
    // kliknieta kategoria — wstawiamy #subfilters jako kolejny element
    // WEWNATRZ #filters, zaraz po aktywnym przycisku.
    // Na TELEFONIE (pozioma, przewijana lista pigulek) ta sama sztuczka
    // wsadzalaby caly rzad podfiltrow JAKO KOLEJNA POZYCJE tego samego
    // poziomego scrollera — trzeba by bylo przewinac pigulki w bok, zeby
    // je zobaczyc (dokladnie ten zglaszany "slider lewo-prawo"). Na
    // telefonie #subfilters wraca wiec na swoje stale miejsce z HTML:
    // osobny, pelnoszerokosciowy rzad pod CALA lista kategorii.
    if (filtersEl) {
      if (isSidebarLayout()) {
        const activeButton = filtersEl.querySelector('.filter[data-slug="' + activeFilter + '"]');
        if (activeButton) activeButton.after(subfiltersEl);
      } else {
        filtersEl.after(subfiltersEl);
      }
    }

    const names = activeFilter === 'all' ? [] : albumsInCategory(activeFilter);

    if (names.length < 2) {
      if (activeAlbum !== 'all') activeAlbum = 'all';
      subfiltersEl.innerHTML = '';
      setSubfiltersOpen(false);
      return;
    }

    subfiltersEl.innerHTML = '';

    const entries = [{ slug: 'all', label: 'Wszystkie' }]
      .concat(names.map((name) => ({ slug: slugify(name), label: name })));

    // Album ze starego / ręcznie wklejonego linku, którego już nie ma
    // (Magda zmienił nazwę albumu) — zamiast pustej galerii wracamy do "Wszystkie".
    if (!entries.some((entry) => entry.slug === activeAlbum)) activeAlbum = 'all';

    entries.forEach((entry) => {
      const button = el('button', 'filter filter--sub');
      button.type = 'button';
      button.dataset.slug = entry.slug;
      button.setAttribute('aria-pressed', String(entry.slug === activeAlbum));
      button.textContent = entry.label;
      button.addEventListener('click', () => setAlbum(entry.slug));
      subfiltersEl.append(button);
    });

    setSubfiltersOpen(true);
  }

  function syncSubfilterButtons() {
    if (!subfiltersEl) return;
    subfiltersEl.querySelectorAll('.filter--sub').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.slug === activeAlbum));
    });
  }

  /** Filtr żyje w adresie, żeby dało się wysłać komuś link do samego sportu. */
  function writeUrl() {
    const url = new URL(location.href);
    if (activeFilter === 'all') url.searchParams.delete('f');
    else url.searchParams.set('f', activeFilter);
    if (activeAlbum === 'all') url.searchParams.delete('a');
    else url.searchParams.set('a', activeAlbum);
    // Portfolio ma wlasna podstrone (portfolio.html) — filtr zyje w zwyklym
    // query stringu, bez hasha #portfolio z czasow jednej strony.
    url.hash = '';
    history.replaceState(null, '', url);
  }

  function readUrl() {
    const params = new URLSearchParams(location.search);
    // Stare linki (sprzed podzialu na podstrony) mialy postac #portfolio?f=sport
    // — wciaz je czytamy, zeby raz wyslany link komus nie przestal dzialac.
    const hash = location.hash.slice(1);
    const hashParams = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1)) : null;
    const fromQuery = params.get('f');
    const fromHash = hashParams ? hashParams.get('f') : null;
    const wantedFilter = fromQuery || fromHash;
    const wantedAlbum = params.get('a') || (hashParams && hashParams.get('a'));

    // Kategorie sa dynamiczne i jeszcze nieznane w tym miejscu (dane z API
    // nie sa jeszcze zaladowane) — renderFilters() i tak zawraca do "all",
    // jesli ten slug finalnie nie odpowiada zadnej istniejacej kategorii.
    return {
      filter: wantedFilter || 'all',
      album: wantedAlbum || 'all',
    };
  }

  function setFilter(slug, skipUrl) {
    if (!masonryEl || slug === activeFilter) return;
    activeFilter = slug;
    activeAlbum = 'all';
    gridExpanded = false;
    syncFilterButtons();
    renderSubfilters();
    if (!skipUrl) writeUrl();

    const tiles = [...masonryEl.children];
    if (reduceMotion || !tiles.length) {
      renderGrid();
      return;
    }
    // Najpierw znikają stare kafle, dopiero potem przebudowa siatki.
    tiles.forEach((tile) => tile.classList.add('is-out'));
    setTimeout(renderGrid, 180);
  }

  function setAlbum(slug) {
    if (!masonryEl || slug === activeAlbum) return;
    activeAlbum = slug;
    gridExpanded = false;
    syncSubfilterButtons();
    writeUrl();

    const tiles = [...masonryEl.children];
    if (reduceMotion || !tiles.length) {
      renderGrid();
      return;
    }
    tiles.forEach((tile) => tile.classList.add('is-out'));
    setTimeout(renderGrid, 180);
  }

  /* --------------------------------------------------------------- siatka --- */

  /**
   * Ustawia --w/--h (siatka 6-kolumnowa od 768px) i --mw/--mh (2 kolumny na
   * telefonie) z grid_w/grid_h ustawionych w panelu — dokladnie ten sam
   * mechanizm co w panelu (public/admin/index.html), zeby podglad tam byl
   * wierny temu, co widac tutaj. Bloki tekstu na telefonie zawsze zajmuja
   * pelna szerokosc i jeden wiersz (za malo miejsca na wielowierszowy uklad).
   */
  function applyGridSize(node, entry) {
    const gridW = entry.gridW || 2;
    const gridH = entry.gridH || 2;
    const mobileWidth = entry.type === 'text' || gridW >= 4 ? 2 : 1;
    const mobileHeight = entry.type === 'text' ? 1 : Math.min(gridH, 3);
    node.style.setProperty('--w', gridW);
    node.style.setProperty('--h', gridH);
    node.style.setProperty('--mw', mobileWidth);
    node.style.setProperty('--mh', mobileHeight);
  }

  function buildShot(photo, index, list) {
    const button = el('button', 'shot');
    button.type = 'button';
    button.setAttribute('aria-label', 'Powiększ zdjęcie: ' + (photo.alt || 'zdjęcie z portfolio'));
    applyGridSize(button, photo);

    const image = new Image();
    image.src = photo.url;
    image.alt = photo.alt || '';
    image.loading = index < 4 ? 'eager' : 'lazy';
    image.decoding = 'async';

    button.append(image);
    button.addEventListener('click', () => openLightbox(list, index));
    return button;
  }

  // Ta sama lista fontow co w panelu (patrz public/admin/index.html) —
  // hostowane lokalnie w assets/fonts/admin/, wczytywane przez admin-fonts.css.
  const TEXT_FONT_FALLBACKS = {
    'Work Sans': 'sans-serif',
    'Montserrat': 'sans-serif',
    'DM Sans': 'sans-serif',
    'Playfair Display': 'serif',
    'Cormorant Garamond': 'serif',
    'Lora': 'serif',
    'Great Vibes': 'cursive',
    'Caveat': 'cursive',
  };

  function buildText(entry) {
    const tile = el('div', 'text-tile');
    applyGridSize(tile, entry);

    const { font, size, align, color, bg } = entry.style || {};
    if (bg) tile.style.backgroundColor = bg;

    const body = el('div', 'text-tile__body');
    body.style.setProperty('--fs', size || 32);
    body.style.fontFamily = "'" + (font || 'Work Sans') + "', " + (TEXT_FONT_FALLBACKS[font] || 'sans-serif');
    body.style.textAlign = align || 'center';
    if (color) body.style.color = color;
    // HTML jest oczyszczany przez workera przy zapisie (tylko b/i/u/br/div/p,
    // bez atrybutow) — bezpieczne do wstawienia przez innerHTML.
    body.innerHTML = entry.html || '';

    tile.append(body);
    return tile;
  }

  function buildPlaceholder(text) {
    const box = el('div', 'placeholder');
    box.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>'
      + '<circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.5"/></svg>'
      + '<span>' + text + '</span>';
    return box;
  }

  // Lightbox przewija po calej (nie tylko widocznej) liscie zdjec — bloki
  // tekstu nie maja podgladu i nie licza sie do numeracji "n / N".
  function buildTile(entry, photoList) {
    return entry.type === 'text'
      ? buildText(entry)
      : buildShot(entry, photoList.indexOf(entry), photoList);
  }

  // Wysokosc siatki w stanie zwinietym (px) — zmierzona przy ostatnim
  // renderGrid, zeby "Pokaz mniej" mogl do niej wrocic bez ponownego mierzenia.
  let collapsedHeight = 0;

  const DESKTOP_GRID = window.matchMedia('(min-width: 768px)');

  /**
   * Wlasny "skyline" bin-packing zamiast polegania wylacznie na
   * grid-auto-flow:dense. Dense skanuje wiersz po wierszu i wypelnia TYLKO
   * dokladne dziury, na ktore trafi w kolejnosci DOM — nie szuka aktywnie
   * globalnie najnizszego wolnego miejsca, wiec kilka kafli pod rzad o tym
   * samym ksztalcie (np. seria pionowek z telefonu) potrafi zostawic duzy,
   * pusty prostokat obok. Skyline sledzi wysokosc KAZDEJ kolumny osobno i
   * dla kazdego kafla aktywnie szuka kolumny, w ktorej zacznie sie najwyzej
   * (czyli najnizszy punkt startowy) — dokladnie tak dziala prawdziwy
   * masonry (Pinterest/Packery), tylko wyrazony przez grid-column/grid-row
   * zamiast bezwzglednego pozycjonowania.
   *
   * Gdy kafel w ogole nie miesci sie w pozostalej szerokosci (np. grid_w=4
   * a zostaly 3 wolne kolumny z 6), przycinamy jego szerokosc do tego, co
   * jest dostepne w NAJLEPSZEJ kolumnie — to jedyny sposob na gwarantowanie
   * rownej prawej krawedzi bez dziur: czasem trzeba kafel zwezic, zamiast
   * zostawiac po nim pustke.
   */
  function packTiles(list, tiles) {
    const desktop = DESKTOP_GRID.matches;
    const columns = desktop ? 6 : 2;
    const heights = new Array(columns).fill(0);

    list.forEach((entry, i) => {
      const gridW = entry.gridW || 2;
      const gridH = entry.gridH || 2;
      const wantedW = desktop
        ? gridW
        : (entry.type === 'text' || gridW >= 4 ? 2 : 1);
      const h = desktop ? gridH : (entry.type === 'text' ? 1 : Math.min(gridH, 3));
      const w = Math.min(wantedW, columns);

      // Szukamy kolumny startowej, w ktorej pas szerokosci w zaczyna sie
      // najwyzej (najnizsza wartosc w heights) — to jest sedno skyline.
      let bestCol = 0;
      let bestTop = Infinity;
      for (let col = 0; col <= columns - w; col++) {
        let segTop = 0;
        for (let c = col; c < col + w; c++) segTop = Math.max(segTop, heights[c]);
        if (segTop < bestTop) { bestTop = segTop; bestCol = col; }
      }

      // Domykanie samotnej, JEDNOKOLUMNOWEJ reszty: gdy tuz za polozonym
      // kaflem zostaje dokladnie jedna wolna kolumna na tej samej wysokosci
      // (a dalej juz jest wyzej albo to koniec rzedu), praktycznie nic jej
      // nie wypelni — zdjecia maja zwykle szerokosc 2+, wiec taka dziura
      // zostalaby pusta na dobre (dokladnie to zglosil klient: 3+2 z 6
      // kolumn zostawia samotna "6-ta" na zawsze). Poszerzamy WLASNIE
      // polozony kafel o ta jedna kolumne zamiast zostawiac po nim dziure.
      let finalW = w;
      if (
        bestCol + finalW < columns
        && heights[bestCol + finalW] <= bestTop
        && (bestCol + finalW + 1 >= columns || heights[bestCol + finalW + 1] > bestTop)
      ) {
        finalW += 1;
      }

      for (let c = bestCol; c < bestCol + finalW; c++) heights[c] = bestTop + h;

      const tile = tiles[i];
      tile.style.gridColumn = (bestCol + 1) + ' / span ' + finalW;
      tile.style.gridRow = (bestTop + 1) + ' / span ' + h;
    });
  }

  /**
   * Renderuje ZAWSZE cala liste (nie tylko pierwsze PAGE_SIZE) — inaczej
   * grid-auto-flow:dense nie ma z czego wypelniac luk po wiekszych kaflach:
   * przy tylko 12 zdjeciach w DOM zostawaly czarne dziury, bo zdjecie, ktore
   * mialoby je wypelnic, jeszcze nie istnialo w siatce (patrz zrzuty ekranu —
   * dziury znikaly dopiero po "Pokaz wiecej"). Renderujac wszystko na raz i
   * PRZYCINAJAC WYSOKOSC kontenera zamiast liczby kafli, packing zawsze ma
   * pelny material do wypelniania luk, a "zwiniecie" to tylko kosmetyczne
   * ograniczenie widoku, nie inny stan danych.
   */
  function renderGrid() {
    if (!masonryEl) return;
    const list = visiblePhotos();
    masonryEl.innerHTML = '';
    masonryEl.style.height = '';

    if (!list.length) {
      for (let i = 0; i < 3; i++) masonryEl.append(buildPlaceholder('miejsce na zdjęcia'));
      moreWrap.hidden = true;
      return;
    }

    const photoList = list.filter((entry) => entry.type !== 'text');
    const tiles = list.map((entry, index) => {
      const tile = buildTile(entry, photoList);
      masonryEl.append(tile);
      if (reduceMotion) {
        tile.classList.add('is-in');
      } else {
        setTimeout(() => tile.classList.add('is-in'), index % PAGE_SIZE * STAGGER);
      }
      return tile;
    });

    packTiles(list, tiles);

    if (list.length <= PAGE_SIZE) {
      moreWrap.hidden = true;
      return;
    }

    // Wysokosc "zwinieta" = najnizsza dolna krawedz spomiedzy pierwszych
    // PAGE_SIZE kafli (w kolejnosci z API/panelu) — skyline moglo dociagnac
    // tam tez pozniejszy, mniejszy kafelek, zeby wypelnic luke, i to jest
    // pozadane. Mierzymy PO ustawieniu jawnych pozycji, bo dopiero wtedy
    // przegladarka wie, jak faktycznie ulozylo sie cala siatka.
    const gridTop = masonryEl.getBoundingClientRect().top;
    collapsedHeight = Math.max(
      ...tiles.slice(0, PAGE_SIZE).map((tile) => tile.getBoundingClientRect().bottom - gridTop),
    );

    if (collapsedHeight >= masonryEl.scrollHeight - 1) {
      // Dense i tak upchnelo wszystko w obrebie pierwszych PAGE_SIZE wierszy
      // (male kafelki, duzo wolnego miejsca) — nie ma czego pokazywac "wiecej".
      moreWrap.hidden = true;
      return;
    }

    moreWrap.hidden = false;
    moreBtn.textContent = 'Pokaż więcej';
    masonryEl.style.height = collapsedHeight + 'px';
  }

  /** Rozwija/zwija siatke tym samym mechanizmem co setSubfiltersOpen wyzej —
      patrz ten komentarz po wyjasnienie, czemu height mierzony w JS, nie
      zgadywany max-height. */
  function setGridExpanded(open) {
    const current = masonryEl.getBoundingClientRect().height;
    masonryEl.style.height = current + 'px';
    void masonryEl.offsetHeight;
    masonryEl.style.height = (open ? masonryEl.scrollHeight : collapsedHeight) + 'px';
    moreBtn.textContent = open ? 'Pokaż mniej' : 'Pokaż więcej';
  }

  // Po pelnym rozwinieciu wracamy do height:auto, zeby np. zmiana szerokosci
  // ekranu (inny uklad dense, inna naturalna wysokosc) nie zostala uwięziona
  // w nieaktualnej wartosci px zmierzonej przy innej szerokosci.
  if (masonryEl) {
    masonryEl.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'height' && gridExpanded) {
        masonryEl.style.height = 'auto';
      }
    });
  }

  /* ------------------------------------------------------------ lightbox --- */

  let box = null;
  let boxList = [];
  let boxIndex = 0;
  let boxOpener = null;

  function openLightbox(list, index) {
    boxList = list;
    boxIndex = index;
    boxOpener = document.activeElement;

    box = el('div', 'lightbox');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Powiększone zdjęcie');
    box.innerHTML =
        '<p class="lightbox__count"></p>'
      + '<img alt="">'
      + '<p class="lightbox__caption"></p>'
      + '<button type="button" class="lightbox__btn lightbox__close" aria-label="Zamknij">'
      + '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
      + '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg></button>'
      + '<button type="button" class="lightbox__btn lightbox__prev" aria-label="Poprzednie zdjęcie">'
      + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<path d="M14.5 5L8 12l6.5 7" stroke="currentColor" stroke-width="1.5"/></svg></button>'
      + '<button type="button" class="lightbox__btn lightbox__next" aria-label="Następne zdjęcie">'
      + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<path d="M9.5 5L16 12l-6.5 7" stroke="currentColor" stroke-width="1.5"/></svg></button>';

    box.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
    box.querySelector('.lightbox__prev').addEventListener('click', () => step(-1));
    box.querySelector('.lightbox__next').addEventListener('click', () => step(1));
    box.addEventListener('click', (event) => { if (event.target === box) closeLightbox(); });

    if (list.length < 2) {
      box.querySelector('.lightbox__prev').hidden = true;
      box.querySelector('.lightbox__next').hidden = true;
    }

    let touchX = 0;
    box.addEventListener('touchstart', (event) => {
      touchX = event.changedTouches[0].clientX;
    }, { passive: true });
    box.addEventListener('touchend', (event) => {
      const distance = event.changedTouches[0].clientX - touchX;
      if (Math.abs(distance) > 50) step(distance < 0 ? 1 : -1);
    }, { passive: true });

    // Zdjęcie trafia do <img> jeszcze przed wstawieniem do dokumentu,
    // żeby nie mignęła pusta ramka.
    show();

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.append(box);

    requestAnimationFrame(() => box.classList.add('is-open'));
    box.querySelector('.lightbox__close').focus();
  }

  function show() {
    const photo = boxList[boxIndex];
    const image = box.querySelector('img');
    image.src = photo.url;
    image.alt = photo.alt || '';
    // Alt to opis dla czytnika ekranu, nie podpis kuratorski. Pod zdjeciem
    // pokazujemy wylacznie nazwe nadana w panelu (display_name), jesli jest.
    box.querySelector('.lightbox__caption').textContent = photo.caption || '';
    box.querySelector('.lightbox__count').textContent =
      (boxIndex + 1) + ' / ' + boxList.length;

    // Sąsiednie kadry do cache, żeby strzałka nie czekała na pobranie.
    [-1, 1].forEach((offset) => {
      const neighbour = boxList[(boxIndex + offset + boxList.length) % boxList.length];
      if (neighbour) new Image().src = neighbour.url;
    });
  }

  function step(direction) {
    boxIndex = (boxIndex + direction + boxList.length) % boxList.length;
    show();
  }

  /** Focus trap: Tab nie może wyjść poza lightbox. */
  function onKey(event) {
    if (event.key === 'Escape') { closeLightbox(); return; }
    if (event.key === 'ArrowLeft') { step(-1); return; }
    if (event.key === 'ArrowRight') { step(1); return; }
    if (event.key !== 'Tab') return;

    const focusable = [...box.querySelectorAll('button:not([hidden])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeLightbox() {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    box.remove();
    box = null;
    if (boxOpener) boxOpener.focus();
  }

  /* --------------------------------------------------------------- wideo --- */

  const PLAY_ICON =
      '<svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden="true">'
    + '<circle cx="24" cy="24" r="17" stroke="currentColor" stroke-width="1.5"/>'
    + '<path d="M20.5 17.5l11 6.5-11 6.5v-13z" stroke="currentColor" stroke-width="1.5" '
    + 'stroke-linejoin="round"/></svg>';

  function renderReels() {
    if (!reelsEl) return;
    reelsEl.innerHTML = '';

    if (!videos.length) {
      for (let i = 0; i < 4; i++) {
        const card = el('div', 'reel reel--empty');
        const frame = el('div', 'reel__frame');
        frame.innerHTML = PLAY_ICON + '<span>miejsce na rolkę</span>';
        card.append(frame);
        reelsEl.append(card);
      }
      return;
    }

    videos.forEach((video) => {
      const card = el('div', 'reel');

      const frame = el('button', 'reel__frame');
      frame.type = 'button';
      frame.setAttribute('aria-label', 'Odtwórz: ' + (video.caption || 'rolka'));

      const media = document.createElement('video');
      media.src = video.src;
      if (video.poster) media.poster = video.poster;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.preload = 'none';

      const play = el('span', 'reel__play');
      play.innerHTML = PLAY_ICON;

      frame.append(media, play);

      // Zapowiedź startuje dopiero pod kursorem i tylko gdy ruch jest dozwolony.
      if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
        frame.addEventListener('mouseenter', () => {
          play.style.opacity = '0';
          media.play().catch(() => { play.style.opacity = ''; });
        });
        frame.addEventListener('mouseleave', () => {
          media.pause();
          media.currentTime = 0;
          play.style.opacity = '';
        });
      }

      frame.addEventListener('click', () => openVideo(video));

      const caption = el('p', 'reel__caption');
      caption.textContent = video.caption || '';

      card.append(frame, caption);
      reelsEl.append(card);
    });
  }

  let videobox = null;
  let videoOpener = null;

  function openVideo(video) {
    videoOpener = document.activeElement;
    videobox = el('div', 'videobox');
    videobox.setAttribute('role', 'dialog');
    videobox.setAttribute('aria-modal', 'true');
    videobox.setAttribute('aria-label', video.caption || 'Odtwarzanie rolki');

    // URL rolki trafia do .src jako wlasciwosc DOM, nie do innerHTML jako
    // string — inaczej cudzyslow w nazwie pliku z panelu zlamalby atrybut.
    const player = document.createElement('video');
    player.controls = true;
    player.autoplay = true;
    player.playsInline = true;
    player.src = video.src;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox__btn lightbox__close';
    closeBtn.setAttribute('aria-label', 'Zamknij');
    closeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
      + '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg>';

    videobox.append(player, closeBtn);

    const close = () => {
      document.removeEventListener('keydown', onVideoKey);
      document.body.style.overflow = '';
      videobox.remove();
      videobox = null;
      if (videoOpener) videoOpener.focus();
    };

    function onVideoKey(event) {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') event.preventDefault();
    }

    videobox.querySelector('button').addEventListener('click', close);
    videobox.addEventListener('click', (event) => {
      if (event.target === videobox) close();
    });

    document.addEventListener('keydown', onVideoKey);
    document.body.style.overflow = 'hidden';
    document.body.append(videobox);
    requestAnimationFrame(() => videobox.classList.add('is-open'));
    videobox.querySelector('button').focus();
  }

  /* ----------------------------------------------------------------- start --- */

  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      gridExpanded = !gridExpanded;
      setGridExpanded(gridExpanded);
    });
  }

  // packTiles ustawia jawne grid-column/grid-row dla liczby kolumn z
  // MOMENTU renderowania — w odroznieniu od auto-placement CSS, ktore samo
  // przelicza sie po zmianie media query, jawne pozycje trzeba przeliczyc
  // recznie, gdy telefon/desktop granica (768px) zostanie przekroczona
  // (np. obrocenie tabletu, zmiana rozmiaru okna).
  if (masonryEl) {
    DESKTOP_GRID.addEventListener('change', () => renderGrid());
  }

  // Link z pasa nisz zmienia sam hash, więc filtr trzeba odświeżyć ręcznie.
  // (Ustawiamy oba stany na raz i renderujemy jednorazowo — setFilter/setAlbum
  // z osobna wywołałyby dwa nakładające się przejścia siatki.) Tylko na
  // stronie z galerią — bez niej nie ma czego przefiltrowac.
  if (masonryEl) {
    window.addEventListener('hashchange', () => {
      const wanted = readUrl();
      if (wanted.filter === activeFilter && wanted.album === activeAlbum) return;

      activeFilter = wanted.filter;
      activeAlbum = wanted.album;
      gridExpanded = false;
      syncFilterButtons();
      renderSubfilters();

      const tiles = [...masonryEl.children];
      if (reduceMotion || !tiles.length) {
        renderGrid();
        return;
      }
      tiles.forEach((tile) => tile.classList.add('is-out'));
      setTimeout(renderGrid, 180);
    });
  }

  (async function init() {
    let data = { photos: LOCAL_PHOTOS, videos: LOCAL_VIDEOS };
    if (API_BASE) {
      try {
        data = await loadFromApi();
      } catch (error) {
        // Worker nie odpowiada albo panel jest pusty: lecimy na zdjęciach z repo.
        data = { photos: LOCAL_PHOTOS, videos: LOCAL_VIDEOS };
      }
    }

    photos = decorate(data.photos);
    videos = data.videos;
    const wanted = readUrl();
    activeFilter = wanted.filter;
    activeAlbum = wanted.album;

    renderFilters();
    renderSubfilters();
    renderGrid();
    renderReels();
  })();
})();
