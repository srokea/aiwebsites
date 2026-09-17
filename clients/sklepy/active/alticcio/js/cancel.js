// Odwołanie rezerwacji z linku w mailu.
// mountCancel(root, api, token) — `api` z js/cancel-api.js (albo atrapa w testach UI).
// Samo otwarcie linku niczego nie odwołuje (skanery linków w poczcie), trzeba kliknąć przycisk.

import { h } from './dom.js';
import { formatLongDate, formatPeople, formatShortDate } from './format.js';
import { RESTAURANT_PHONE, RESTAURANT_PHONE_HREF } from './config.js';

const TOKEN_RE = /^[0-9a-f]{64}$/;

const phoneLink = () => h('a', { class: 'od-phone', href: RESTAURANT_PHONE_HREF, text: RESTAURANT_PHONE });

export function mountCancel(root, api, token) {
  let busy = false;

  function show(label, title, body) {
    const heading = h('h1', { class: 'od-title', tabindex: '-1', text: title });
    root.replaceChildren(h('div', { class: 'od-card' }, [
      label ? h('p', { class: 'od-label', text: label }) : null,
      heading,
      ...body,
    ]));
    heading.focus();
  }

  const details = (r) => h('div', { class: 'od-details' }, [
    h('p', { class: 'od-when', text: formatLongDate(r.date) }),
    h('p', { class: 'od-hours', text: `${r.time}–${r.end_time} · ${formatPeople(r.party_size)}` }),
    h('p', { class: 'od-muted', text: `Na imię: ${r.guest_name}` }),
  ]);

  const bookAgain = () => h('a', { class: 'od-btn od-btn-ghost', href: '../#rezerwacja', text: 'Zarezerwuj inny termin' });

  function notFound() {
    show(null, 'Nie znaleźliśmy tej rezerwacji', [
      h('p', { text: 'Link może być niepełny (sprawdź, czy skopiował się w całości) albo rezerwacja minęła ponad miesiąc temu.' }),
      h('p', {}, ['W razie pytań zadzwoń: ', phoneLink(), '.']),
    ]);
  }

  function loadError() {
    show(null, 'Nie udało się wczytać rezerwacji', [
      h('p', {}, ['Sprawdź internet i spróbuj ponownie. Możesz też zadzwonić: ', phoneLink(), '.']),
      h('div', { class: 'od-actions' }, h('button', { type: 'button', class: 'od-btn', text: 'Spróbuj ponownie', onclick: load })),
    ]);
  }

  function render(r) {
    if (r.status === 'cancelled') {
      show('Rezerwacja odwołana', 'Ta rezerwacja jest już odwołana', [
        details(r),
        h('p', { text: 'Nic więcej nie trzeba robić.' }),
        h('div', { class: 'od-actions' }, bookAgain()),
      ]);
      return;
    }
    if (r.is_past) {
      show(null, 'Ta rezerwacja już minęła', [
        details(r),
        h('p', {}, ['Masz pytanie? Zadzwoń: ', phoneLink(), '.']),
      ]);
      return;
    }
    if (!r.cancellable) {
      show('Za późno na odwołanie online', 'Zadzwoń, zwolnimy stolik', [
        details(r),
        h('p', { text: `Online można odwołać do ${formatShortDate(r.deadline_date)},\u00a0${r.deadline_time}.` }),
        h('p', {}, ['Teraz najszybciej telefonicznie: ', phoneLink(), '.']),
      ]);
      return;
    }

    const status = h('p', { class: 'od-status', role: 'alert' });
    const button = h('button', { type: 'button', class: 'od-btn', text: 'Tak, odwołaj rezerwację' });
    button.addEventListener('click', () => confirmCancel(button, status));

    show('Odwołanie rezerwacji', 'Odwołać tę rezerwację?', [
      details(r),
      h('p', { text: 'Stolik od razu wróci do puli i dostanie go ktoś inny.' }),
      status,
      h('div', { class: 'od-actions' }, [
        button,
        h('a', { class: 'od-btn od-btn-ghost', href: '../', text: 'Nie, zostawiam' }),
      ]),
      h('p', { class: 'od-note', text: `Online możesz to zrobić do ${formatShortDate(r.deadline_date)},\u00a0${r.deadline_time}.` }),
    ]);
  }

  async function confirmCancel(button, status) {
    if (busy) return;
    busy = true;
    button.setAttribute('aria-disabled', 'true');
    button.replaceChildren(h('span', { class: 'od-spinner', 'aria-hidden': 'true' }), 'Odwołuję…');
    status.textContent = '';

    let res;
    try {
      res = await api.cancel(token);
    } catch (err) {
      console.error('Odwołanie', err);
      busy = false;
      button.removeAttribute('aria-disabled');
      button.replaceChildren('Tak, odwołaj rezerwację');
      status.replaceChildren('Nie udało się odwołać. Spróbuj ponownie albo zadzwoń: ', phoneLink(), '.');
      return;
    }
    busy = false;

    if (res?.ok) {
      const r = res.reservation;
      show('Gotowe', 'Rezerwacja odwołana', [
        details(r),
        h('p', { text: 'Dzięki, że dajesz znać. Stolik jest już wolny dla innych gości.' }),
        h('div', { class: 'od-actions' }, bookAgain()),
      ]);
      return;
    }
    // Stan zmienił się od wczytania strony (np. minął termin albo odwołała obsługa) — pokaż aktualny.
    if (res?.error === 'not_found') notFound();
    else load();
  }

  async function load() {
    if (!TOKEN_RE.test(token)) {
      notFound();
      return;
    }
    root.replaceChildren(h('p', { class: 'od-center', text: 'Wczytuję rezerwację…' }));
    let res;
    try {
      res = await api.lookup(token);
    } catch (err) {
      console.error('Odwołanie: wczytanie', err);
      loadError();
      return;
    }
    if (!res?.ok) notFound();
    else render(res.reservation);
  }

  load();
}
