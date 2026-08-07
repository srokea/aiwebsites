/* ═══════════════════════════════════════════════════════════
   Silnik scroll-story.

   Jedna pętla rAF czyta pozycję scrolla i wylicza dla każdego
   elementu opacity + transform. Nic więcej nie jest animowane,
   więc wszystko zostaje na GPU.

   Uruchamia się tylko gdy <html> ma klasę .motion (ustawia ją
   inline'owy skrypt w <head>, jeśli użytkownik nie prosił
   o ograniczenie ruchu). Bez niej strona jest statyczną listą scen.
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!root.classList.contains('motion')) return;

  /* ── pomocnicze ─────────────────────────────────────────── */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* smoothstep — zero pochodnej na obu końcach, więc wejścia
     i wyjścia nie mają widocznego "startu" ani "stopu" */
  const smooth = (a, b, v) => {
    if (b === a) return v < a ? 0 : 1;
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const easeInOut = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ── 1. Sceny tekstowe ──────────────────────────────────── */

  /* Postęp sceny liczymy przez całe jej życie w viewporcie:
     p = 0 gdy sekcja wchodzi dołem, p = 1 gdy wychodzi górą.
     Dzięki temu tekst pojawia się jeszcze zanim stage się przypnie,
     a znika zanim odpłynie — bez martwych pól. */

  const beats = [];
  const scenes = [];

  document.querySelectorAll('[data-scene]').forEach((scene) => {
    const list = [];
    scene.querySelectorAll('.beat').forEach((el) => {
      const [i0, i1] = (el.dataset.in || '-1 -0.999').split(' ').map(Number);
      const [o0, o1] = (el.dataset.out || '2 2.001').split(' ').map(Number);
      const b = { el, i0, i1, o0, o1, motion: el.dataset.motion || 'text' };
      list.push(b);
      beats.push(b);
    });
    if (list.length) scenes.push({ el: scene, list, idle: false, rect: null });
  });

  function applyBeat(b, p) {
    const e = smooth(b.i0, b.i1, p);   // wejście 0 → 1
    const x = smooth(b.o0, b.o1, p);   // wyjście 0 → 1
    const o = e * (1 - x);

    b.el.style.opacity = o.toFixed(3);

    switch (b.motion) {
      case 'image': {
        // 0.98 → 1.00, dokładnie jak w briefie
        const s = 0.98 + 0.02 * e - 0.01 * x;
        b.el.style.transform = `scale(${s.toFixed(4)})`;
        break;
      }
      case 'dot': {
        const s = 0.5 + 0.5 * e;
        b.el.style.transform = `scale(${s.toFixed(4)})`;
        break;
      }
      case 'plain':
        break;
      default: {
        // fade up: wchodzi z dołu, wychodzi górą — jeden kierunek ruchu
        const y = (1 - e) * 26 - x * 26;
        b.el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      }
    }
  }

  function renderScenes(vh) {
    for (const s of scenes) {
      const r = s.rect;

      if (r.bottom < -60 || r.top > vh + 60) {
        if (!s.idle) {
          for (const b of s.list) b.el.style.opacity = '0';
          s.idle = true;
        }
        continue;
      }
      s.idle = false;

      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      for (const b of s.list) applyBeat(b, p);
    }
  }

  /* ── 2. Stos okien przeglądarki ─────────────────────────── */

  const work = document.getElementById('work');
  const stage = work && work.querySelector('.work__stage');
  const deck = work && work.querySelector('.work__scene');
  const wins = work ? Array.from(work.querySelectorAll('.win')) : [];
  const caps = work ? Array.from(work.querySelectorAll('.cap')) : [];
  const bars = work ? Array.from(work.querySelectorAll('.rail i')) : [];
  const N = wins.length;
  const LAST = N - 1;

  let xStep = 56;
  let yStep = 42;

  function measureDeck() {
    if (!N) return;
    const w = wins[0].offsetWidth;
    const cs = getComputedStyle(deck);
    const sx = parseFloat(cs.getPropertyValue('--step-x')) || 0.062;
    const sy = parseFloat(cs.getPropertyValue('--step-y')) || 0.040;
    xStep = w * sx;   // przesunięcie w lewo
    yStep = w * sy;   // i w dół
  }

  /* Postęp z przystankiem na każdym projekcie: przez pierwsze
     i ostatnie 18% odcinka nic się nie rusza (projekt "trzyma
     scenę"), środek to easeInOut. Stąd rytm: pokaz → przejście. */
  const HOLD = 0.18;

  function withHold(t) {
    if (t <= 0) return 0;
    if (t >= LAST) return LAST;
    const i = Math.floor(t);
    const f = t - i;
    const u = clamp((f - HOLD) / (1 - 2 * HOLD), 0, 1);
    return i + easeInOut(u);
  }

  let tTarget = 0;
  let tSmooth = 0;

  function readDeck(vh, r) {
    if (!N || !r) return;
    const travel = r.height - vh;
    const raw = travel > 0 ? clamp(-r.top / travel, 0, 1) : 0;
    tTarget = withHold(raw * LAST);
  }

  function renderDeck() {
    for (let i = 0; i < N; i++) {
      const d = i - tSmooth;          // 0 = na przodzie, >0 = w głębi stosu
      let x, y, s, rz, ry, op;

      if (d >= 0) {
        const D = Math.min(d, 4);
        x  = -D * xStep;
        y  =  D * yStep;
        s  = 1 - D * 0.052;
        rz = -D * 1.0;
        ry = -Math.min(D, 1) * 5.5;
        op = D <= 3 ? 1 : clamp(4 - D, 0, 1);
      } else {
        // Projekt ustępuje miejsca: podjeżdża do przodu i rozpływa się.
        // Wygaszamy szybciej niż trwa ruch — inaczej dwa zrzuty ekranu
        // prześwitują przez siebie i przejście robi się brudne.
        const k = Math.min(-d, 1.4);
        x  =  k * xStep * 0.55;
        y  = -k * yStep * 3.4;
        s  = 1 + k * 0.14;
        rz =  k * 0.7;
        ry =  k * 4.5;
        op = clamp(1 - k * 2.9, 0, 1);
      }

      const el = wins[i];
      el.style.opacity = op.toFixed(3);
      el.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
        `rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) ` +
        `scale(${s.toFixed(4)})`;
      // wychodzące okno musi być nad stosem, głębsze — pod
      el.style.zIndex = String(Math.round(300 - d * 12));

      const near = Math.abs(d);

      const co = clamp(1 - near * 2.6, 0, 1);
      caps[i].style.opacity = co.toFixed(3);
      caps[i].style.transform = `translate3d(0, ${((1 - co) * 10).toFixed(2)}px, 0)`;

      const ro = clamp(1 - near * 1.15, 0, 1);
      bars[i].style.transform = `scaleX(${(1 + ro * 0.9).toFixed(3)})`;
      bars[i].style.opacity = (0.35 + ro * 0.65).toFixed(3);
    }
  }

  if (stage) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            stage.classList.add('is-in');
            io.disconnect();
          }
        }
      },
      { rootMargin: '-20% 0px -20% 0px' }
    );
    io.observe(work);
  }

  /* ── 3. Chmury: ledwie wyczuwalna paralaksa ─────────────── */

  const clouds = document.getElementById('clouds');

  /* ── 4. Podpowiedź scrolla znika po pierwszym geście ────── */

  const hint = document.getElementById('hint');
  let hintGone = false;

  /* ── 5. Pętla ───────────────────────────────────────────── */

  let vh = window.innerHeight;
  let lastY = -1;
  let lastT = 0;
  let running = true;

  function frame(now) {
    if (!running) return;

    const dt = lastT ? Math.min(now - lastT, 64) : 16.7;
    lastT = now;

    const y = window.scrollY || window.pageYOffset || 0;

    if (y !== lastY) {
      lastY = y;

      // Najpierw wszystkie odczyty geometrii, dopiero potem zapisy stylów.
      // Przeplatanie ich powodowało wymuszony reflow w każdej klatce.
      for (const s of scenes) s.rect = s.el.getBoundingClientRect();
      const workRect = work ? work.getBoundingClientRect() : null;

      renderScenes(vh);
      readDeck(vh, workRect);

      if (clouds) clouds.style.transform = `translate3d(0, ${(-y * 0.025).toFixed(2)}px, 0)`;

      if (!hintGone && hint && y > 40) {
        hintGone = true;
        hint.classList.add('is-gone');
      }
    }

    // Tłumione dociąganie do celu — niezależne od liczby klatek na sekundę.
    // Liczone PO odczycie nowego celu, inaczej scroll kasowałby tłumienie.
    const diff = tTarget - tSmooth;
    if (Math.abs(diff) > 0.0004) {
      tSmooth += diff * (1 - Math.pow(1 - 0.18, dt / 16.7));
      if (N) renderDeck();
    } else if (tSmooth !== tTarget) {
      tSmooth = tTarget;
      if (N) renderDeck();
    }

    requestAnimationFrame(frame);
  }

  function init() {
    vh = window.innerHeight;
    measureDeck();
    lastY = -1;                 // wymuś przerysowanie w najbliższej klatce

    for (const s of scenes) s.rect = s.el.getBoundingClientRect();
    const workRect = work ? work.getBoundingClientRect() : null;

    renderScenes(vh);
    readDeck(vh, workRect);
    tSmooth = tTarget;
    if (N) renderDeck();
  }

  let resizeId = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeId);
    resizeId = setTimeout(init, 120);
  }, { passive: true });

  window.addEventListener('load', init);

  /* Jeśli użytkownik włączy "ogranicz ruch" w trakcie — sprzątamy
     wszystkie style inline i oddajemy stronę CSS-owi. */
  const onMQ = () => {
    if (!mq.matches) return;
    running = false;
    root.classList.remove('motion');
    for (const b of beats) b.el.removeAttribute('style');
    for (const el of [...wins, ...caps, ...bars]) el.removeAttribute('style');
    if (clouds) clouds.removeAttribute('style');
  };
  if (mq.addEventListener) mq.addEventListener('change', onMQ);

  init();
  requestAnimationFrame(frame);
})();
