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
    : '';

  /* --------------------------------------------------------- ekran powitalny --- */

  const heroMore = document.getElementById('heroMore');
  if (heroMore) {
    heroMore.addEventListener('click', () => {
      const target = document.getElementById('warsztat');
      if (target) target.scrollIntoView({ behavior: prefersReduce ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // Tlo hero z panelu (Ustawienia strony -> zdjecie na telefon/komputer).
  // Zaszyte w HTML zdjecia sa domyslne i zostaja, jesli API jeszcze nie
  // istnieje (backend niewdrozony) albo Filip niczego nie podmienil.
  const heroImg = document.getElementById('heroImg');
  if (heroImg) {
    const heroSourceDesktop = document.getElementById('heroSourceDesktop');
    fetch(API_BASE + '/api/settings')
      .then((response) => response.json())
      .then((body) => {
        if (!body.ok) return;
        if (body.data.hero_desktop && heroSourceDesktop) heroSourceDesktop.srcset = body.data.hero_desktop;
        if (body.data.hero_mobile) heroImg.src = body.data.hero_mobile;
      })
      .catch(() => {}); // brak API albo pusta baza — zostaja domyslne zdjecia
  }

  /* ------------------------------------------------------------ nawigacja --- */

  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const panel = document.getElementById('navpanel');
  const navClose = document.getElementById('navClose');

  // Tło nawigacji wjeżdża dopiero po wyjściu z hero, płynnie, bez skoku.
  let lifted = false;
  function onScroll() {
    const shouldLift = window.scrollY > window.innerHeight * 0.8;
    if (shouldLift === lifted) return;
    lifted = shouldLift;
    nav.classList.toggle('is-lifted', lifted);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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

    const nameOk = setError('imie', name ? '' : 'Podaj imię, żebym wiedział, jak się zwracać.');
    const contactOk = setError('kontakt',
      EMAIL_RE.test(contact) || digits.length >= 9
        ? ''
        : 'Zostaw numer telefonu albo e-mail, żebym mógł odpisać.');

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
