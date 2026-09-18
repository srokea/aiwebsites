/* ============================================================================
   widget.js — okienko kontaktowe w prawym dolnym rogu.
   ----------------------------------------------------------------------------
   Na razie statyczne: szybkie kanały kontaktu + najczęstsze pytania.
   Cała treść siedzi w WIDGET_CONFIG, żeby dopisanie pytania nie wymagało
   grzebania w logice. Panel NIGDY nie otwiera się sam.
   ========================================================================== */

/* Wlasny zakres, patrz komentarz w site.js. */
(function () {
  'use strict';

  const WIDGET_CONFIG = {
    // Bez e-maila: brief.md go nie podaje. Po uzupelnieniu dopisz tu
    // email: 'mailto:...' i ['email', 'E-mail'] w CHANNEL_LABELS nizej.
    channels: {
      phone: 'tel:+48697035198',
      instagram: 'https://ig.me/m/magda_suszkakrawiec_fotografia',
      messenger: 'https://m.me/MagdalenaSuszkaKrawiecFotografia',
    },

    // Godziny, w których przy przycisku świeci się kropka "dostępny".
    // 0 = niedziela ... 6 = sobota, zgodnie z Date#getDay(). Godziny z brief.md:
    // wtorek-piatek 9-16, poniedzialek i weekend zamkniete.
    availability: {
      2: { from: 9, to: 16 },
      3: { from: 9, to: 16 },
      4: { from: 9, to: 16 },
      5: { from: 9, to: 16 },
    },

    // Tylko fakty z brief.md. Ceny, czas oddania zdjec itp. dopisac, gdy
    // Magda je poda.
    faq: [
      {
        q: 'Gdzie jest studio?',
        a: 'Przy ulicy Cmentarnej 21 w Sulejowie. Na stronie Kontakt jest mapa i przycisk do wyznaczenia trasy.',
      },
      {
        q: 'Czy dojeżdża Pani na sesje?',
        a: 'Tak. Poza Sulejowem przyjeżdżam do Piotrkowa Trybunalskiego, Bełchatowa, '
         + 'Tomaszowa Mazowieckiego i Opoczna.',
      },
      {
        q: 'Jakie sesje Pani robi?',
        a: 'Ciążowe, noworodkowe, rodzinne i kobiece.',
      },
      {
        q: 'Kiedy można dzwonić?',
        a: 'Od wtorku do piątku, w godzinach 9:00–16:00. W pozostałe dni najlepiej napisać, odpiszę.',
      },
      {
        q: 'Jak zarezerwować termin?',
        a: 'Wystarczy zadzwonić albo napisać na Instagramie lub Messengerze. Ustalimy rodzaj sesji, miejsce i termin.',
      },
    ],
  };

  /**
   * Punkt wejścia pod przyszły czat albo asystenta AI.
   * Teraz zwraca dopasowanie z FAQ; docelowo w to miejsce wchodzi wywołanie API.
   */
  async function sendMessage(text) {
    const query = String(text || '').toLowerCase();
    const hit = WIDGET_CONFIG.faq.find((entry) =>
      query && entry.q.toLowerCase().split(' ').some((word) =>
        word.length > 4 && query.includes(word)));
    return hit ? hit.a : 'Proszę napisać do mnie na Instagramie albo zadzwonić, odpowiem osobiście.';
  }

  // Widget siedzi we własnym zakresie, więc punkt wejścia wystawiamy jawnie.
  window.SiteWidget = { config: WIDGET_CONFIG, sendMessage };

  /* ------------------------------------------------------------------ ikony --- */

  const ICONS = {
    chat: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<path d="M21 11.5c0 4.14-4.03 7.5-9 7.5-1.02 0-2-.14-2.9-.4L4 21l1.2-3.6C3.83 16.1 3 13.9 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5z" '
        + 'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    phone: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
         + '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 006 6l1.5-2 4 1.5v3c0 .8-.7 1.5-1.5 1.4C10.8 18.6 5.4 13.2 5.1 5C5 4.2 5.7 3.5 6.5 3.5z" '
         + 'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    instagram: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
             + '<rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.5"/>'
             + '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5"/>'
             + '<circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>',
    messenger: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
             + '<path d="M12 3.2c-4.9 0-8.8 3.6-8.8 8.1 0 2.5 1.2 4.7 3.2 6.2v3l2.9-1.6c.8.2 1.7.3 2.7.3 4.9 0 8.8-3.6 8.8-8s-3.9-8-8.8-8z" '
             + 'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
             + '<path d="M7.2 14.2l3.5-3.7 2 2 2.9-2.6-3.3 3.6-2-1.9-3.1 2.6z" fill="currentColor"/></svg>',
    email: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
         + '<rect x="2.5" y="5" width="19" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>'
         + '<path d="M3 6.5l9 6 9-6" stroke="currentColor" stroke-width="1.5"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
         + '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/></svg>',
  };

  const CHANNEL_LABELS = [
    ['phone', 'Zadzwoń'],
    ['instagram', 'Instagram'],
    ['messenger', 'Messenger'],
  ];

  /* ------------------------------------------------------------- budowanie --- */

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEEN_KEY = 'msk_widget_seen';

  function isAvailable() {
    const now = new Date();
    const today = WIDGET_CONFIG.availability[now.getDay()];
    if (!today) return false;
    return now.getHours() >= today.from && now.getHours() < today.to;
  }

  function makeButton() {
    const button = document.createElement('button');
    button.className = 'widget-btn';
    button.type = 'button';
    button.id = 'widgetBtn';
    button.setAttribute('aria-label', 'Otwórz okno kontaktu');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'widgetPanel');
    button.innerHTML = ICONS.chat;

    if (isAvailable()) {
      const dot = document.createElement('span');
      dot.className = 'widget-btn__dot';
      // Kolor nie może być jedynym nośnikiem informacji.
      dot.innerHTML = '<span class="sr-only">Magda jest teraz dostępna</span>';
      button.append(dot);
    }
    return button;
  }

  function makePanel() {
    const panel = document.createElement('div');
    panel.className = 'widget-panel';
    panel.id = 'widgetPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Kontakt z Magdą');

    const channels = CHANNEL_LABELS.map(([key, label]) =>
      '<a class="widget-channel" href="' + WIDGET_CONFIG.channels[key] + '"'
      + (key === 'phone' || key === 'email' ? '' : ' target="_blank" rel="noopener"')
      + '>' + ICONS[key] + '<span>' + label + '</span></a>').join('');

    const faq = WIDGET_CONFIG.faq.map((entry) =>
      '<details class="faq"><summary>' + entry.q + '</summary><p>' + entry.a + '</p></details>'
    ).join('');

    panel.innerHTML =
        '<div class="widget-head">'
      +   '<img class="widget-avatar" src="assets/img/avatar-magda.webp" alt="" aria-hidden="true">'
      +   '<div>'
      +     '<div class="widget-head__name">Magda Suszka-Krawiec</div>'
      +     '<div class="widget-head__sub">Telefon: wt–pt, 9:00–16:00</div>'
      +   '</div>'
      +   '<button class="widget-close" type="button" aria-label="Zamknij okno kontaktu">'
      +     ICONS.close
      +   '</button>'
      + '</div>'
      + '<div class="widget-body">'
      +   '<div class="widget-channels">' + channels + '</div>'
      +   '<p class="widget-faq__title">Najczęstsze pytania</p>'
      +   faq
      + '</div>'
      + '<div class="widget-foot">'
      +   '<span>Nie ma tu Pani pytania?</span>'
      +   '<button class="btn btn--ghost" type="button" data-to-form>Napisz wiadomość</button>'
      + '</div>';

    return panel;
  }

  /* ------------------------------------------------------------- sterowanie --- */

  const button = makeButton();
  const panel = makePanel();
  document.body.append(button, panel);

  let open = false;

  function openWidget() {
    open = true;
    panel.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Zamknij okno kontaktu');
    // Na telefonie panel zajmuje prawie cały ekran, więc tło nie może się przewijać.
    if (window.matchMedia('(max-width: 639px)').matches) {
      document.body.style.overflow = 'hidden';
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onOutside, true);
    panel.querySelector('.widget-close').focus();
  }

  function closeWidget(returnFocus = true) {
    open = false;
    panel.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Otwórz okno kontaktu');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOutside, true);
    if (returnFocus) button.focus();
  }

  function onKey(event) {
    if (event.key === 'Escape') { closeWidget(); return; }
    if (event.key !== 'Tab') return;

    const focusable = [...panel.querySelectorAll('a, button, summary')]
      .filter((node) => node.offsetParent !== null);
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

  function onOutside(event) {
    if (!open) return;
    if (panel.contains(event.target) || button.contains(event.target)) return;
    closeWidget(false);
  }

  button.addEventListener('click', () => (open ? closeWidget() : openWidget()));
  panel.querySelector('.widget-close').addEventListener('click', () => closeWidget());

  // Tylko jedno pytanie otwarte naraz.
  panel.querySelectorAll('.faq').forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      panel.querySelectorAll('.faq').forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });

  panel.querySelector('[data-to-form]').addEventListener('click', () => {
    closeWidget(false);
    const kontaktSection = document.getElementById('kontakt');
    // Formularz mieszka tylko na kontakt.html — z innych podstron trzeba
    // tam najpierw przejsc, zamiast scrollowac do nieistniejacej sekcji.
    if (!kontaktSection) {
      window.location.href = 'kontakt.html';
      return;
    }
    kontaktSection.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
    // Focus dopiero po dojechaniu, inaczej przeglądarka przerwałaby przewijanie.
    const field = document.getElementById('imie');
    if (field) setTimeout(() => field.focus({ preventScroll: true }), reduce ? 0 : 500);
  });

  /* ------------------------------------- pierwsze wejście: puls i zaczepka --- */

  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN_KEY) === '1';
  } catch (error) {
    // Tryb prywatny potrafi rzucić przy dostępie do sessionStorage.
    seen = true;
  }

  if (!seen && !reduce) {
    button.classList.add('is-pulsing');
    setTimeout(() => button.classList.remove('is-pulsing'), 6000);

    const nudge = document.createElement('button');
    nudge.className = 'widget-nudge';
    nudge.type = 'button';
    nudge.textContent = 'Ma Pani pytanie? Proszę pisać śmiało';
    document.body.append(nudge);

    const removeNudge = () => {
      nudge.classList.remove('is-in');
      setTimeout(() => nudge.remove(), 300);
    };

    setTimeout(() => nudge.classList.add('is-in'), 8000);
    setTimeout(removeNudge, 14000);
    nudge.addEventListener('click', () => {
      removeNudge();
      openWidget();
    });

    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch (error) {
      // Bez sessionStorage zaczepka pokaże się przy kolejnym wejściu. Trudno.
    }
  }
})();
