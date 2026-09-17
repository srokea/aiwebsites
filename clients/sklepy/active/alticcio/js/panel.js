// Panel właściciela: logowanie, rezerwacje wybranego dnia, anulowanie, podgląd na żywo.
// mountPanel(root, api) — `api` z js/panel-api.js (albo atrapa w testach UI).

import { h } from './dom.js';
import { todayInWarsaw, addDays, formatLongDate, formatPeople, TIMEZONE } from './format.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HIGHLIGHT_MS = 8000;

const createdFmt = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TIMEZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

/** 1 rezerwacja · 2–4 rezerwacje · 5 rezerwacji · 12–14 rezerwacji · 22 rezerwacje */
function formatReservations(n) {
  if (n === 1) return '1 rezerwacja';
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n} ${last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'rezerwacje' : 'rezerwacji'}`;
}

function dateFromHash() {
  const d = new URLSearchParams(location.hash.slice(1)).get('dzien');
  return d && DATE_RE.test(d) ? d : null;
}

function authErrorMessage(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('invalid login')) return 'Nieprawidłowy e-mail lub hasło.';
  if (msg.includes('email not confirmed')) return 'Ten adres e-mail nie został jeszcze potwierdzony.';
  if (msg.includes('rate limit') || err?.status === 429) return 'Za dużo prób. Odczekaj chwilę i spróbuj ponownie.';
  if (msg.includes('password') && msg.includes('characters')) return 'Hasło jest za krótkie.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Brak połączenia. Sprawdź internet.';
  return 'Coś poszło nie tak. Spróbuj ponownie.';
}

export function mountPanel(root, api) {
  let view = null;          // 'loading' | 'login' | 'recovery' | 'forbidden' | 'day'
  let stopLive = null;
  let recoveryMode = false;

  function stopDay() {
    stopLive?.();
    stopLive = null;
  }

  function render(node) {
    root.replaceChildren(node);
  }

  // ——— Autoryzacja ———

  let routeSeq = 0;

  async function route(session) {
    if (recoveryMode) return;
    if (!session) {
      routeSeq++;                    // unieważnia sprawdzanie uprawnień, które jeszcze trwa
      stopDay();
      if (view !== 'login') showLogin();
      return;
    }
    if (view === 'day' || view === 'checking') return;

    view = 'checking';
    const seq = routeSeq;
    render(h('p', { class: 'pn-center', text: 'Sprawdzam uprawnienia…' }));
    let staff = false;
    try {
      staff = await api.isStaff();
    } catch (err) {
      if (seq !== routeSeq) return;
      console.error('Panel: is_staff', err);
      showMessage('Nie udało się sprawdzić uprawnień. Odśwież stronę.');
      return;
    }
    if (seq !== routeSeq) return;   // w międzyczasie nastąpiło wylogowanie
    if (!staff) {
      view = 'forbidden';
      render(h('div', { class: 'pn-box' }, [
        h('h1', { class: 'pn-title', text: 'Brak dostępu' }),
        h('p', { text: 'To konto nie ma dostępu do panelu rezerwacji.' }),
        h('button', { type: 'button', class: 'pn-btn', text: 'Wyloguj', onclick: () => api.signOut() }),
      ]));
      return;
    }
    showDay(dateFromHash() ?? todayInWarsaw());
  }

  function showMessage(text) {
    view = 'message';
    render(h('div', { class: 'pn-box' }, h('p', { role: 'alert', text })));
  }

  function field(label, attrs) {
    const input = h('input', { class: 'pn-input', ...attrs });
    return { input, node: h('label', { class: 'pn-field' }, [h('span', { class: 'pn-label', text: label }), input]) };
  }

  function showLogin({ notice } = {}) {
    stopDay();
    view = 'login';
    const email = field('E-mail', { type: 'email', name: 'email', autocomplete: 'username', required: true });
    const password = field('Hasło', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
    const status = h('p', { class: 'pn-status', role: 'status', 'aria-live': 'polite', text: notice ?? '' });
    const submit = h('button', { type: 'submit', class: 'pn-btn pn-btn-primary', text: 'Zaloguj' });

    const form = h('form', { class: 'pn-box', novalidate: true }, [
      h('h1', { class: 'pn-title', text: 'Panel rezerwacji' }),
      email.node, password.node, submit, status,
      h('button', { type: 'button', class: 'pn-link', text: 'Nie pamiętasz hasła?', onclick: () => showReset(email.input.value) }),
    ]);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!email.input.value.trim() || !password.input.value) {
        status.textContent = 'Wpisz e-mail i hasło.';
        return;
      }
      submit.disabled = true;
      status.textContent = 'Loguję…';
      try {
        await api.signIn(email.input.value.trim(), password.input.value);
        status.textContent = '';
        // dalej prowadzi onAuthChange → route()
      } catch (err) {
        status.textContent = authErrorMessage(err);
        submit.disabled = false;
        password.input.select();
      }
    });

    render(form);
    email.input.focus();
  }

  function showReset(prefill) {
    view = 'reset';
    const email = field('E-mail konta', { type: 'email', autocomplete: 'username', value: prefill || '' });
    const status = h('p', { class: 'pn-status', role: 'status', 'aria-live': 'polite' });
    const submit = h('button', { type: 'submit', class: 'pn-btn pn-btn-primary', text: 'Wyślij link do zmiany hasła' });
    const form = h('form', { class: 'pn-box', novalidate: true }, [
      h('h1', { class: 'pn-title', text: 'Zmiana hasła' }),
      h('p', { text: 'Wyślemy link na adres przypisany do konta.' }),
      email.node, submit, status,
      h('button', { type: 'button', class: 'pn-link', text: 'Wróć do logowania', onclick: () => showLogin() }),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!email.input.value.trim()) { status.textContent = 'Wpisz e-mail.'; return; }
      submit.disabled = true;
      try {
        await api.sendPasswordReset(email.input.value.trim());
        status.textContent = 'Jeśli to konto istnieje, link jest już w drodze. Sprawdź skrzynkę (także spam).';
      } catch (err) {
        status.textContent = authErrorMessage(err);
        submit.disabled = false;
      }
    });
    render(form);
    email.input.focus();
  }

  function showRecovery() {
    stopDay();
    recoveryMode = true;
    view = 'recovery';
    const pass = field('Nowe hasło (min. 10 znaków)', { type: 'password', autocomplete: 'new-password', minlength: '10' });
    const again = field('Powtórz hasło', { type: 'password', autocomplete: 'new-password' });
    const status = h('p', { class: 'pn-status', role: 'status', 'aria-live': 'polite' });
    const submit = h('button', { type: 'submit', class: 'pn-btn pn-btn-primary', text: 'Ustaw nowe hasło' });
    const form = h('form', { class: 'pn-box', novalidate: true }, [
      h('h1', { class: 'pn-title', text: 'Ustaw nowe hasło' }), pass.node, again.node, submit, status,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pass.input.value.length < 10) { status.textContent = 'Hasło musi mieć co najmniej 10 znaków.'; return; }
      if (pass.input.value !== again.input.value) { status.textContent = 'Hasła się różnią.'; return; }
      submit.disabled = true;
      try {
        await api.updatePassword(pass.input.value);
        recoveryMode = false;
        history.replaceState(null, '', location.pathname);
        view = null;
        route(await api.getSession());
      } catch (err) {
        status.textContent = authErrorMessage(err);
        submit.disabled = false;
      }
    });
    render(form);
    pass.input.focus();
  }

  // ——— Widok dnia ———

  function showDay(initialDate) {
    stopDay();
    view = 'day';

    let date = initialDate;
    let rows = [];
    let knownIds = null;          // null = pierwsze wczytanie dnia, bez podświetlania
    const fresh = new Map();      // id → timeout podświetlenia
    let showCancelled = false;
    let loadSeq = 0;

    const dateLabel = h('h1', { class: 'pn-date', 'aria-live': 'polite' });
    const dateInput = h('input', { type: 'date', class: 'pn-input pn-date-input', 'aria-label': 'Wybierz dzień' });
    const todayBtn = h('button', { type: 'button', class: 'pn-btn', text: 'Dziś' });
    const counters = h('p', { class: 'pn-counters' });
    const liveDot = h('span', { class: 'pn-live', role: 'status' });
    const cancelledToggle = h('button', { type: 'button', class: 'pn-link', 'aria-pressed': 'false' });
    const status = h('p', { class: 'pn-status', role: 'status', 'aria-live': 'polite' });        // wczytywanie / błędy
    const actionStatus = h('p', { class: 'pn-status', role: 'status', 'aria-live': 'polite' });  // wynik anulowania
    const list = h('ol', { class: 'pn-list', 'aria-label': 'Rezerwacje' });

    const layout = h('div', { class: 'pn-day' }, [
      h('header', { class: 'pn-bar' }, [
        h('span', { class: 'pn-brand', text: 'Rezerwacje' }),
        liveDot,
        h('button', { type: 'button', class: 'pn-link', text: 'Wyloguj', onclick: () => api.signOut() }),
      ]),
      h('div', { class: 'pn-nav' }, [
        h('button', { type: 'button', class: 'pn-round', 'aria-label': 'Poprzedni dzień', text: '‹', onclick: () => go(addDays(date, -1)) }),
        dateLabel,
        h('button', { type: 'button', class: 'pn-round', 'aria-label': 'Następny dzień', text: '›', onclick: () => go(addDays(date, 1)) }),
      ]),
      h('div', { class: 'pn-tools' }, [todayBtn, dateInput, h('button', { type: 'button', class: 'pn-btn', text: 'Odśwież', onclick: () => load() })]),
      h('div', { class: 'pn-summary' }, [counters, cancelledToggle]),
      status,
      actionStatus,
      list,
    ]);

    todayBtn.addEventListener('click', () => go(todayInWarsaw()));
    dateInput.addEventListener('change', () => { if (DATE_RE.test(dateInput.value)) go(dateInput.value); });
    cancelledToggle.addEventListener('click', () => { showCancelled = !showCancelled; renderList(); });

    function go(next) {
      if (next === date) return;
      date = next;
      knownIds = null;
      actionStatus.textContent = '';
      history.replaceState(null, '', `${location.pathname}${location.search}#dzien=${date}`);
      load();
    }

    async function load() {
      const seq = ++loadSeq;
      const isToday = date === todayInWarsaw();
      dateLabel.textContent = `${formatLongDate(date)}${isToday ? ' · dziś' : ''}`;
      dateInput.value = date;
      todayBtn.disabled = isToday;
      if (knownIds === null) {
        list.replaceChildren();
        status.textContent = 'Wczytuję…';
      }

      let data;
      try {
        data = await api.dayReservations(date);
      } catch (err) {
        if (seq !== loadSeq) return;
        console.error('Panel: staff_reservations', err);
        if (err?.code === '42501') { showMessage('To konto straciło dostęp do panelu.'); return; }
        status.textContent = 'Nie udało się wczytać rezerwacji. Sprawdź połączenie i kliknij „Odśwież”.';
        return;
      }
      if (seq !== loadSeq) return;

      if (knownIds !== null) {
        for (const r of data) {
          if (!knownIds.has(r.id) && !fresh.has(r.id)) {
            fresh.set(r.id, setTimeout(() => { fresh.delete(r.id); renderList(); }, HIGHLIGHT_MS));
          }
        }
      }
      knownIds = new Set(data.map((r) => r.id));
      rows = data;
      status.textContent = '';
      renderList();
    }

    function renderList() {
      const confirmed = rows.filter((r) => r.status === 'confirmed');
      const cancelled = rows.length - confirmed.length;
      const guests = confirmed.reduce((sum, r) => sum + r.party_size, 0);

      counters.textContent = confirmed.length === 0
        ? 'Brak rezerwacji'
        : `${formatReservations(confirmed.length)} · ${formatPeople(guests)}`;

      cancelledToggle.hidden = cancelled === 0;
      cancelledToggle.setAttribute('aria-pressed', String(showCancelled));
      cancelledToggle.textContent = showCancelled ? `Ukryj anulowane (${cancelled})` : `Pokaż anulowane (${cancelled})`;

      const visible = showCancelled ? rows : confirmed;
      if (visible.length === 0) {
        list.replaceChildren(h('li', { class: 'pn-empty', text: 'Na ten dzień nie ma rezerwacji.' }));
        return;
      }
      list.replaceChildren(...visible.map(renderRow));
    }

    function renderRow(r) {
      const isCancelled = r.status !== 'confirmed';
      const contact = [
        h('a', { class: 'pn-phone', href: `tel:${r.guest_phone}`, text: r.guest_phone.replace(/^(\+48)(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') }),
      ];
      if (r.guest_email) contact.push(h('a', { class: 'pn-mail', href: `mailto:${r.guest_email}`, text: r.guest_email }));

      return h('li', { class: `pn-row${isCancelled ? ' is-cancelled' : ''}${fresh.has(r.id) ? ' is-new' : ''}` }, [
        h('div', { class: 'pn-when' }, [
          h('span', { class: 'pn-time', text: `${r.start_time}–${r.end_time}` }),
          h('span', { class: 'pn-meta', text: `${formatPeople(r.party_size)} · stolik ${r.table_label}${r.table_seats ? ` (${r.table_seats}-os.)` : ''}` }),
          fresh.has(r.id) ? h('span', { class: 'pn-badge', text: 'Nowa' }) : null,
          isCancelled ? h('span', { class: 'pn-badge pn-badge-muted', text: 'Anulowana' }) : null,
        ]),
        h('div', { class: 'pn-who' }, [
          h('p', { class: 'pn-name', text: r.guest_name }),
          h('p', { class: 'pn-contact' }, contact),
          r.comment ? h('p', { class: 'pn-comment', text: `„${r.comment}”` }) : null,
          h('p', { class: 'pn-created', text: `przyjęta ${createdFmt.format(new Date(r.created_at))}` }),
        ]),
        isCancelled ? null : h('button', {
          type: 'button', class: 'pn-btn pn-btn-danger', text: 'Anuluj',
          'aria-label': `Anuluj rezerwację: ${r.guest_name}, ${r.start_time}`,
          onclick: (e) => cancel(r, e.currentTarget),
        }),
      ]);
    }

    async function cancel(r, button) {
      const ok = window.confirm(`Anulować rezerwację?\n\n${r.guest_name}, ${r.start_time}–${r.end_time}, ${formatPeople(r.party_size)}\n\nGodzina od razu wróci do puli dla gości.`);
      if (!ok) return;
      button.disabled = true;
      try {
        const res = await api.cancel(r.id);
        actionStatus.textContent = res?.ok ? `Anulowano: ${r.guest_name}, ${r.start_time}.` : 'Ta rezerwacja była już anulowana.';
      } catch (err) {
        console.error('Panel: cancel', err);
        actionStatus.textContent = 'Nie udało się anulować. Spróbuj ponownie.';
        button.disabled = false;
      }
      load();
    }

    render(layout);
    history.replaceState(null, '', `${location.pathname}${location.search}#dzien=${date}`);
    load();

    stopLive = api.onReservationsChange(
      () => load(),
      (live) => {
        liveDot.textContent = live ? 'Na żywo' : 'Bez podglądu na żywo';
        liveDot.classList.toggle('is-off', !live);
      },
    );
  }

  // ——— Start ———

  if (location.hash.includes('type=recovery')) recoveryMode = true;

  api.onAuthChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { showRecovery(); return; }
    if (event === 'SIGNED_OUT') { recoveryMode = false; view = null; route(null); return; }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') route(session);
  });

  render(h('p', { class: 'pn-center', text: 'Wczytuję…' }));
  view = 'loading';
  api.getSession().then((session) => { if (!recoveryMode) route(session); });
}
