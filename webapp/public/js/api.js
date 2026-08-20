// Brak wazniej sesji (wygasla, wylogowano w innej karcie) - kazde wywolanie API konczy sie
// 401, wiec to jedno miejsce wystarczy, zeby zawsze odeslac z powrotem na ekran logowania.
// Wyjatek: sam formularz logowania tez leci przez api.post("/api/auth/login", ...), a jego
// 401 (zle haslo) NIE ma przekierowywac - stad sprawdzenie sciezki ponizej.
function handleUnauthorized(url) {
  if (url.startsWith("/api/auth/login")) return false;
  location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
  return true;
}

async function apiFail(res) {
  if (res.status === 401 && handleUnauthorized(res.url.replace(location.origin, ""))) {
    return new Promise(() => {}); // przekierowanie w toku - nie odpalaj dalszej obslugi bledu
  }
  throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
}

const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) return apiFail(res);
    return res.json();
  },
  async patch(url, body) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return apiFail(res);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return apiFail(res);
    return res.json();
  },
  async del(url) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) return apiFail(res);
    return res.json();
  },
  async postForm(url, formData) {
    const res = await fetch(url, { method: "POST", body: formData });
    if (!res.ok) return apiFail(res);
    return res.json();
  },
};

// Linearne ikonki do kafelkow statystyk (stroke, dziedzicza kolor przez currentColor) -
// wspolne dla strony glownej i widoku niszy, zeby styl byl identyczny.
const STAT_ICONS = {
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
};

function statIcon(name) {
  const paths = STAT_ICONS[name];
  if (!paths) return "";
  return `<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function progressClass(pct) {
  if (pct >= 70) return "high";
  if (pct >= 30) return "mid";
  return "low";
}

// Klasa pilnosci terminu wg dni do niego - wspolna dla list na dashboardzie i kolumny
// Reminder w tabeli niszy, zeby te same terminy mialy wszedzie ten sam kolor.
// Skala: 2 dni = zolty, 1 dzien = pomaranczowy, dzis = czerwony, po terminie = mocniejszy czerwony.
function urgencyClass(diffDays) {
  if (diffDays < 0) return "r-overdue";
  if (diffDays === 0) return "r-due";
  if (diffDays === 1) return "r-d1";
  if (diffDays === 2) return "r-d2";
  return "r-future";
}

// created_at z SQLite to UTC ("YYYY-MM-DD HH:MM:SS") - dopiero z "Z" na koncu
// przegladarka przeliczy je na czas lokalny
function noteDateLabel(createdAt) {
  const d = new Date(createdAt.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return createdAt;
  return `${d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
}

// tel: link - Phone Link (Windows) i macOS/iPhone Continuity oba obsluguja ten sam schemat URI,
// wiec dziala identycznie u obu bez zadnej detekcji platformy. Numery PL bez prefiksu -> +48.
// Uzywane na podstronie scheme (script.js), gdzie realnie dzwoni sie z telefonu w naglowku.
function telHref(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 9 ? `+48${digits}` : `+${digits}`;
}

// link "szukaj w Google" po nazwie firmy + miescie - wspolne dla niche.js (kolumna Firma)
// i script.js (naglowek scheme rozmowy)
function companyGoogleSearchHref(lead) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${lead.company_name} ${lead.city}`.trim())}`;
}

// Weekend = "rest day" dla licznika dziennego celu (patrz uzycie w index.js / niche.js) -
// sob/niedz nie ma planu dzwonienia, wiec 0/20 wygladaloby jak zaleglosc, a to po prostu wolne.
function isRestDay() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- avatar (emoji/zdjecie/inicjaly) - wspolne dla login.js (kafelki), auth-widget.js
// (topbar) i index.js (dashboard: kto jest w niszy / czyj to lead) ----------
function initials(user) {
  return (user.display_name || user.username || "?").trim().charAt(0).toUpperCase();
}

function avatarGlyphHtml(user, size) {
  if (user.avatar_kind === "photo" && user.avatar) {
    return `<img class="user-avatar" style="width:${size}px;height:${size}px;" src="${escapeHtml(user.avatar)}" alt="">`;
  }
  const glyph = user.avatar ? user.avatar : initials(user);
  const color = user.color || "#666";
  return `<span class="user-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px;background:${color}22;color:${color};border-color:${color}55;">${escapeHtml(glyph)}</span>`;
}

// ---------- dropdown z kropka koloru (.csel) - wspolne dla niche.js (tabela leadow) i
// script.js (panel boczny scheme rozmowy), zeby oba miejsca mialy identyczny wyglad/zachowanie ----------

// Uniwersalny dropdown. `attr` trafia na kontener (data-field dla wiersza/panelu / data-filter dla paska).
function cselHtml({ attr, options, currentValue, emptyOption = null, currentOverride = null }) {
  const full = emptyOption ? [emptyOption, ...options] : options;
  const current = currentOverride || full.find((o) => o.value === currentValue) || full[0];
  const optsHtml = full
    .map(
      (o) => `
      <div class="csel-option ${o.value === currentValue ? "active" : ""}" data-value="${escapeHtml(o.value)}">
        <span class="dot" style="background:${o.color}"></span>${escapeHtml(o.label)}
      </div>`
    )
    .join("");
  return `
    <div class="csel" ${attr}>
      <div class="csel-trigger" style="color:${current.color}">
        <span class="dot" style="background:${current.color}"></span>${escapeHtml(current.label)}
      </div>
      <div class="csel-menu">${optsHtml}</div>
    </div>
  `;
}

const fieldCsel = (field, options, currentValue, emptyLabel) =>
  cselHtml({
    attr: `data-field="${field}"`,
    options,
    currentValue,
    emptyOption: emptyLabel ? { value: "", label: emptyLabel, color: "#666" } : null,
  });

function closeAllPopovers() {
  document.querySelectorAll(".csel.open, .tags-popover.open").forEach((el) => el.classList.remove("open"));
}

document.addEventListener("click", (e) => {
  document.querySelectorAll(".csel.open, .tags-popover.open").forEach((el) => {
    if (!el.contains(e.target)) el.classList.remove("open");
  });
});

// ikonki platform (proste, generyczne ksztalty - nie kopie oficjalnych logo) do odznak
// tagow (patrz platformBadge ponizej). Jedno miejsce, uzywane w trigger i w menu.
const PLATFORM_ICONS = {
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1.15" fill="white" stroke="none"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="white"><path d="M15.3 8.3h-1.8c-.5 0-.9.4-.9 1V11h2.6l-.4 2.7h-2.2V21h-2.8v-7.3H8.1V11h1.7V9.1c0-2.2 1.4-3.7 3.6-3.7h1.9v2.9z"/></svg>`,
  booksy: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><path d="M8 14l2.2 2.2L16 11.2"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="white"><path d="M9.5 8.3v7.4l6.4-3.7z"/></svg>`,
};

function platformBadge(m, t) {
  return `<span class="platform-badge" style="background:${m.color}" title="${m.name}">${PLATFORM_ICONS[t] || m.label}</span>`;
}

// ---------- tagi platform (IG/FB/Booksy/YT) - popover z checkboxami (.tags-popover),
// wspolne dla niche.js (kolumna Social) i script.js (panel boczny scheme rozmowy).
// `metaData` = obiekt z /api/meta (platformTags/platformMeta) - kazda strona ma swoja
// zmienna `meta`/`panelMeta`, wiec przekazywana jawnie zamiast domykania globala.
function tagsTriggerContent(lead, metaData) {
  const active = metaData.platformTags.filter((t) => lead[`tag_${t}`]);
  if (!active.length) return `<span class="plus">+</span>`;
  return active.map((t) => platformBadge(metaData.platformMeta[t], t)).join("");
}

function tagsMenuContent(lead, metaData) {
  return metaData.platformTags
    .map((t) => {
      const m = metaData.platformMeta[t];
      return `
      <label class="tags-option">
        <input type="checkbox" data-tag-field="tag_${t}" ${lead[`tag_${t}`] ? "checked" : ""}>
        <span class="check">✓</span>
        ${platformBadge(m, t)}
        ${m.name}
      </label>`;
    })
    .join("");
}

// ---------- tlo: pojedyncze latajace drobinki (na kazdej stronie) ----------
function initParticles() {
  const container = document.getElementById("bg-particles");
  if (!container) return;
  const rand = (min, max) => min + Math.random() * (max - min);

  const frag = document.createDocumentFragment();
  for (let i = 0; i < 85; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const dur = rand(8, 18);
    p.style.left = `${rand(0, 100)}%`;
    p.style.top = `${rand(0, 100)}%`;
    p.style.setProperty("--size", `${rand(1.2, 3).toFixed(1)}px`);
    p.style.setProperty("--dx", `${rand(-14, 14).toFixed(1)}vw`);
    p.style.setProperty("--dy", `${rand(-16, 16).toFixed(1)}vh`);
    p.style.setProperty("--dur", `${dur.toFixed(1)}s`);
    p.style.setProperty("--delay", `${-rand(0, dur).toFixed(1)}s`); // ujemne opoznienie = start w losowym momencie lotu
    p.style.setProperty("--tdur", `${rand(3, 7).toFixed(1)}s`);
    p.style.setProperty("--tdelay", `${-rand(0, 7).toFixed(1)}s`);
    p.style.setProperty("--peak", rand(0.25, 0.6).toFixed(2));
    frag.appendChild(p);
  }
  container.appendChild(frag);
}

// ---------- #12: kalendarzyk terminow Google Meet ----------
// Wspolny dla tabeli leadow (niche.js) i panelu na scheme rozmowy (script.js). Zastepuje
// systemowy <input type="datetime-local">, bo tamtego nie da sie pokolorowac - a caly sens
// jest w tym, zeby na czerwono bylo widac dni i godziny, w ktorych TA SAMA osoba ma juz
// umowione spotkanie. Dzieki temu nie da sie przypadkiem wcisnac dwoch Meetow na raz.
//
// "ta sama osoba" = caller wpisany na leadzie, a gdy go jeszcze nie ma - osoba zalogowana.
// Kalendarz Sylwestra i Nikodema sa niezalezne: piatek zajety u jednego nie blokuje drugiego.

let meetsCache = [];

async function loadMeets() {
  try {
    meetsCache = await api.get("/api/upcoming/meets");
  } catch {
    meetsCache = []; // bez listy kalendarz nadal dziala, tylko nic sie nie podswietli na czerwono
  }
}

// godziny do wyboru: 7:00-20:30 co pol godziny - zakres, w ktorym realnie umawiamy spotkania
const MEET_HOURS = (() => {
  const out = [];
  for (let minutes = 7 * 60; minutes <= 20 * 60 + 30; minutes += 30) {
    out.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return out;
})();

const MEET_WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Spotkania TEJ osoby, bez leada, ktory wlasnie edytujemy - inaczej jego wlasny, juz zapisany
// termin swiecilby sie jako kolizja sam ze soba.
function meetsForCaller(caller, excludeLeadId) {
  return meetsCache.filter((m) => m.caller === caller && m.id !== Number(excludeLeadId));
}

let termPickerEl = null;

function closeTermPicker() {
  if (termPickerEl) termPickerEl.remove();
  termPickerEl = null;
}

// value: "YYYY-MM-DDTHH:mm" albo "" | onPick(nowaWartosc) - wolane tez z "" przy czyszczeniu
function openTermPicker({ anchor, value, caller, leadId, onPick }) {
  closeTermPicker();

  const busy = meetsForCaller(caller, leadId);
  const busyByDay = new Map(); // "YYYY-MM-DD" -> [{ time, company }]
  for (const m of busy) {
    const [day, time] = m.google_term.split("T");
    if (!busyByDay.has(day)) busyByDay.set(day, []);
    busyByDay.get(day).push({ time, company: m.company_name });
  }

  const selectedDay = value ? value.slice(0, 10) : "";
  const selectedTime = value ? value.slice(11, 16) : "";
  const start = selectedDay ? new Date(`${selectedDay}T00:00:00`) : new Date();
  const state = { year: start.getFullYear(), month: start.getMonth(), day: selectedDay };

  const pop = document.createElement("div");
  pop.className = "term-pop";
  document.body.appendChild(pop);
  termPickerEl = pop;

  function render() {
    const first = new Date(state.year, state.month, 1);
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    // getDay(): 0 = niedziela, a nasza siatka zaczyna sie od poniedzialku
    const offset = (first.getDay() + 6) % 7;
    const todayIso = isoDay(new Date());

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<span class="term-day empty"></span>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoDay(new Date(state.year, state.month, d));
      const dayMeets = busyByDay.get(iso) || [];
      const classes = [
        "term-day",
        dayMeets.length ? "busy" : "",
        iso === state.day ? "selected" : "",
        iso === todayIso ? "today" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const title = dayMeets.length
        ? `${escapeHtml(caller)}: ${dayMeets.map((m) => `${m.time} ${m.company}`).join(", ")}`
        : "";
      cells.push(`<button type="button" class="${classes}" data-term-day="${iso}" title="${title}">${d}</button>`);
    }

    const dayMeets = state.day ? busyByDay.get(state.day) || [] : [];
    const takenAt = new Map(dayMeets.map((m) => [m.time, m.company]));
    const hours = state.day
      ? MEET_HOURS.map((h) => {
          const taken = takenAt.get(h);
          const classes = ["term-hour", taken ? "busy" : "", h === selectedTime && state.day === selectedDay ? "selected" : ""]
            .filter(Boolean)
            .join(" ");
          const title = taken ? `Zajęte: ${escapeHtml(taken)}` : "";
          return `<button type="button" class="${classes}" data-term-hour="${h}" title="${title}">${h}</button>`;
        }).join("")
      : `<div class="term-hint">Wybierz dzień, żeby zobaczyć godziny.</div>`;

    const monthLabel = first.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

    pop.innerHTML = `
      <div class="term-head">
        <button type="button" class="term-nav" data-term-nav="-1" title="Poprzedni miesiąc">‹</button>
        <span class="term-month">${monthLabel}</span>
        <button type="button" class="term-nav" data-term-nav="1" title="Następny miesiąc">›</button>
      </div>
      <div class="term-owner">Kalendarz: <b>${escapeHtml(caller || "—")}</b> · na czerwono zajęte</div>
      <div class="term-grid">
        ${MEET_WEEKDAYS.map((d) => `<span class="term-dow">${d}</span>`).join("")}
        ${cells.join("")}
      </div>
      <div class="term-hours">${hours}</div>
      <div class="term-foot">
        <button type="button" class="btn" data-term-clear>Wyczyść termin</button>
        <button type="button" class="btn" data-term-close>Zamknij</button>
      </div>
    `;
    position();
  }

  // dymek pod polem, a gdy nie miesci sie na dole ekranu - nad nim; zawsze w granicach okna
  function position() {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    const below = r.bottom + 6;
    pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  }

  pop.addEventListener("click", (e) => {
    // Kazdy klik w kalendarzu przerysowuje jego wnetrze, wiec zanim zdarzenie dojdzie do
    // globalnego "klik poza zamyka", klikniety element juz nie istnieje w DOM - i dymek
    // zamykalby sie sam przy wyborze dnia. Stad zatrzymanie propagacji tutaj.
    e.stopPropagation();

    const nav = e.target.closest("[data-term-nav]");
    if (nav) {
      const delta = Number(nav.dataset.termNav);
      const moved = new Date(state.year, state.month + delta, 1);
      state.year = moved.getFullYear();
      state.month = moved.getMonth();
      return render();
    }

    const day = e.target.closest("[data-term-day]");
    if (day) {
      state.day = day.dataset.termDay;
      return render();
    }

    const hour = e.target.closest("[data-term-hour]");
    if (hour) {
      onPick(`${state.day}T${hour.dataset.termHour}`);
      return closeTermPicker();
    }

    if (e.target.closest("[data-term-clear]")) {
      onPick("");
      return closeTermPicker();
    }
    if (e.target.closest("[data-term-close]")) closeTermPicker();
  });

  render();
}

document.addEventListener("click", (e) => {
  if (termPickerEl && !termPickerEl.contains(e.target) && !e.target.closest("[data-term-open]")) closeTermPicker();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTermPicker();
});
window.addEventListener("resize", closeTermPicker);

// etykieta na guziku otwierajacym kalendarz - dopoki nic nie wybrano pokazujemy sama ikonke
// (bez tekstu "-ustaw-"), zeby pusta kolumna nie krzyczala tekstem u kazdego leada na raz
function termLabel(value) {
  if (!value) return "📅";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
}
