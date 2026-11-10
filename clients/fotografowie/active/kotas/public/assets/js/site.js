/* ==========================================================================
   Paulina Kotas Fotografia — skrypt strony publicznej.

   Portfolio i tło hero pochodzą z workera (mechanika portfolio-template,
   bez zmian w API):
     GET /api/folders                → kategorie (zakładki), kolejność z panelu
     GET /api/folders/{id}/content   → albumy kategorii z kafelkami
     GET /api/settings               → hero_desktop / hero_mobile / hero_mode
     GET /api/hero-slides            → slajdy hero (gdy hero_mode = slideshow)
   Gdy worker nie odpowiada albo nie ma jeszcze żadnych zdjęć, strona pokazuje
   zdjęcia z assets/photos/ (LOCAL_PORTFOLIO niżej).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------- konfiguracja */
  const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
  const API_BASE = LOCAL_HOSTS.includes(location.hostname)
    ? 'http://localhost:8787'
    : 'https://portfolio-kotas.project6osss.workers.dev';   // adres workera po `wrangler deploy`

  // Sześć rodzajów sesji z briefu = foldery w panelu. Folder łączy się z sesją
  // po początku nazwy (bez polskich znaków i wielkości liter): pasuje "Kobiece"
  // i "Kobiece sesje", nie pasuje "Sesje kobiece". short = karta, title = galeria.
  const CATEGORIES = [
    { key: 'kobiece',     match: 'kobie',   short: 'Kobieca',     title: 'Fotografia kobieca',        alt: 'Sesja kobieca' },
    { key: 'ciazowe',     match: 'ciaz',    short: 'Ciążowa',     title: 'Fotografia ciążowa',        alt: 'Sesja ciążowa' },
    { key: 'noworodkowe', match: 'noworod', short: 'Noworodkowa', title: 'Fotografia noworodkowa',    alt: 'Sesja noworodkowa' },
    { key: 'rodzinne',    match: 'rodzin',  short: 'Rodzinna',    title: 'Fotografia rodzinna',       alt: 'Sesja rodzinna' },
    { key: 'dzieciece',   match: 'dziec',   short: 'Dziecięca',   title: 'Fotografia dziecięca',      alt: 'Sesja dziecięca' },
    { key: 'reportaze',   match: 'report',  short: 'Reportaże',   title: 'Reportaże z uroczystości',  alt: 'Reportaż z uroczystości' },
  ];

  // Zapas do czasu wdrożenia workera:
  // [kategoria, liczba zdjęć, numery poziomych, wysokość pionowej miniatury, numer okładki karty]
  const LOCAL_SETS = [
    ['kobiece', 12, [], 1067, 1],
    ['ciazowe', 3, [], 1067, 1],
    ['noworodkowe', 7, [], 1067, 2],
    ['rodzinne', 8, [1, 4, 8], 1121, 2],
    ['dzieciece', 4, [3], 1121, 1],
  ];

  const FONT_FALLBACKS = {
    'Work Sans': 'sans-serif', 'Montserrat': 'sans-serif', 'DM Sans': 'sans-serif',
    'Playfair Display': 'serif', 'Cormorant Garamond': 'serif', 'Lora': 'serif',
    'Great Vibes': 'cursive', 'Caveat': 'cursive',
  };

  const DESKTOP_GRID = window.matchMedia('(min-width: 700px)');
  const MOBILE = window.matchMedia('(max-width: 899px)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);

  function normalize(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  }
  function categoryFor(name) {
    const n = normalize(name);
    return CATEGORIES.find((c) => n.startsWith(c.match)) || null;
  }

  async function api(path, timeout = 5000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(API_BASE + path, { signal: ctrl.signal });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'API');
      return body.data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ======================================================= sesje (portfolio) */
  // Karty rodzajów sesji (oferta) + galeria wybranej sesji. Sześć sesji z briefu
  // jest zawsze widocznych; folder z panelu, który nie pasuje do żadnej z nich,
  // dostaje własną kartę na końcu.
  const catsEl = $('cats');
  const bodyEl = $('pfBody');
  const albumsEl = $('pfAlbums');
  const moreBtn = $('pfMore');
  const titleEl = $('catTitle');
  let inkEl = null;

  let categories = [];      // [{ id, key, short, title, alt, cover, albums: [{ name, items }] }]
  let active = null;
  let expanded = false;
  let lightboxList = [];

  function plural(n, one, few, many) {
    if (n === 1) return one;
    const r10 = n % 10, r100 = n % 100;
    return r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14) ? few : many;
  }

  function photoCount(cat) {
    return cat.albums.reduce((sum, a) => sum + a.items.filter((i) => i.type === 'photo').length, 0);
  }

  function emptyCategory(def) {
    return { id: def.key, key: def.key, short: def.short, title: def.title, alt: def.alt, cover: null, albums: [] };
  }

  function localPortfolio() {
    return CATEGORIES.map((def) => {
      const set = LOCAL_SETS.find((entry) => entry[0] === def.key);
      const cat = emptyCategory(def);
      if (!set) return cat;
      const [key, count, landscape, portraitH, coverN] = set;
      const items = [];
      for (let n = 1; n <= count; n++) {
        const num = String(n).padStart(2, '0');
        const wide = landscape.includes(n);
        items.push({
          type: 'photo',
          thumb: `assets/photos/${key}/${num}-800.webp`,
          full: `assets/photos/${key}/${num}-1600.webp`,
          alt: `${def.alt}, zdjęcie ${n}`,
          w: 2, h: wide ? 2 : 3,
          iw: 800, ih: wide ? 571 : portraitH,
        });
      }
      cat.albums = [{ name: '', items }];
      cat.cover = items[(coverN || 1) - 1];
      return cat;
    });
  }

  async function apiPortfolio() {
    const folders = await api('/api/folders');
    const loaded = await Promise.all(folders.map(async (folder) => {
      const albums = await api('/api/folders/' + folder.id + '/content');
      const def = categoryFor(folder.name);
      return {
        id: folder.id,
        key: def ? def.key : folder.id,
        short: def ? def.short : folder.name,
        title: def ? def.title : folder.name,
        alt: def ? def.alt : folder.name,
        cover: null,
        albums: albums.map((album) => ({
          name: album.name,
          items: album.items.map((item) => item.type === 'photo'
            ? {
                type: 'photo', thumb: item.url, full: item.url,
                alt: item.display_name || (def ? def.alt : folder.name),
                w: item.grid_w, h: item.grid_h,
              }
            : { type: 'text', html: item.html, style: item.style || {}, w: item.grid_w, h: item.grid_h }),
        })).filter((album) => album.items.length),
      };
    }));

    // Sześć stałych sesji w stałej kolejności + dodatkowe foldery z panelu.
    const out = CATEGORIES.map((def) => {
      const hit = loaded.find((c) => c.key === def.key && photoCount(c) > 0) || loaded.find((c) => c.key === def.key);
      return hit || emptyCategory(def);
    });
    loaded.forEach((c) => {
      if (!CATEGORIES.some((def) => def.key === c.key) && photoCount(c) > 0) out.push(c);
    });
    out.forEach((c) => {
      if (!c.cover) {
        for (const album of c.albums) {
          const photo = album.items.find((i) => i.type === 'photo');
          if (photo) { c.cover = photo; break; }
        }
      }
    });
    return out;
  }

  async function initPortfolio() {
    let data = null;
    try {
      data = await apiPortfolio();
      if (!data.some((c) => photoCount(c) > 0)) data = null;   // panel jeszcze pusty
    } catch (e) {
      data = null;
    }
    categories = data || localPortfolio();
    renderCats();

    const fromHash = new URLSearchParams(location.hash.slice(1)).get('f');
    const byHash = categories.find((c) => c.id === fromHash);
    const start = byHash || categories.find((c) => photoCount(c) > 0) || categories[0];
    if (start) select(start.id, false);
    if (byHash) $('sesje').scrollIntoView({ behavior: 'auto' });
  }

  function renderCats() {
    catsEl.innerHTML = '';
    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', 'catPanel');
      btn.dataset.id = cat.id;
      btn.id = 'tab-' + cat.key;
      btn.append(document.createTextNode(cat.short));
      btn.addEventListener('click', () => select(cat.id, true));
      catsEl.append(btn);
    });
    inkEl = document.createElement('span');
    inkEl.className = 'cats__ink';
    inkEl.setAttribute('aria-hidden', 'true');
    catsEl.append(inkEl);
  }

  // Zielona kreska jedzie pod wybraną zakładkę; na telefonie pasek sam
  // przewija się tak, żeby wybrana zakładka była widoczna.
  function moveInk(animate) {
    const btn = catsEl.querySelector('.cat[aria-selected="true"]');
    if (!btn || !inkEl) return;
    if (!animate) inkEl.style.transition = 'none';
    inkEl.style.width = btn.offsetWidth + 'px';
    inkEl.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    if (!animate) { void inkEl.offsetWidth; inkEl.style.transition = ''; }
    if (catsEl.scrollWidth > catsEl.clientWidth) {
      const target = btn.offsetLeft - (catsEl.clientWidth - btn.offsetWidth) / 2;
      catsEl.scrollTo({ left: Math.max(0, target), behavior: animate && !reduceMotion ? 'smooth' : 'auto' });
    }
  }

  function select(id, userAction) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    active = cat;
    expanded = false;
    catsEl.querySelectorAll('.cat').forEach((btn) => {
      const on = btn.dataset.id === id;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on) $('catPanel').setAttribute('aria-labelledby', btn.id);
    });
    titleEl.textContent = cat.title;
    moveInk(userAction);

    if (userAction && /^[0-9a-f-]{20,}$/i.test(id)) {
      history.replaceState(null, '', location.pathname + location.search + '#f=' + id);
    }
    renderCategory();
  }

  // Klawiatura w zakładkach: strzałki, Home, End (wzorzec ARIA tabs).
  catsEl.addEventListener('keydown', (e) => {
    const tabs = Array.from(catsEl.querySelectorAll('.cat'));
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    select(tabs[n].dataset.id, true);
    tabs[n].focus();
  });

  // Fonty zmieniają szerokość zakładek po wczytaniu: przelicz kreskę.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveInk(false));
  window.addEventListener('resize', () => moveInk(false));

  // "Zobacz zdjęcia" w cenniku: otwórz zakładkę i przewiń do galerii.
  document.querySelectorAll('[data-open-cat]').forEach((link) => {
    link.addEventListener('click', () => {
      const cat = categories.find((c) => c.key === link.dataset.openCat);
      if (!cat) return;
      select(cat.id, true);
      $('sesje').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  function renderCategory() {
    albumsEl.innerHTML = '';
    lightboxList = [];

    if (!active || !photoCount(active)) {
      // Brak zdjęć (np. reportaże przed pierwszym uploadem): kreskowane pola bez tekstu.
      const empty = document.createElement('div');
      empty.className = 'pf-empty';
      empty.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) {
        const ph = document.createElement('div');
        ph.className = 'placeholder';
        empty.append(ph);
      }
      albumsEl.append(empty);
      bodyEl.style.height = '';
      moreBtn.hidden = true;
      return;
    }

    let order = 0;
    active.albums.forEach((album) => {
      const section = document.createElement('div');
      section.className = 'pf-album';
      if (album.name) {
        const h = document.createElement('h4');
        h.textContent = album.name;
        section.append(h);
      }
      const wrap = document.createElement('div');
      wrap.className = 'grid-wrap';
      const grid = document.createElement('div');
      grid.className = 'grid';

      const tiles = album.items.map((item) => {
        const tile = item.type === 'photo' ? buildPhoto(item) : buildText(item);
        tile.dataset.order = order++;
        grid.append(tile);
        return tile;
      });
      grid._entries = album.items;
      grid._tiles = tiles;

      wrap.append(grid);
      section.append(wrap);
      albumsEl.append(section);
    });

    packAll();
    applyCollapse(false);

  }

  function buildPhoto(item) {
    const index = lightboxList.length;
    lightboxList.push(item);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile tile--photo';
    btn.setAttribute('aria-label', 'Powiększ: ' + item.alt);
    const img = document.createElement('img');
    img.src = item.thumb;
    img.alt = item.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (item.iw) { img.width = item.iw; img.height = item.ih; }
    btn.append(img);
    btn.addEventListener('click', () => openLightbox(index));
    return btn;
  }

  function buildText(item) {
    const block = document.createElement('div');
    block.className = 'tile tile--text';
    const { font, size, align, color, bg } = item.style;
    if (bg) block.style.backgroundColor = bg;
    const frame = document.createElement('div');
    frame.className = 'text-frame';
    const body = document.createElement('div');
    body.className = 'text-body';
    body.style.setProperty('--fs', size || 18);
    if (font) body.style.fontFamily = `'${font}', ${FONT_FALLBACKS[font] || 'sans-serif'}`;
    if (align) body.style.textAlign = align;
    if (color) body.style.color = color;
    // HTML czyści worker przy zapisie (tylko b/i/u/br/div/p, bez atrybutów).
    body.innerHTML = item.html || '';
    frame.append(body);
    block.append(frame);
    return block;
  }

  /* Skyline packing (PLAYBOOK pkt 3): każdy kafel trafia do kolumny, w której
     zaczyna się najwyżej. grid_w/grid_h z panelu są respektowane; na telefonie
     przeliczone na 2 kolumny z zachowaniem proporcji kafla. */
  function packTiles(entries, tiles) {
    const desktop = DESKTOP_GRID.matches;
    const columns = desktop ? 6 : 2;
    const heights = new Array(columns).fill(0);

    entries.forEach((entry, i) => {
      const gw = entry.w || 2;
      const gh = entry.h || 2;
      let w, h;
      if (desktop) {
        w = Math.min(gw, columns); h = gh;
      } else if (entry.type === 'text') {
        w = 2; h = Math.max(1, Math.min(gh, 2));
      } else {
        const ratio = gw / (gh * 0.75);          // proporcje kafla z panelu
        w = gw >= 4 || ratio > 1.15 ? 2 : 1;
        h = Math.max(1, Math.min(4, Math.round(w * gh / gw)));
      }

      let bestCol = 0;
      let bestTop = Infinity;
      for (let col = 0; col <= columns - w; col++) {
        let top = 0;
        for (let c = col; c < col + w; c++) top = Math.max(top, heights[c]);
        if (top < bestTop) { bestTop = top; bestCol = col; }
      }
      // Domknięcie samotnej jednokolumnowej reszty obok kafla (tylko siatka 6-kolumnowa).
      let finalW = w;
      if (
        columns > 2
        && bestCol + finalW < columns
        && heights[bestCol + finalW] <= bestTop
        && (bestCol + finalW + 1 >= columns || heights[bestCol + finalW + 1] > bestTop)
      ) finalW += 1;

      for (let c = bestCol; c < bestCol + finalW; c++) heights[c] = bestTop + h;
      tiles[i].style.gridColumn = (bestCol + 1) + ' / span ' + finalW;
      tiles[i].style.gridRow = (bestTop + 1) + ' / span ' + h;
    });
  }

  function packAll() {
    albumsEl.querySelectorAll('.grid').forEach((grid) => packTiles(grid._entries, grid._tiles));
  }

  /* "Pokaż wszystkie": w DOM jest zawsze cała kategoria, zwijamy tylko wysokość
     (PLAYBOOK pkt 3), mierzoną od dołu N-tego kafla. */
  function collapsedHeight() {
    const limit = DESKTOP_GRID.matches ? 9 : 6;
    const tiles = Array.from(albumsEl.querySelectorAll('.tile'));
    if (tiles.length <= limit + 2) return null;
    // offsetTop (względem .pf-body, position: relative) nie uwzględnia
    // transformu z animacji wejścia kafli, getBoundingClientRect by uwzględnił.
    const bottom = tiles
      .map((t) => ({ top: t.offsetTop, bottom: t.offsetTop + t.offsetHeight }))
      .sort((a, b) => a.top - b.top)
      .slice(0, limit)
      .reduce((max, r) => Math.max(max, r.bottom), 0);
    return Math.ceil(bottom);
  }

  function applyCollapse(animate) {
    const h = collapsedHeight();
    if (h === null) {
      bodyEl.style.height = '';
      moreBtn.hidden = true;
      return;
    }
    moreBtn.hidden = false;
    const total = active ? photoCount(active) : 0;
    if (expanded) {
      moreBtn.textContent = 'Zwiń';
      animateHeight(bodyEl.scrollHeight, animate, true);
    } else {
      moreBtn.textContent = `Pokaż wszystkie (${total})`;
      animateHeight(h, animate, false);
    }
  }

  function animateHeight(target, animate, toAuto) {
    if (!animate || reduceMotion) {
      bodyEl.style.height = toAuto ? '' : target + 'px';
      return;
    }
    bodyEl.style.height = bodyEl.getBoundingClientRect().height + 'px';
    void bodyEl.offsetHeight;
    bodyEl.style.height = target + 'px';
    if (toAuto) {
      const done = (e) => {
        if (e.propertyName !== 'height') return;
        bodyEl.removeEventListener('transitionend', done);
        if (expanded) bodyEl.style.height = '';
      };
      bodyEl.addEventListener('transitionend', done);
    }
  }

  moreBtn.addEventListener('click', () => {
    expanded = !expanded;
    applyCollapse(true);
    if (!expanded) $('catPanel').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  DESKTOP_GRID.addEventListener('change', () => { packAll(); applyCollapse(false); });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!expanded) applyCollapse(false); }, 150);
  });

  /* ================================================== opinie: karuzela 3 × 1 */
  (function reviewsCarousel() {
    const track = $('rvTrack');
    const prev = $('rvPrev');
    const next = $('rvNext');
    const count = $('rvCount');
    if (!track || !prev || !next) return;
    const cards = Array.from(track.children);

    function perView() {
      const first = cards[0];
      return first ? Math.max(1, Math.round(track.clientWidth / first.getBoundingClientRect().width)) : 1;
    }
    function index() {
      const w = cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
      return Math.round(track.scrollLeft / w);
    }
    function update() {
      const i = index();
      const pv = perView();
      const last = Math.min(cards.length, i + pv);
      count.textContent = (pv > 1 ? (i + 1) + '–' + last : String(i + 1)) + ' / ' + cards.length;
    }
    // Zapętlone: za ostatnią opinią wraca na początek i odwrotnie.
    function go(dir) {
      const pv = perView();
      const maxStart = cards.length - pv;
      let i = index() + dir * pv;
      if (dir > 0 && index() >= maxStart) i = 0;
      else if (dir < 0 && index() <= 0) i = maxStart;
      i = Math.max(0, Math.min(maxStart, i));
      track.scrollTo({ left: cards[i].offsetLeft - cards[0].offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    let t = null;
    track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 60); }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ============================================================= lightbox */
  // Podgląd zdjęcia z zoomem: klik/dotknięcie zdjęcia przybliża w tym miejscu,
  // ruch myszy albo palca przesuwa kadr, kolejny klik oddala. Kółko myszy
  // i przycisk z lupą też przybliżają.
  const lb = $('lightbox');
  const lbStage = $('lbStage');
  const lbImg = document.createElement('img');
  lbImg.alt = '';
  lbImg.draggable = false;
  lbStage.append(lbImg);
  const lbCounter = $('lbCounter');
  const lbZoomBtn = $('lbZoom');
  const ZOOM = 2.5;
  let lbIndex = 0;
  let lastFocus = null;
  let zoomed = false;

  function originFromPoint(clientX, clientY) {
    const r = lbStage.getBoundingClientRect();   // ramka ma rozmiar zdjęcia bez skali
    const x = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100));
    lbImg.style.transformOrigin = x + '% ' + y + '%';
  }
  function setZoom(on, clientX, clientY) {
    zoomed = on;
    lb.classList.toggle('is-zoomed', on);
    lbZoomBtn.setAttribute('aria-pressed', String(on));
    lbZoomBtn.setAttribute('aria-label', on ? 'Oddal zdjęcie' : 'Przybliż zdjęcie');
    if (on && clientX != null) originFromPoint(clientX, clientY);
    else if (on) lbImg.style.transformOrigin = '50% 50%';
    lbImg.style.transform = on ? 'scale(' + ZOOM + ')' : '';
  }

  function setBackgroundInert(on) {
    document.querySelectorAll('body > header, body > main, body > footer, body > .skip').forEach((el) => {
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }

  function renderLightbox() {
    const item = lightboxList[lbIndex];
    if (!item) return;
    setZoom(false);
    lbImg.src = item.full;
    lbImg.alt = item.alt;
    lbCounter.textContent = (lbIndex + 1) + ' / ' + lightboxList.length;
    const single = lightboxList.length < 2;
    $('lbPrev').hidden = single;
    $('lbNext').hidden = single;
    // Następne zdjęcie w tle, żeby strzałka nie czekała na sieć.
    const next = lightboxList[(lbIndex + 1) % lightboxList.length];
    if (next) { const pre = new Image(); pre.src = next.full; }
  }
  function openLightbox(index) {
    lbIndex = index;
    lastFocus = document.activeElement;
    renderLightbox();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    setBackgroundInert(true);
    $('lbClose').focus();
  }
  function closeLightbox() {
    setZoom(false);
    lb.hidden = true;
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
    setBackgroundInert(false);
    if (lastFocus) lastFocus.focus();
  }
  function step(dir) {
    const n = lightboxList.length;
    lbIndex = (lbIndex + dir + n) % n;
    renderLightbox();
  }
  $('lbClose').addEventListener('click', closeLightbox);
  $('lbPrev').addEventListener('click', () => step(-1));
  $('lbNext').addEventListener('click', () => step(1));
  lbZoomBtn.addEventListener('click', () => setZoom(!zoomed));
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.classList.contains('lightbox__fig')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  // Mysz: klik przybliża/oddala, ruch przesuwa przybliżony kadr, kółko przybliża/oddala.
  let touchMoved = false;
  lbImg.addEventListener('click', (e) => {
    e.stopPropagation();
    if (touchMoved) { touchMoved = false; return; }
    setZoom(!zoomed, e.clientX, e.clientY);
  });
  lbStage.addEventListener('mousemove', (e) => { if (zoomed) originFromPoint(e.clientX, e.clientY); });
  lbStage.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0 && !zoomed) setZoom(true, e.clientX, e.clientY);
    if (e.deltaY > 0 && zoomed) setZoom(false);
  }, { passive: false });

  // Dotyk: przybliżone zdjęcie przesuwa się palcem; nieprzybliżone przesuwa
  // się w bok do następnego/poprzedniego zdjęcia.
  let touchX = 0;
  lb.addEventListener('touchstart', (e) => {
    touchX = e.changedTouches[0].clientX;
    touchMoved = false;
  }, { passive: true });
  lbStage.addEventListener('touchmove', (e) => {
    if (!zoomed) return;
    e.preventDefault();
    touchMoved = true;
    const t = e.changedTouches[0];
    originFromPoint(t.clientX, t.clientY);
  }, { passive: false });
  lb.addEventListener('touchend', (e) => {
    if (zoomed) return;
    const d = e.changedTouches[0].clientX - touchX;
    if (Math.abs(d) > 50) { touchMoved = true; step(d < 0 ? 1 : -1); }
  }, { passive: true });

  /* ========================================================== tło hero */
  async function initHero() {
    let settings;
    try { settings = await api('/api/settings', 4000); } catch (e) { return; }
    const media = $('heroMedia');
    const img = $('heroImg');
    const mobile = MOBILE.matches;

    if (settings.hero_mode === 'slideshow') {
      let slides = [];
      try { slides = await api('/api/hero-slides', 4000); } catch (e) { return; }
      const portrait = slides.filter((s) => s.isPortrait);
      const list = (mobile && portrait.length ? portrait : slides).map((s) => s.url);
      if (!list.length) return;
      const els = list.map((url, i) => {
        const el = document.createElement('img');
        el.className = 'hero__slide' + (i === 0 ? ' is-on' : '');
        el.src = url;
        el.alt = '';
        if (i > 0) el.loading = 'lazy';
        media.append(el);
        return el;
      });
      img.hidden = true;
      if (els.length > 1 && !reduceMotion) {
        let i = 0;
        setInterval(() => {
          els[i].classList.remove('is-on');
          i = (i + 1) % els.length;
          els[i].classList.add('is-on');
        }, 5000);
      }
      return;
    }

    const url = (mobile && settings.hero_mobile) || settings.hero_desktop || settings.hero_mobile;
    if (url) {
      img.removeAttribute('srcset');
      img.src = url;
    }
  }

  /* ========================================================= scroll-spy */
  (function scrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    const links = {};
    document.querySelectorAll('.navlink[data-nav]').forEach((a) => { links[a.dataset.nav] = a; });
    const nav = document.querySelector('.nav');
    let current = null;
    function centerInNav(link) {
      if (!nav || nav.scrollWidth <= nav.clientWidth) return;
      const n = nav.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      nav.scrollBy({ left: (l.left + l.width / 2) - (n.left + n.width / 2), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (current) current.classList.remove('active');
        current = links[entry.target.id] || null;
        if (current) { current.classList.add('active'); centerInNav(current); }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    Object.keys(links).forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    // Nad sekcją "O mnie" (hero) nic nie jest podświetlone.
    const hero = document.querySelector('.hero');
    if (hero) {
      new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        if (current) { current.classList.remove('active'); current = null; }
        if (nav && nav.scrollLeft > 0) nav.scrollTo({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
    }
  })();

  /* ============================================================== "dziś" */
  (function today() {
    const idx = (new Date().getDay() + 6) % 7;
    const row = document.querySelector('tr[data-day="' + idx + '"]');
    if (!row) return;
    row.classList.add('today');
    const th = row.querySelector('th');
    if (th) {
      const badge = document.createElement('span');
      badge.className = 'today-badge';
      badge.textContent = 'dziś';
      th.append(badge);
    }
  })();

  initPortfolio();
  initHero();
})();
