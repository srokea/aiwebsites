// #7 - widok kalendarza. Dzien z Google Meetem = cala komorka podswietlona na czerwono
// (wariant "Podswietlenie dnia"), oddzwonienie = mala niebieska kropka; oba naraz = czerwona
// komorka + niebieska kropka. Dane: GET /api/calendar?month=YYYY-MM (wszystkie nisze).

initParticles();

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const gridEl = document.getElementById("cal-grid");
const monthEl = document.getElementById("cal-month");
const detailEl = document.getElementById("cal-day-detail");

const now = new Date();
const state = { year: now.getFullYear(), month: now.getMonth(), selected: "" };
let byDate = new Map(); // "YYYY-MM-DD" -> { meets, callbacks, items: [] }

const pad = (n) => String(n).padStart(2, "0");
// (api.js ma juz globalne isoDay(Date) - tu wersja z (rok, miesiac, dzien), inna nazwa)
const dayIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = dayIso(now.getFullYear(), now.getMonth(), now.getDate());

function fmtDatePl(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
}

async function load() {
  const month = `${state.year}-${pad(state.month + 1)}`;
  monthEl.textContent = new Date(state.year, state.month, 1).toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  byDate = new Map();
  try {
    const { items } = await api.get(`/api/calendar?month=${month}`);
    for (const it of items) {
      if (!byDate.has(it.date)) byDate.set(it.date, { meets: 0, callbacks: 0, items: [] });
      const bucket = byDate.get(it.date);
      bucket.items.push(it);
      if (it.kind === "meet") bucket.meets++;
      else bucket.callbacks++;
    }
  } catch (err) {
    gridEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
    return;
  }
  renderGrid();
  if (state.selected && state.selected.slice(0, 7) === month) renderDetail(state.selected);
  else detailEl.innerHTML = `<div class="empty-state">Kliknij dzień w kalendarzu.</div>`;
}

function renderGrid() {
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const offset = (new Date(state.year, state.month, 1).getDay() + 6) % 7;

  const cells = WEEKDAYS.map((d) => `<span class="cal-dow">${d}</span>`);
  for (let i = 0; i < offset; i++) cells.push(`<span class="cal-day empty"></span>`);

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = dayIso(state.year, state.month, d);
    const info = byDate.get(iso);
    const cls = [
      "cal-day",
      info && info.meets ? "cal-day--meet" : "",
      iso === todayIso ? "cal-day--today" : "",
      iso === state.selected ? "cal-day--selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    // jedna kropka na oddzwonienie (3 telefony -> 3 kropki), max 6 + "+N"
    let dots = "";
    if (info && info.callbacks) {
      const shown = Math.min(info.callbacks, 6);
      dots =
        `<span class="cal-callback-dots" title="${info.callbacks} oddzwonień">` +
        '<span class="cal-dot-callback"></span>'.repeat(shown) +
        (info.callbacks > 6 ? `<span class="cal-callback-more">+${info.callbacks - 6}</span>` : "") +
        "</span>";
    }
    const meetCount = info && info.meets ? `<span class="cal-meet-count">${info.meets}</span>` : "";
    // pod numerem dnia: godzina + firma kazdego Meeta (max 2 wiersze, reszta jako "+N")
    let meta = "";
    if (info && info.meets) {
      const meetItems = info.items.filter((it) => it.kind === "meet");
      const lines = meetItems
        .slice(0, 2)
        .map((it) => `<span>${escapeHtml((it.time ? it.time + " · " : "") + it.company)}</span>`);
      if (meetItems.length > 2) lines.push(`<span>+${meetItems.length - 2} więcej</span>`);
      meta = `<span class="cal-day-meta">${lines.join("")}</span>`;
    }
    cells.push(
      `<button type="button" class="${cls}" data-day="${iso}"><span class="cal-daynum">${d}</span>${meetCount}${meta}${dots}</button>`
    );
  }
  gridEl.innerHTML = cells.join("");
}

function renderDetail(iso) {
  const info = byDate.get(iso);
  const head = `<div class="cal-detail-head">${fmtDatePl(iso)}</div>`;
  if (!info || !info.items.length) {
    detailEl.innerHTML = head + `<div class="empty-state">Nic zaplanowanego.</div>`;
    return;
  }
  const rows = info.items
    .map(
      (it) => `
      <a class="cal-detail-row" href="/script.html?leadId=${it.lead_id}">
        <span class="cal-detail-kind ${it.kind}">${it.kind === "meet" ? "Meet" : "Oddzwoń"}</span>
        <span class="cal-detail-time">${escapeHtml(it.time || "—")}</span>
        <span class="cal-detail-company">${escapeHtml(it.company)}</span>
        <span class="cal-detail-niche">${escapeHtml(it.niche_name)}${it.caller ? " · " + escapeHtml(it.caller) : ""}</span>
      </a>`
    )
    .join("");
  detailEl.innerHTML = head + rows;
}

gridEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-day]");
  if (!btn) return;
  state.selected = btn.dataset.day;
  renderGrid();
  renderDetail(state.selected);
});

document.getElementById("cal-prev").addEventListener("click", () => {
  const d = new Date(state.year, state.month - 1, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  load();
});
document.getElementById("cal-next").addEventListener("click", () => {
  const d = new Date(state.year, state.month + 1, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  load();
});

load();
