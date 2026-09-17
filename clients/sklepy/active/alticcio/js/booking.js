// Widget rezerwacji stolika — strona gościa.
// Układ wg UI.png: kalendarz | liczba gości, czas przy stoliku, godzina | dane kontaktowe.
//
// mountBooking(root, api) — `api` pochodzi z js/booking-api.js (albo z atrapy w testach UI).
// Źródłem prawdy o wolnych godzinach jest baza; ten plik tylko je pokazuje i zbiera dane.

import {
  todayInWarsaw, addDays, isoWeekday, parseDate,
  formatShortDate, formatLongDate, formatMonth, formatPeople, formatDuration,
} from './format.js';
import { normalizePhone } from './phone.js';
import { normalizeEmail } from './email.js';
import { h } from './dom.js';
import { RESTAURANT_PHONE, RESTAURANT_PHONE_HREF } from './config.js';

const WEEKDAY_HEADERS = ['Po', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Ni'];
const AUTO_ADVANCE_DAYS = 7;

const phoneLink = () => h('a', { href: RESTAURANT_PHONE_HREF, text: RESTAURANT_PHONE });

function addMinutesToTime(time, minutes) {
  const [hh, mm] = time.split(':').map(Number);
  const total = (hh * 60 + mm + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function monthIndex(iso) {
  const d = parseDate(iso);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

const SHELL = `
<div class="bk-card" data-card>
  <div class="bk-top">
    <div class="bk-cal">
      <div class="bk-cal-head">
        <h3 class="bk-month" data-month aria-live="polite"></h3>
        <div class="bk-nav">
          <button type="button" class="bk-round" data-prev aria-label="Poprzedni miesiąc">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
          </button>
          <button type="button" class="bk-round" data-next aria-label="Następny miesiąc">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </div>
      </div>
      <div class="bk-weekdays" aria-hidden="true">${WEEKDAY_HEADERS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="bk-days" data-days role="group" aria-label="Dzień rezerwacji. Strzałki zmieniają dzień."></div>
      <div class="bk-summary">
        <p class="bk-summary-main" data-summary></p>
        <p class="bk-summary-hint" data-summary-hint></p>
      </div>
    </div>

    <div class="bk-params">
      <fieldset>
        <legend class="bk-label">Liczba gości</legend>
        <div class="bk-stepper">
          <button type="button" class="bk-round" data-minus aria-label="Mniej gości">&minus;</button>
          <output class="bk-count" data-party aria-live="polite"></output>
          <button type="button" class="bk-round" data-plus aria-label="Więcej gości">+</button>
        </div>
        <p class="bk-note" data-party-note hidden>Większa grupa? Zadzwoń: <a href="${RESTAURANT_PHONE_HREF}">${RESTAURANT_PHONE}</a></p>
      </fieldset>

      <fieldset>
        <legend class="bk-label">Czas przy stoliku</legend>
        <div class="bk-pills bk-pills-durations" data-durations></div>
      </fieldset>

      <fieldset>
        <legend class="bk-label">Godzina</legend>
        <div data-slots></div>
      </fieldset>
    </div>
  </div>

  <form class="bk-form" data-form novalidate>
    <fieldset>
      <legend class="bk-label">Dane kontaktowe</legend>
      <div class="bk-fields">
        <div>
          <label class="bk-sr" for="bk-name">Imię</label>
          <input class="bk-input" id="bk-name" name="name" type="text" autocomplete="given-name" maxlength="80" placeholder="Imię" required>
          <p class="bk-hint is-alert" data-error="name" hidden>Wpisz imię.</p>
        </div>
        <div>
          <label class="bk-sr" for="bk-phone">Telefon</label>
          <input class="bk-input" id="bk-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="Telefon" required aria-describedby="bk-phone-hint">
          <p class="bk-hint" id="bk-phone-hint" data-phone-hint>Numer z kodem kraju, np. +48 600 100 200</p>
        </div>
        <div>
          <label class="bk-sr" for="bk-email">E-mail</label>
          <input class="bk-input" id="bk-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="E-mail" required aria-describedby="bk-email-hint">
          <p class="bk-hint" id="bk-email-hint" data-email-hint>Wyślemy potwierdzenie z linkiem do odwołania</p>
        </div>
        <div>
          <label class="bk-sr" for="bk-comment">Komentarz (opcjonalnie)</label>
          <input class="bk-input" id="bk-comment" name="comment" type="text" maxlength="500" placeholder="Komentarz (opcjonalnie)">
        </div>
      </div>
    </fieldset>

    <div class="bk-bottom">
      <div>
        <details class="bk-rules">
          <summary>Zasady rezerwacji</summary>
          <div class="bk-rules-body" data-rules></div>
        </details>
        <label class="bk-check">
          <input type="checkbox" name="rules" data-rules-check required>
          <span>Zapoznałem/-am się z zasadami rezerwacji i zobowiązuję się ich przestrzegać.</span>
        </label>
        <p class="bk-privacy">Twoje dane wykorzystamy wyłącznie do obsługi tej rezerwacji. <a href="privacy.html">Polityka prywatności</a></p>
        <div class="bk-captcha" data-captcha></div>
      </div>
      <div>
        <button type="submit" class="bk-submit" data-submit>Rezerwuję</button>
        <p class="bk-status" data-form-status role="status" aria-live="polite"></p>
      </div>
    </div>
  </form>
</div>`;

export function mountBooking(root, api) {
  let unsubscribe = null;
  let onVisible = null;

  function teardown() {
    if (unsubscribe) unsubscribe();
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    unsubscribe = null;
    onVisible = null;
  }

  async function start() {
    teardown();
    root.replaceChildren(
      h('div', { class: 'bk-card' }, h('div', { class: 'bk-message' }, h('p', { text: 'Sprawdzam wolne terminy…' }))),
    );

    let config;
    try {
      config = await api.loadConfig();
    } catch (err) {
      console.error('Rezerwacje: konfiguracja', err);
      root.replaceChildren(
        h('div', { class: 'bk-card' }, h('div', { class: 'bk-message' }, h('p', {}, [
          'Nie udało się wczytać kalendarza rezerwacji. Zadzwoń, a zarezerwujemy stolik telefonicznie: ',
          phoneLink(), '.',
        ]))),
      );
      return;
    }

    runWidget(config);
  }

  function runWidget({ settings, hours }) {
    root.innerHTML = SHELL;
    const $ = (sel) => root.querySelector(sel);

    const el = {
      card: $('[data-card]'), month: $('[data-month]'), prev: $('[data-prev]'), next: $('[data-next]'),
      days: $('[data-days]'), summary: $('[data-summary]'), summaryHint: $('[data-summary-hint]'),
      minus: $('[data-minus]'), plus: $('[data-plus]'), party: $('[data-party]'), partyNote: $('[data-party-note]'),
      durations: $('[data-durations]'), slots: $('[data-slots]'),
      form: $('[data-form]'), name: $('#bk-name'), phone: $('#bk-phone'), email: $('#bk-email'), emailHint: $('[data-email-hint]'), comment: $('#bk-comment'),
      phoneHint: $('[data-phone-hint]'), rules: $('[data-rules]'), rulesCheck: $('[data-rules-check]'),
      captcha: $('[data-captcha]'), submit: $('[data-submit]'), formStatus: $('[data-form-status]'),
    };

    const openDays = new Map(hours.map((row) => [row.weekday, row]));
    const today = todayInWarsaw();
    const lastDay = addDays(today, settings.booking_horizon_days);
    const durations = settings.durations_min;

    const state = {
      date: null,
      viewMonth: monthIndex(today),
      party: Math.min(2, settings.max_party),
      duration: durations.includes(settings.default_duration_min) ? settings.default_duration_min : durations[0],
      slots: [],
      slotsState: 'loading',
      slotsSeq: 0,
      slotsNotice: null,
      time: null,
      token: null,
      captcha: null,
      captchaFailed: false,
      requestId: null,
      submitting: false,
      submitAttempted: false,
      touched: new Set(),
    };

    const isBookable = (iso) => iso >= today && iso <= lastDay && openDays.has(isoWeekday(iso));

    function firstBookableFrom(iso) {
      for (let d = iso; d <= lastDay; d = addDays(d, 1)) {
        if (isBookable(d)) return d;
      }
      return null;
    }

    // ——— Kalendarz ———

    function renderCalendar(focusDate) {
      const year = Math.floor(state.viewMonth / 12);
      const month = state.viewMonth % 12;
      el.month.textContent = formatMonth(year, month);
      el.prev.disabled = state.viewMonth <= monthIndex(today);
      el.next.disabled = state.viewMonth >= monthIndex(lastDay);

      const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const cells = Array.from({ length: offset }, () => h('span', { 'aria-hidden': 'true' }));

      const monthDates = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const bookable = isBookable(iso);
        if (bookable) monthDates.push(iso);
        cells.push(h('button', {
          type: 'button',
          class: `bk-day${iso === today ? ' is-today' : ''}`,
          'data-date': iso,
          'aria-label': `${formatLongDate(iso)}${iso === today ? ', dziś' : ''}${bookable ? '' : ', niedostępny'}`,
          'aria-pressed': String(iso === state.date),
          disabled: !bookable,
          tabindex: '-1',
        }, String(day)));
      }
      el.days.replaceChildren(...cells);

      // Jeden dzień w kolejce Tab (roving tabindex): ten, na który przeszły strzałki,
      // inaczej wybrany, inaczej pierwszy dostępny w miesiącu.
      const rovingDate = [focusDate, state.date].find((d) => d && monthDates.includes(d)) ?? monthDates[0];
      const roving = rovingDate && el.days.querySelector(`[data-date="${rovingDate}"]`);
      if (roving) {
        roving.tabIndex = 0;
        if (focusDate) roving.focus();
      }
    }

    function selectDate(iso, { focus = false } = {}) {
      state.date = iso;
      state.time = null;
      state.slotsNotice = null;
      if (monthIndex(iso) !== state.viewMonth) state.viewMonth = monthIndex(iso);
      renderCalendar(focus ? iso : undefined);
      renderSummary();
      renderSubmit();
      return fetchSlots();
    }

    el.days.addEventListener('click', (e) => {
      const btn = e.target.closest('.bk-day');
      if (btn && !btn.disabled) selectDate(btn.dataset.date, { focus: true });
    });

    el.days.addEventListener('keydown', (e) => {
      const current = e.target.closest('.bk-day')?.dataset.date;
      if (!current) return;
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let target = null;

      if (e.key in steps) {
        for (let d = addDays(current, steps[e.key]); d >= today && d <= lastDay; d = addDays(d, steps[e.key])) {
          if (isBookable(d)) { target = d; break; }
        }
      } else if (e.key === 'Home' || e.key === 'End') {
        const buttons = [...el.days.querySelectorAll('.bk-day:not(:disabled)')];
        target = (e.key === 'Home' ? buttons[0] : buttons.at(-1))?.dataset.date ?? null;
      } else {
        return;
      }

      e.preventDefault();
      if (!target) return;
      if (monthIndex(target) !== state.viewMonth) state.viewMonth = monthIndex(target);
      renderCalendar(target);
    });

    el.prev.addEventListener('click', () => { state.viewMonth -= 1; renderCalendar(); });
    el.next.addEventListener('click', () => { state.viewMonth += 1; renderCalendar(); });

    // ——— Goście i czas ———

    function renderParty() {
      el.party.textContent = String(state.party);
      el.minus.disabled = state.party <= 1;
      el.plus.disabled = state.party >= settings.max_party;
      el.partyNote.hidden = state.party < settings.max_party;
    }

    function changeParty(delta) {
      const next = Math.max(1, Math.min(settings.max_party, state.party + delta));
      if (next === state.party) return;
      state.party = next;
      renderParty();
      renderSummary();
      fetchSlots({ keepTime: true });
    }
    el.minus.addEventListener('click', () => changeParty(-1));
    el.plus.addEventListener('click', () => changeParty(1));

    function renderDurations() {
      el.durations.replaceChildren(...durations.map((m) => h('button', {
        type: 'button',
        class: 'bk-pill',
        'data-duration': m,
        'aria-pressed': String(m === state.duration),
        text: formatDuration(m),
      })));
    }
    el.durations.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-duration]');
      if (!btn) return;
      const m = Number(btn.dataset.duration);
      if (m === state.duration) return;
      state.duration = m;
      for (const b of el.durations.children) b.setAttribute('aria-pressed', String(Number(b.dataset.duration) === m));
      renderSummary();
      fetchSlots({ keepTime: true });
    });

    // ——— Godziny ———

    async function fetchSlots({ keepTime = false, silent = false } = {}) {
      const seq = ++state.slotsSeq;
      if (!silent) {
        state.slotsState = 'loading';
        renderSlots();
      }

      let slots;
      try {
        slots = await api.getSlots(state.date, state.party, state.duration);
      } catch (err) {
        if (seq !== state.slotsSeq) return;
        console.error('Rezerwacje: wolne godziny', err);
        state.slotsState = 'error';
        renderSlots();
        return;
      }
      if (seq !== state.slotsSeq) return;

      state.slots = slots;
      state.slotsState = 'ready';
      if (state.time && !slots.includes(state.time)) {
        state.slotsNotice = keepTime ? `Godzina ${state.time} nie jest już dostępna. Wybierz inną.` : null;
        state.time = null;
      }
      renderSlots();
      renderSummary();
      renderSubmit();
      return slots;
    }

    function renderSlots() {
      const parts = [];

      if (state.slotsState === 'loading') {
        parts.push(
          h('div', { class: 'bk-skeleton', 'aria-hidden': 'true' }, Array.from({ length: 6 }, () => h('span'))),
          h('p', { class: 'bk-sr', role: 'status', text: 'Sprawdzam wolne godziny…' }),
        );
      } else if (state.slotsState === 'error') {
        parts.push(h('p', { class: 'bk-status is-alert', role: 'alert' }, [
          'Nie udało się pobrać wolnych godzin. ',
          h('button', {
            type: 'button', class: 'bk-linkbtn', text: 'Spróbuj ponownie',
            onclick: () => fetchSlots(),
          }),
          ' albo zadzwoń: ', phoneLink(), '.',
        ]));
      } else {
        if (state.slotsNotice) {
          parts.push(h('p', { class: 'bk-status is-alert', role: 'alert', text: state.slotsNotice }));
        }
        if (state.slots.length === 0) {
          parts.push(h('p', { class: 'bk-status', role: 'status' }, [
            h('span', { class: 'bk-status-strong', text: 'Brak wolnych godzin w tym dniu.' }),
            ' Wybierz inny dzień albo krótszy czas przy stoliku.',
          ]));
        } else {
          parts.push(h('div', { class: 'bk-pills bk-pills-slots', role: 'group', 'aria-label': 'Wolne godziny' },
            state.slots.map((t) => h('button', {
              type: 'button',
              class: 'bk-pill',
              'data-time': t,
              'aria-pressed': String(t === state.time),
              text: t,
            }))));
        }
      }
      el.slots.replaceChildren(...parts);
    }

    el.slots.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-time]');
      if (!btn) return;
      state.time = btn.dataset.time;
      state.slotsNotice = null;
      for (const b of el.slots.querySelectorAll('[data-time]')) {
        b.setAttribute('aria-pressed', String(b.dataset.time === state.time));
      }
      el.slots.querySelector('.bk-status.is-alert')?.remove();
      renderSummary();
      renderSubmit();
    });

    // ——— Podsumowanie ———

    function renderSummary() {
      el.summary.textContent = state.date
        ? `${formatShortDate(state.date)} · ${formatPeople(state.party)} · ${formatDuration(state.duration)}`
        : 'Brak wolnych dni';
      el.summaryHint.textContent = state.time
        ? `Godzina ${state.time}–${addMinutesToTime(state.time, state.duration)}`
        : 'Wybierz godzinę';
    }

    // ——— Formularz ———

    function errors() {
      return {
        time: !state.time,
        name: !el.name.value.trim(),
        phone: !normalizePhone(el.phone.value),
        email: !normalizeEmail(el.email.value),
        rules: !el.rulesCheck.checked,
        captcha: !state.token,
      };
    }

    function renderFieldErrors() {
      const err = errors();
      const show = (field) => err[field] && (state.submitAttempted || state.touched.has(field));

      el.name.setAttribute('aria-invalid', String(show('name')));
      root.querySelector('[data-error="name"]').hidden = !show('name');

      el.phone.setAttribute('aria-invalid', String(show('phone')));
      el.phoneHint.classList.toggle('is-alert', show('phone'));
      el.phoneHint.textContent = show('phone')
        ? (el.phone.value.trim() ? 'Sprawdź numer, np. +48 600 100 200.' : 'Wpisz numer telefonu, np. +48 600 100 200.')
        : 'Numer z kodem kraju, np. +48 600 100 200';

      el.email.setAttribute('aria-invalid', String(show('email')));
      el.emailHint.classList.toggle('is-alert', show('email'));
      el.emailHint.textContent = show('email')
        ? (el.email.value.trim() ? 'Sprawdź adres, np. anna@gmail.com.' : 'Wpisz e-mail, wyślemy na niego potwierdzenie.')
        : 'Wyślemy potwierdzenie z linkiem do odwołania';

      el.rulesCheck.setAttribute('aria-invalid', String(state.submitAttempted && err.rules));
    }

    function renderSubmit() {
      const incomplete = Object.values(errors()).some(Boolean);
      el.submit.setAttribute('aria-disabled', String(incomplete || state.submitting));
      el.submit.setAttribute('aria-busy', String(state.submitting));
      el.submit.replaceChildren(...(state.submitting
        ? [h('span', { class: 'bk-spinner', 'aria-hidden': 'true' }), 'Rezerwuję…']
        : ['Rezerwuję']));
    }

    function setFormStatus(content, { alert = false } = {}) {
      el.formStatus.classList.toggle('is-alert', alert);
      el.formStatus.replaceChildren(...[].concat(content ?? []));
    }

    for (const [input, field] of [[el.name, 'name'], [el.phone, 'phone'], [el.email, 'email']]) {
      input.addEventListener('blur', () => {
        state.touched.add(field);
        renderFieldErrors();
      });
      input.addEventListener('input', () => {
        if (state.touched.has(field) || state.submitAttempted) renderFieldErrors();
        renderSubmit();
      });
    }
    el.phone.addEventListener('blur', () => {
      const normalized = normalizePhone(el.phone.value);
      if (normalized && normalized !== el.phone.value) {
        el.phone.value = normalized.replace(/^(\+48)(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4');
      }
    });
    el.rulesCheck.addEventListener('change', () => { renderFieldErrors(); renderSubmit(); });

    function missingSummary(err) {
      const names = [];
      if (err.time) names.push('godzina');
      if (err.name) names.push('imię');
      if (err.phone) names.push('telefon');
      if (err.email) names.push('e-mail');
      if (err.rules) names.push('akceptacja zasad');
      if (err.captcha && !state.captchaFailed) names.push('weryfikacja „nie jestem botem” (chwilę trwa)');
      return names.length ? `Brakuje: ${names.join(', ')}.` : null;
    }

    function focusFirstProblem(err) {
      if (err.time) (el.slots.querySelector('[data-time]') ?? el.slots).focus?.();
      else if (err.name) el.name.focus();
      else if (err.phone) el.phone.focus();
      else if (err.email) el.email.focus();
      else if (err.rules) el.rulesCheck.focus();
    }

    function errorMessage(code) {
      switch (code) {
        case 'slot_taken':
          return 'Ktoś właśnie zajął tę godzinę. Lista jest już odświeżona, wybierz inną.';
        case 'unavailable':
          return 'Ten termin nie jest już dostępny. Wybierz inny.';
        case 'limit':
          return ['Ten numer ma już maksymalną liczbę aktywnych rezerwacji. Żeby dodać kolejną, zadzwoń: ', phoneLink(), '.'];
        case 'captcha':
          return 'Nie udało się potwierdzić, że nie jesteś botem. Spróbuj jeszcze raz.';
        case 'invalid':
          return 'Coś w danych się nie zgadza. Sprawdź formularz i spróbuj ponownie.';
        case 'network':
          return 'Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.';
        default:
          return ['Nie udało się zapisać rezerwacji. Spróbuj ponownie albo zadzwoń: ', phoneLink(), '.'];
      }
    }

    el.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.submitting) return;

      state.submitAttempted = true;
      renderFieldErrors();
      const err = errors();
      if (Object.values(err).some(Boolean)) {
        setFormStatus(missingSummary(err), { alert: true });
        focusFirstProblem(err);
        return;
      }

      state.requestId ??= crypto.randomUUID();
      state.submitting = true;
      setFormStatus(null);
      renderSubmit();

      const reservedDate = state.date;
      const result = await api.reserve({
        requestId: state.requestId,
        date: state.date,
        time: state.time,
        party: state.party,
        duration: state.duration,
        name: el.name.value.trim(),
        phone: el.phone.value,
        email: normalizeEmail(el.email.value),
        comment: el.comment.value.trim() || null,
        acceptedRules: el.rulesCheck.checked,
        turnstileToken: state.token,
      });

      state.submitting = false;

      if (result?.ok) {
        teardown();
        showConfirmation(result.reservation, result.email, normalizeEmail(el.email.value));
        return;
      }

      const code = result?.error ?? 'server';
      // Zerwane połączenie: ta sama próba może zostać ponowiona (ten sam requestId i token).
      if (code !== 'network') {
        state.requestId = null;
        state.token = null;
        state.captcha?.reset();
      }

      if (code === 'slot_taken' || code === 'unavailable') {
        state.time = null;
        if (state.date === reservedDate) fetchSlots();
        renderSummary();
      }

      renderSubmit();
      setFormStatus(errorMessage(code), { alert: true });
    });

    // ——— Potwierdzenie ———

    function emailNote(status, address) {
      if (status === 'sent') return `Potwierdzenie wysłaliśmy na ${address}. Jest w nim przycisk do odwołania rezerwacji.`;
      if (status === 'failed') return 'Rezerwacja jest zapisana, tylko mail z potwierdzeniem nie wyszedł. Odwołać ją możesz telefonicznie.';
      return `Potwierdzenie powinno już być na ${address}.`;
    }

    function showConfirmation(r, emailStatus, address) {
      const heading = h('h3', { tabindex: '-1', text: `Do zobaczenia, ${r.guest_name}.` });
      root.replaceChildren(h('div', { class: 'bk-card' }, h('div', { class: 'bk-done' }, [
        h('p', { class: 'bk-label', text: 'Rezerwacja przyjęta' }),
        heading,
        h('p', { class: 'bk-done-when', text: `${formatLongDate(r.date)} · ${r.time}–${r.end_time} · ${formatPeople(r.party_size)}` }),
        h('p', { text: 'Stolik czeka w Alticcio: Hala Targowa, Plac Dominikański 1, Gdańsk.' }),
        h('p', { text: emailNote(emailStatus, address) }),
        h('p', {}, ['Chcesz coś zmienić? Zadzwoń: ', phoneLink(), '.']),
        h('button', { type: 'button', class: 'bk-again', text: 'Zarezerwuj kolejny stolik', onclick: start }),
      ])));
      heading.focus();
    }

    // ——— Start ———

    el.rules.replaceChildren(...(settings.rules_text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => h('p', { text: line })));

    renderParty();
    renderDurations();
    renderFieldErrors();
    renderSubmit();

    const initial = firstBookableFrom(today);
    if (!initial) {
      renderCalendar();
      renderSummary();
      state.slotsState = 'ready';
      state.slots = [];
      renderSlots();
    } else {
      // Jeśli dziś nie ma już wolnych godzin (np. wieczorem), od razu pokaż najbliższy dzień, w którym są.
      (async () => {
        let date = initial;
        for (let i = 0; i < AUTO_ADVANCE_DAYS && date; i++) {
          const slots = await selectDate(date);
          if (!slots || slots.length > 0 || state.date !== date) return;
          date = firstBookableFrom(addDays(date, 1));
        }
      })();
    }

    api.mountCaptcha(el.captcha, {
      onToken: (token) => { state.token = token; renderSubmit(); },
      onExpire: () => { state.token = null; renderSubmit(); },
      onError: () => {
        state.token = null;
        renderSubmit();
        setFormStatus(['Zabezpieczenie formularza nie działa w tej przeglądarce. Odśwież stronę albo zadzwoń: ', phoneLink(), '.'], { alert: true });
      },
    }).then((captcha) => { state.captcha = captcha; }).catch((err) => {
      console.error('Rezerwacje: Turnstile', err);
      state.captchaFailed = true;
      setFormStatus(['Nie udało się wczytać zabezpieczenia formularza. Odśwież stronę albo zadzwoń: ', phoneLink(), '.'], { alert: true });
    });

    unsubscribe = api.onAvailabilityChange((date) => {
      if (date === state.date && state.slotsState !== 'loading') fetchSlots({ keepTime: true, silent: true });
    });

    // Gdyby połączenie realtime padło w tle — po powrocie do karty odświeżamy godziny.
    onVisible = () => {
      if (document.visibilityState === 'visible' && state.date && state.slotsState !== 'loading') {
        fetchSlots({ keepTime: true, silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
  }

  start();
}
