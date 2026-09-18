/* ============================================================================
   site.js — zachowania samej strony: nawigacja, licznik liczb, formularz.
   Galeria siedzi w gallery.js, widget w widget.js.
   ========================================================================== */

/* Wlasny zakres: site.js, gallery.js i widget.js to zwykle skrypty i bez
   tego dzielilyby jedna globalna przestrzen nazw. */
(function () {
  'use strict';

  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Jak w gallery.js/admin: lokalnie serwer statyczny (4325) i `wrangler dev`
  // (8787) to dwa różne porty, więc trzeba jawnie wskazać workera.
  const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : 'https://portfolio-suszka.project6osss.workers.dev';

  /* --------------------------------------------------------- ekran powitalny --- */

  const heroMore = document.getElementById('heroMore');
  if (heroMore) {
    heroMore.addEventListener('click', () => {
      const target = document.getElementById('o-mnie');
      if (target) target.scrollIntoView({ behavior: prefersReduce ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // Tlo hero z panelu (Ustawienia strony -> zdjecie na telefon/komputer).
  // Zaszyte w HTML zdjecia sa domyslne i zostaja, jesli API jeszcze nie
  // istnieje (backend niewdrozony) albo Magda niczego nie podmienila.
  const heroImg = document.getElementById('heroImg');
  const heroMediaEl = document.querySelector('.hero__media');
  if (heroImg) {
    const heroSourceDesktop = document.getElementById('heroSourceDesktop');
    fetch(API_BASE + '/api/settings')
      .then((response) => response.json())
      .then(async (body) => {
        if (!body.ok) return;
        if (body.data.hero_desktop && heroSourceDesktop) heroSourceDesktop.srcset = body.data.hero_desktop;
        if (body.data.hero_mobile) heroImg.src = body.data.hero_mobile;
        // Zdjecie tla jest -> CSS pokazuje <img> i daje tekstowi wlasny kafel
        // (bez mgly na calym zdjeciu, patrz .hero--photo w style.css).
        if (body.data.hero_desktop || body.data.hero_mobile) heroImg.closest('.hero').classList.add('hero--photo');

        // Slideshow (opcja z panelu, patrz worker/hero.js) — zdjecie statyczne
        // wyzej zostaje jako natychmiast widoczna "plansza", dopoki slajdy
        // sie nie doczytaja; jak sie nie doczytaja (API padnie), zostaje ono
        // na stale, bez zadnej roznicy widocznej dla odwiedzajacego.
        if (body.data.hero_mode === 'slideshow' && heroMediaEl) {
          try {
            const slidesRes = await fetch(API_BASE + '/api/hero-slides');
            const slidesBody = await slidesRes.json();
            if (slidesBody.ok && slidesBody.data.length) {
              heroMediaEl.closest('.hero').classList.add('hero--photo');
              startHeroSlideshow(slidesBody.data, heroMediaEl);
            }
          } catch (error) { /* zostaje zdjecie statyczne */ }
        }
      })
      .catch(() => {}); // brak API albo pusta baza — zostaja domyslne zdjecia
  }

  /**
   * Krzyzowe przenikanie miedzy zdjeciami z wybranego albumu, 5 s na slajd.
   * Pionowe zdjecia ("z telefonu") ida na telefon, poziome ("z aparatu/kompa")
   * na komputer — zeby zadne nie bylo rozciagniete/przycinane w zly sposob.
   * Jesli w wybranej orientacji nie ma zadnego zdjecia (Magda wgral tylko
   * jeden typ), lecimy na tym, co jest — uczciwie widac cos, zamiast nic.
   */
  function startHeroSlideshow(slides, mediaEl) {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const matching = slides.filter((slide) => slide.isPortrait === isMobile);
    const list = matching.length ? matching : slides;

    const container = document.createElement('div');
    container.className = 'hero__slides';
    list.forEach((slide, index) => {
      const img = document.createElement('img');
      img.className = 'hero__slide' + (index === 0 ? ' is-active' : '');
      img.src = slide.url;
      img.alt = '';
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      container.append(img);
    });
    mediaEl.append(container);

    if (list.length < 2 || prefersReduce) return;

    const frames = [...container.children];
    let index = 0;
    setInterval(() => {
      frames[index].classList.remove('is-active');
      index = (index + 1) % frames.length;
      frames[index].classList.add('is-active');
    }, 5000);
  }

  /* ------------------------------------------------------------ nawigacja --- */

  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const panel = document.getElementById('navpanel');
  const navClose = document.getElementById('navClose');

  // Tło nawigacji wjeżdża dopiero po wyjściu z pierwszej sekcji strony
  // (hero na stronie głównej, krótki nagłówek z tytułem na podstronach).
  // Wczesniej byl tu staly prog "80% wysokosci ekranu" dobrany pod
  // pelnoekranowe hero strony glownej — na podstronach (portfolio, cennik,
  // kontakt), gdzie naglowek jest dużo krotszy niz viewport, powodowalo to,
  // ze nav wjezdzal na tresc (zdjecia w galerii) zanim zdazyl przestac byc
  // przezroczysty. IntersectionObserver na pierwszej sekcji strony dziala
  // poprawnie niezaleznie od jej wysokosci — bez zgadywania.
  // .hero (strona glowna) to caly peloekranowy blok — ma zostac przezroczyste
  // na CALYM hero. .section-head (podstrony) to tylko krotki naglowek z
  // tytulem, NIE cala sekcja (ta zawiera tez galerie/formularz/cennik i
  // jest wysoka na cala strone — obserwowanie jej dawalo isIntersecting=true
  // przez caly scroll, wiec nav nigdy sie nie podnosil).
  // Podstrony (bez .hero): nav dostaje tlo i blur od pierwszego piksela
  // scrolla — inaczej tytul sekcji przebijal przez przezroczysty pasek,
  // zanim schowal sie za nim w calosci (zgloszone z telefonu, 2026-09-18).
  const firstSection = document.querySelector('.hero');
  if (!firstSection) {
    const onScrollSub = () => nav.classList.toggle('is-lifted', window.scrollY > 4);
    window.addEventListener('scroll', onScrollSub, { passive: true });
    onScrollSub();
  } else if ('IntersectionObserver' in window) {
    // Ujemny gorny rootMargin o wysokosc navu: "nie przecina" liczy sie
    // dopiero, gdy sekcja schowa sie CALA za pasek nawigacji — czyli
    // dokladnie w momencie, gdy nav zaczalby lezec na kolejnej tresci.
    const navObserver = new IntersectionObserver(
      ([entry]) => nav.classList.toggle('is-lifted', !entry.isIntersecting),
      { rootMargin: `-${nav.offsetHeight}px 0px 0px 0px` },
    );
    navObserver.observe(firstSection);
  } else {
    let lifted = false;
    const onScroll = () => {
      const shouldLift = window.scrollY > window.innerHeight * 0.8;
      if (shouldLift === lifted) return;
      lifted = shouldLift;
      nav.classList.toggle('is-lifted', lifted);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  let panelOpener = null;

  function openPanel() {
    panelOpener = document.activeElement;
    panel.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onPanelKey);
    navClose.focus();
  }

  function closePanel() {
    panel.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onPanelKey);
    if (panelOpener) panelOpener.focus();
  }

  function onPanelKey(event) {
    if (event.key === 'Escape') { closePanel(); return; }
    if (event.key !== 'Tab') return;

    const focusable = [...panel.querySelectorAll('a, button')];
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

  burger.addEventListener('click', openPanel);
  navClose.addEventListener('click', closePanel);
  // Klik w tło panelu (czyli poza linki i przycisk zamknięcia) też zamyka.
  panel.addEventListener('click', (event) => {
    if (event.target === panel) closePanel();
  });
  panel.querySelectorAll('a').forEach((link) => link.addEventListener('click', closePanel));

  /* --------------------------------------------------------- licznik liczb ---
     Dwa niezalezne bloki licza w gore: statystyki Instagrama pod hero i "3
     lata / 3 dni / 5,0" w Warsztacie. Kazdy startuje osobno, kiedy WLASNY
     blok wjedzie w widok — stad observer.unobserve(entry.target), nie
     observer.disconnect() (ktore zatrzymywaloby WSZYSTKIE liczniki po
     pierwszym trafieniu, nawet te jeszcze niewidoczne). */

  function runCounters(container) {
    container.querySelectorAll('[data-count]').forEach((node, index) => {
      const target = Number(node.dataset.count);
      const suffix = node.dataset.suffix || '';
      const duration = 1600;
      // Male przesuniecie startu miedzy liczbami w tym samym bloku (np. 213
      // i 740 tys. pod hero) — zero i tak samo nie wygladaja jak jeden
      // mechaniczny tik, tylko jak dwie niezalezne, "naturalne" animacje.
      const start = performance.now() + index * 120;

      function frame(now) {
        // Quint (bylo) wyplaszcza sie tak szybko, ze liczba wizualnie
        // "zamiera" na dlugo przed koncem czasu animacji — cubic dojezdza
        // do celu rowniej, az do samej ostatniej klatki.
        const progress = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  const counterBlocks = [document.getElementById('stats'), document.getElementById('igProof')]
    .filter(Boolean);

  if (counterBlocks.length && !prefersReduce && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        runCounters(entry.target);
      });
    }, { threshold: 0.4 });
    counterBlocks.forEach((block) => observer.observe(block));
  }
  // Bez obserwatora albo z wyłączonym ruchem liczby po prostu stoją w HTML-u.

  /* -------------------------------------------------------- odslanianie ---
     Warsztat: zdjecie i kolumna tekstu delikatnie wjezdzaja przy scrollu.
     Element, ktory jest widoczny JUZ przy starcie strony, nigdy nie jest
     chowany (zero ryzyka mrugniecia na duzych ekranach). */
  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  if (revealEls.length && !prefersReduce && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealObserver.unobserve(entry.target);
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('is-revealed');
      });
    }, { threshold: 0.2 });

    revealEls.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) return; // już widoczny
      element.classList.add('reveal-pending');
      // Opóźnienie jest jawne per element (data-reveal-delay), nie liczone
      // z pozycji w dokumencie — inaczej odsłonięcia w dalszych sekcjach
      // dziedziczyłyby coraz większe opóźnienie po tych z góry strony.
      if (element.dataset.revealDelay) element.style.transitionDelay = element.dataset.revealDelay + 'ms';
      revealObserver.observe(element);
    });
  }

  /* ------------------------------------------------------------ formularz --- */

  const form = document.getElementById('contactForm');
  const done = document.getElementById('formDone');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  function setError(id, message) {
    const field = document.getElementById(id);
    const slot = document.getElementById(id + 'Error');
    slot.textContent = message;
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  function validate() {
    const name = form.imie.value.trim();
    const contact = form.kontakt.value.trim();
    const digits = contact.replace(/\D/g, '');

    const nameOk = setError('imie', name ? '' : 'Proszę podać imię, żebym wiedziała, jak się zwracać.');
    const contactOk = setError('kontakt',
      EMAIL_RE.test(contact) || digits.length >= 9
        ? ''
        : 'Proszę zostawić numer telefonu albo e-mail, żebym mogła odpowiedzieć.');

    return nameOk && contactOk;
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!validate()) {
        const firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      const button = form.querySelector('button[type="submit"]');

      // Dopoki w action nie ma prawdziwego e-maila Magdy (brief.md go nie
      // podaje), formsubmit.co i tak by nic nie dostarczyl — lepiej uczciwie
      // odeslac do telefonu niz pokazac "Dziekuje" i zgubic wiadomosc.
      if (form.action.includes('UZUPELNIJ_EMAIL')) {
        setError('kontakt', 'Formularz jeszcze nie działa. Proszę zadzwonić: 697 035 198.');
        return;
      }

      button.disabled = true;
      button.textContent = 'Wysyłam...';

      try {
        await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
      } catch (error) {
        // formsubmit.co potrafi odpowiedzieć przekierowaniem; wiadomość i tak
        // wychodzi, więc nie straszymy błędem kogoś, kto właśnie napisał.
      }

      form.hidden = true;
      done.hidden = false;
      done.setAttribute('tabindex', '-1');
      done.focus();
    });

    // Po pierwszej nieudanej próbie błąd znika w trakcie poprawiania.
    ['imie', 'kontakt'].forEach((id) => {
      form[id].addEventListener('input', () => {
        if (form[id].getAttribute('aria-invalid') === 'true') validate();
      });
    });
  }

  /* ---------------------------------------------------- przelacznik cennika --- */

  const priceSwitch = document.querySelectorAll('.pricing-switch__btn');
  const pricingWrap = document.querySelector('.pricing-panels');
  const pricingPanels = [...document.querySelectorAll('[data-pricing-panel]')];

  if (priceSwitch.length && pricingPanels.length) {
    priceSwitch.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-selected') === 'true') return;
        priceSwitch.forEach((b) => b.setAttribute('aria-selected', String(b === button)));

        const current = pricingPanels.find((p) => !p.hidden);
        const next = pricingPanels.find((p) => p.dataset.pricingPanel === button.dataset.pricing);
        if (!next || next === current) return;

        if (prefersReduce || !pricingWrap) {
          pricingPanels.forEach((p) => { p.hidden = p !== next; });
          return;
        }

        // Blokujemy obecna wysokosc wrappera, zamiast pozwolic mu skoczyc
        // od razu do wysokosci nowej tresci — inaczej reszta strony
        // przeskakuje pod kursorem w momencie klikniecia.
        pricingWrap.style.height = pricingWrap.offsetHeight + 'px';
        void pricingWrap.offsetHeight; // wymuszony reflow

        if (current) current.classList.add('is-leaving');

        window.setTimeout(() => {
          pricingPanels.forEach((p) => { p.hidden = p !== next; });
          if (current) current.classList.remove('is-leaving');
          next.classList.add('is-entering');

          const targetHeight = next.scrollHeight;
          pricingWrap.style.height = targetHeight + 'px';

          requestAnimationFrame(() => next.classList.remove('is-entering'));

          pricingWrap.addEventListener('transitionend', function onEnd(event) {
            if (event.propertyName !== 'height') return;
            pricingWrap.style.height = ''; // wraca do auto, zeby resize okna dzialal normalnie
            pricingWrap.removeEventListener('transitionend', onEnd);
          });
        }, 180);
      });
    });
  }

  /* --------------------------------------------------------- "zaufali mi" ---
     Domyslnie w HTML siedza placeholdery ("Nazwa firmy", puste kolka) — jesli
     Magda doda cokolwiek w panelu (Zaufali mi), wstawiamy wpisy i odslaniamy
     sekcje. Jesli API nie odpowie albo lista jest pusta, sekcja zostaje
     ukryta (u Magdy nie ma placeholderow firm). */
  const trustedList = document.getElementById('trusted');
  if (trustedList) {
    fetch(API_BASE + '/api/trusted')
      .then((response) => response.json())
      .then((body) => {
        if (!body.ok || !body.data.length) return;
        trustedList.innerHTML = '';
        const trustedSection = trustedList.closest('section');
        if (trustedSection) trustedSection.hidden = false;
        body.data.forEach((entry) => {
          const item = document.createElement('a');
          item.className = 'trusted__item';
          if (entry.link) {
            item.href = entry.link;
            item.target = '_blank';
            item.rel = 'noopener';
          } else {
            // Bez linku pozostaje jako karta bez celu — sam avatar/nazwa,
            // klikniecie nigdzie nie prowadzi (lepsze niz martwy href="#").
            item.href = 'javascript:void(0)';
            item.addEventListener('click', (event) => event.preventDefault());
          }

          const avatar = document.createElement('span');
          avatar.className = 'trusted__avatar';
          avatar.setAttribute('aria-hidden', 'true');
          if (entry.url) {
            avatar.style.backgroundImage = 'url(' + JSON.stringify(entry.url) + ')';
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
          }

          const name = document.createElement('span');
          name.className = 'trusted__name';
          name.textContent = entry.name || 'Klient';

          item.append(avatar, name);
          trustedList.append(item);
        });
      })
      .catch(() => {}); // brak API — sekcja zostaje ukryta

    // Strzalki (tylko telefon, patrz CSS .trusted__nav) przewijaja o "jedna
    // karte plus odstep" zamiast pelnej infinite-loop karuzeli jak w opiniach
    // — to pasek logotypow, nie glowna tresc, wiec prostszy mechanizm wystarcza.
    const trustedPrev = document.getElementById('trustedPrev');
    const trustedNext = document.getElementById('trustedNext');
    if (trustedPrev && trustedNext) {
      const scrollTrusted = (direction) => {
        const item = trustedList.querySelector('.trusted__item');
        const gap = parseFloat(getComputedStyle(trustedList).gap) || 32;
        const distance = item ? item.getBoundingClientRect().width + gap : 200;
        trustedList.scrollBy({ left: direction * distance, behavior: prefersReduce ? 'auto' : 'smooth' });
      };
      trustedPrev.addEventListener('click', () => scrollTrusted(-1));
      trustedNext.addEventListener('click', () => scrollTrusted(1));
    }
  }

  /* ------------------------------------------------------ godziny: "dzis" ---
     SNIPPETS.md #3. Wiersze maja data-day z poniedzialkiem = 0. */
  const todayRow = document.querySelector('.hours tr[data-day="' + ((new Date().getDay() + 6) % 7) + '"]');
  if (todayRow) {
    todayRow.classList.add('today');
    const badge = document.createElement('span');
    badge.className = 'today-badge';
    badge.textContent = 'dziś';
    todayRow.querySelector('th').append(badge);
  }

  /* ------------------------------------------------------------ scroll-spy ---
     Na stronie glownej jedyna sekcja z nawigacji to "O mnie" — podswietla sie
     (ta sama kreska co aria-current na podstronach), gdy jest na ekranie. */
  const aboutSection = document.getElementById('o-mnie');
  const aboutLinks = document.querySelectorAll('.nav__links a[href="#o-mnie"], .navpanel a[href="#o-mnie"]');
  if (aboutSection && aboutLinks.length && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        aboutLinks.forEach((link) => {
          if (entry.isIntersecting) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px' }).observe(aboutSection);
  }

  /* ------------------------------------------------------- karuzela opinii ---
     Petla bez konca: doklejamy klon ostatniej opinii przed pierwsza i klon
     pierwszej po ostatniej. "Nastepna" z trzeciej plynnie wraca do pierwszej
     (i odwrotnie) — kiedy scroll osiada na klonie, po cichu (bez animacji)
     przeskakujemy na prawdziwy odpowiednik, wiec widz nigdy nie widzi szwu. */

  const track = document.getElementById('reviewsTrack');

  if (track) {
    const realSlides = [...track.children];
    const dots = [...document.querySelectorAll('.reviews__dot')];
    const prevBtn = document.getElementById('reviewPrev');
    const nextBtn = document.getElementById('reviewNext');

    const firstClone = realSlides[0].cloneNode(true);
    const lastClone = realSlides[realSlides.length - 1].cloneNode(true);
    firstClone.setAttribute('aria-hidden', 'true');
    lastClone.setAttribute('aria-hidden', 'true');
    track.insertBefore(lastClone, realSlides[0]);
    track.append(firstClone);

    const slides = [...track.children]; // [klonOstatniej, s1, s2, s3, klonPierwszej]
    let index = 1; // realny start: pierwsza opinia

    function jumpTo(target, smooth) {
      if (smooth) {
        track.scrollTo({ left: slides[target].offsetLeft, behavior: prefersReduce ? 'auto' : 'smooth' });
        return;
      }
      // Ciche przestawienie: na chwile wylaczamy scroll-snap, zeby skok
      // nie walczyl z przegladarka probujaca "domknac" animacje do siatki.
      track.style.scrollSnapType = 'none';
      track.scrollLeft = slides[target].offsetLeft;
      void track.offsetHeight; // wymuszony reflow przed przywroceniem snap
      track.style.scrollSnapType = '';
    }

    function setActiveDot(i) {
      const real = (i - 1 + realSlides.length) % realSlides.length;
      dots.forEach((dot, di) => dot.setAttribute('aria-pressed', String(di === real)));
    }

    jumpTo(index, false);
    setActiveDot(index);

    // Debounce zamiast IntersectionObserver: musimy wiedziec, kiedy scroll
    // NAPRAWDE sie zatrzymal (nie tylko ktory slajd jest chwilowo widoczny),
    // zeby moc cicho poprawic pozycje po wyladowaniu na klonie.
    let settleTimer = null;
    track.addEventListener('scroll', () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const width = track.clientWidth || 1;
        const nearest = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
        if (nearest === 0) {
          index = realSlides.length;
          jumpTo(index, false);
        } else if (nearest === slides.length - 1) {
          index = 1;
          jumpTo(index, false);
        } else {
          index = nearest;
        }
        setActiveDot(index);
      }, 120);
    }, { passive: true });

    prevBtn.addEventListener('click', () => { index -= 1; jumpTo(index, true); });
    nextBtn.addEventListener('click', () => { index += 1; jumpTo(index, true); });
    dots.forEach((dot, di) => dot.addEventListener('click', () => { index = di + 1; jumpTo(index, true); }));
  }
})();
