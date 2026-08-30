const params = new URLSearchParams(location.search);
const slug = params.get("slug");
if (!slug) location.href = "/";

let meta = null;
let leads = [];
let currentNiche = null;
let sortState = { id: null, field: null, dir: "asc" };
// kazdy filtr to lista wartosci (multi-select) - pusta lista = brak filtra na tym polu
let filters = { interested: [], caller: [], answered: [], quality: [] };
let searchQuery = "";
let highlightStatuses = new Set();
// wlaczany klikiem w karte "Do zrobienia" - pokazuje tylko leady, ktore licza sie do tej metryki
let todoFilter = false;

// Dokladnie ta sama regula co licznik "todo" na serwerze (eligible - called, patrz
// STATS_ELIGIBLE_SQL w leadStatus.js): jakosc nie "6" (ma wlasna strone) ani "0" (tragiczny
// lead) i jeszcze nie zadzwoniony.
const isTodoLead = (l) => l.quality !== "6" && l.quality !== "0" && !l.called_at;

// Kolejnosc sortowania dla "Odebral?" - od pustego, przez Nie, po Tak.
const ANSWERED_SORT_ORDER = ["", "Nie", "Tak"];
// Zmiana tych pol moze przestawic licznik "zadzwonionych" w naglowku (patrz server/leadStatus.js)
const COUNTER_FIELDS = new Set(["caller", "answered", "interested"]);
// Zmiana tych pol (osobno od COUNTER_FIELDS) moze przestawic "eligible"/"do zrobienia" -
// wplywaja na STATS_ELIGIBLE_SQL, ale nie licza sie jako "dzwonienie" (bez rememberLastLead)
const ELIGIBILITY_FIELDS = new Set(["quality"]);

const callerColor = (name) => meta.callerColors[name] || "#888";
const callerOptions = () => meta.callers.map((c) => ({ value: c, label: c, color: callerColor(c) }));

// Warianty z pusta wartoscia TYLKO dla paska filtrow - dropdown w wierszu ma juz swoj wlasny
// "—" przez emptyLabel w fieldCsel, wiec dopisywanie go tutaj tez zdublowaloby go na liscie.
// multiFilterHtml nie ma odpowiednika emptyLabel, wiec pusta opcja musi wejsc do listy wprost.
const callerFilterOptions = () => [{ value: "", label: "—", color: "#666" }, ...callerOptions()];
const answeredFilterOptions = () => [{ value: "", label: "(Puste)", color: "#666" }, ...meta.answeredOptions];

// Wall Street gify na dopiecie leada - bo trzeba to swietowac
const DEAL_GIFS = [
  "https://media.giphy.com/media/119pLwyWg8ScTK/giphy.gif",
  "https://media.giphy.com/media/THPgJoJYBCfZu/giphy.gif",
  "https://media.giphy.com/media/hs8SqOYWARxO8/giphy.gif",
  "https://media.giphy.com/media/8Q31McooUHTNu/giphy.gif",
];

function celebrateDeal() {
  const overlay = document.createElement("div");
  overlay.className = "deal-overlay";
  const gif = DEAL_GIFS[Math.floor(Math.random() * DEAL_GIFS.length)];
  overlay.innerHTML = `
    <div class="deal-card">
      <div class="deal-title">💰 DOPIĘTE! 💰</div>
      <img src="${gif}" alt="Dopiete!">
    </div>
  `;
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 4000);
}

async function init() {
  initParticles();
  try {
    meta = await api.get("/api/meta");
    highlightStatuses = new Set(meta.interestedOptions.filter((o) => o.highlight).map((o) => o.value));
    restoreViewState(); // zanim narysujemy pasek filtrow i tabele - patrz nizej
    renderFilterBar();
    document.getElementById("export-csv-btn").href = `/api/niches/${encodeURIComponent(slug)}/export.csv`;
    const savedActive = recallLastLead();
    activeRowId = savedActive ? Number(savedActive) : null;
    await loadNicheHeader();
    await loadLeads();
    await loadFilterSets(); // wymaga currentNiche.id, wiec po naglowku niszy
    await loadMeets(); // zajete terminy do kalendarzyka przy kolumnie "Termin Google" (#12)
    renderFilterBar(); // ponownie: dopiero teraz mamy zaladowane zestawy filtrow (loadFilterSets)
    startPresencePolling();
    // zglaszamy obecnosc od razu: albo na konkretnym leadzie (jesli activeRowId przetrwal
    // odswiezenie - inaczej dymek u innych zniknalby na chwile), albo lead_id=0 = "jestem
    // w tej niszy" (dashboard: GET /api/presence/summary), zeby bylo widac to bez klikania
    pingPresence(activeRowId || 0);

    const focusId = params.get("lead");
    if (focusId) focusLeadRow(focusId);
    else restoreScroll(); // wejscie z dashboardu ma wlasny scroll do wiersza - nie nadpisujemy go
  } catch (err) {
    // np. nisza usunieta w innej karcie albo zly link - lepiej pokazac komunikat niz pusta strone
    document.getElementById("niche-title").textContent = "Nie udało się wczytać niszy";
    document.getElementById("niche-sub").textContent = err.message;
    document.getElementById("leads-tbody").innerHTML =
      `<tr><td colspan="14"><div class="empty-state">${escapeHtml(err.message)} — <a href="/" style="color:var(--blue)">wróć do listy nisz</a></div></td></tr>`;
  }
}

async function loadNicheHeader() {
  const niche = await api.get(`/api/niches/${encodeURIComponent(slug)}`);
  currentNiche = niche;

  const titleEl = document.getElementById("niche-title");
  titleEl.textContent = niche.name;
  titleEl.style.color = niche.color || "";
  document.title = `${niche.name} — Cold Calls`;
  // liczniki wzgledem "eligible" - leadow bez wlasnej strony (por. STATS_ELIGIBLE_SQL na serwerze)
  document.getElementById("niche-sub").textContent = `${niche.called}/${niche.eligible} zadzwonionych · ${niche.todo} do zrobienia`;

  const pct = niche.eligible ? Math.round((niche.called / niche.eligible) * 100) : 0;
  // "Wszystkich" pokazuje eligible, nie surowy total - inaczej nie sumowaloby sie do
  // "Zadzwonionych" + "Do zrobienia" (patrz to samo w index.js/loadStats). Prawdziwy total
  // (razem z leadami z wlasna strona) zostaje w danych - uzywa go np. potwierdzenie usuniecia niszy.
  document.getElementById("niche-stats").innerHTML = `
    <div class="stat-card"><div class="num">${niche.eligible}</div><div class="label">${statIcon("layers")}Wszystkich</div></div>
    <div class="stat-card"><div class="num">${niche.called}</div><div class="label">${statIcon("check")}Zadzwonionych</div></div>
    <button type="button" class="stat-card stat-card-btn ${todoFilter ? "active" : ""}" id="todo-card"
      title="${todoFilter ? "Pokaż wszystkie leady" : "Pokaż tylko leady do zrobienia"}" aria-pressed="${todoFilter}">
      <div class="num">${niche.todo}</div><div class="label">${statIcon("list")}Do zrobienia</div>
    </button>
    <div class="stat-card"><div class="num">${pct}%</div><div class="label">${statIcon("trend")}Postęp</div></div>
  `;

  const maxCaller = Math.max(1, ...niche.byCaller.map((c) => c.c));
  const topCount = Math.max(0, ...niche.byCaller.map((c) => c.c));
  const bars = meta.callers
    .map((name) => {
      const count = niche.byCaller.find((c) => c.caller === name)?.c || 0;
      const w = Math.round((count / maxCaller) * 100);
      // % tej osoby wzgledem wszystkich LICZONYCH leadow w niszy (bez majacych wlasna strone)
      const pctOfTotal = niche.eligible ? Math.round((count / niche.eligible) * 100) : 0;
      const color = callerColor(name);
      const crown = topCount > 0 && count === topCount ? `<span class="crown" title="Lider">👑</span>` : "";
      return `
        <div class="caller-bar-row with-pct">
          <span style="color:${color}; font-weight:600;">${crown}${escapeHtml(name)}</span>
          <div class="caller-bar-track"><div class="caller-bar-fill" style="width:${w}%; background:${color};"></div></div>
          <span class="caller-bar-count">${count}</span>
          <span class="caller-bar-pct" style="color:${color}">${pctOfTotal}%</span>
        </div>
      `;
    })
    .join("");

  document.getElementById("caller-row").innerHTML = `
    <div class="caller-bars" style="flex:1">
      <div class="section-title" style="margin-bottom:2px">Zadzwonione wg osoby</div>
      ${bars}
    </div>
  `;

  const badge = document.getElementById("daily-badge");
  badge.style.display = "block";
  badge.innerHTML = isRestDay()
    ? `<span class="n">💤</span> rest day`
    : `<span class="n">${niche.calledToday}</span>/${meta.dailyGoal} dzisiaj`;
}

async function loadLeads() {
  leads = await api.get(`/api/niches/${encodeURIComponent(slug)}/leads`);
  renderLeads();
}

// ---------- filtr "Do zrobienia" (klik w karte metryki) ----------

function setTodoFilter(on) {
  todoFilter = on;
  const card = document.getElementById("todo-card");
  if (card) {
    card.classList.toggle("active", on);
    card.setAttribute("aria-pressed", String(on));
    card.title = on ? "Pokaż wszystkie leady" : "Pokaż tylko leady do zrobienia";
  }
}

// delegacja na kontenerze - karty przebudowuja sie przy kazdym loadNicheHeader()
document.getElementById("niche-stats").addEventListener("click", (e) => {
  if (!e.target.closest("#todo-card")) return;
  setTodoFilter(!todoFilter);
  saveViewState();
  renderLeads();
});

// Reminder patrzy na dwa terminy - "Kiedy oddzwonic" i "Termin Google" - i pokazuje ten,
// ktory jest blizej (chronologicznie pierwszy), z etykieta zalezna od tego ktory to termin.
function reminderInfo(lead) {
  const candidates = [
    // #8 - callback_when bywa teraz "YYYY-MM-DDTHH:MM" (opcjonalna godzina), Reminder patrzy
    // na sam dzien, wiec obcinamy do 10 znakow tak samo jak google_term
    lead.callback_when && { raw: lead.callback_when.slice(0, 10), kind: "Oddzwoń" },
    lead.google_term && { raw: lead.google_term.slice(0, 10), kind: "Google" },
  ]
    .filter(Boolean)
    .map((c) => ({ ...c, date: new Date(c.raw + "T00:00:00") }))
    .filter((c) => !isNaN(c.date.getTime()))
    .sort((a, b) => a.date - b.date);

  if (!candidates.length) return { cls: "r-none", text: "—" };

  const { kind, date } = candidates[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date - today) / 86400000);

  // kolor wg pilnosci (wspolna skala z dashboardem - patrz urgencyClass w api.js)
  const cls = urgencyClass(diffDays);
  if (diffDays > 0) return { cls, text: `${kind} za ${diffDays} ${diffDays === 1 ? "dzień" : "dni"}` };
  if (diffDays === 0) return { cls, text: `${kind} dziś!` };
  return { cls, text: kind === "Google" ? "Google minął!" : "Oddzwoń!" };
}

function formatPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ---------- filtry (multi-select) + sortowanie ----------

function renderFilterBar() {
  document.getElementById("filter-bar").innerHTML = `
    ${filterSetsHtml()}
    ${multiFilterHtml("interested", "Zainteresowany", meta.interestedOptions)}
    ${multiFilterHtml("caller", "Kto dzwonił", callerFilterOptions())}
    ${multiFilterHtml("answered", "Odebrał", answeredFilterOptions())}
    ${multiFilterHtml("quality", "Jakość", meta.qualityOptions)}
    <button type="button" class="btn" id="filter-clear" style="margin-left:4px;">Wyczyść filtry</button>
  `;
  document.getElementById("filter-clear").addEventListener("click", () => {
    filters = { interested: [], caller: [], answered: [], quality: [] };
    setTodoFilter(false);
    saveViewState();
    renderFilterBar();
    renderLeads();
  });
}

const FILTER_OPTIONS = {}; // key -> options[], zapamietane zeby odswiezyc sam trigger po zmianie checkboxa

// Trigger pokazuje jedna kropke na kazdy zaznaczony status (w jego kolorze) + etykiety
// (max 2, potem "+N") - menu to lista checkboxow, wiec mozna laczyc dowolnie np. Dopiete + SMS.
function filterTrigger(key, options) {
  const selected = filters[key];
  if (!selected.length) {
    return { color: "#999", html: `<span class="dot" style="background:#999"></span>Wszystkie` };
  }
  const dots = `<span class="dot-group">${selected
    .map((v) => `<span class="dot" style="background:${options.find((o) => o.value === v)?.color || "#999"}"></span>`)
    .join("")}</span>`;
  const label =
    selected.length <= 2
      ? selected.map((v) => options.find((o) => o.value === v)?.label || v).join(", ")
      : `${options.find((o) => o.value === selected[0])?.label || selected[0]} +${selected.length - 1}`;
  const mainColor = options.find((o) => o.value === selected[0])?.color || "#999";
  return { color: mainColor, html: `${dots}${escapeHtml(label)}` };
}

function refreshFilterTrigger(key) {
  const box = document.querySelector(`.tags-popover[data-filter="${key}"]`);
  if (!box) return;
  const trigger = box.querySelector(".csel-trigger");
  const { color, html } = filterTrigger(key, FILTER_OPTIONS[key]);
  trigger.style.color = color;
  trigger.innerHTML = html;
}

function multiFilterHtml(key, label, options) {
  FILTER_OPTIONS[key] = options;
  const selected = filters[key];
  const optsHtml = options
    .map(
      (o) => `
      <label class="tags-option">
        <input type="checkbox" data-filter-value="${escapeHtml(o.value)}" ${selected.includes(o.value) ? "checked" : ""}>
        <span class="check">✓</span>
        <span class="dot" style="background:${o.color}"></span>
        ${escapeHtml(o.label)}
      </label>`
    )
    .join("");

  const trigger = filterTrigger(key, options);
  return `
    <div class="filter-group">
      <span class="filter-label">${label}</span>
      <div class="tags-popover" data-filter="${key}">
        <div class="csel-trigger" style="color:${trigger.color}">${trigger.html}</div>
        <div class="tags-menu">${optsHtml}</div>
      </div>
    </div>
  `;
}

function sortValue(lead, field) {
  switch (field) {
    case "quality":
      return Number(lead.quality) || 0;
    case "tags_count":
      return meta.platformTags.reduce((n, t) => n + (lead[`tag_${t}`] ? 1 : 0), 0);
    // pola kategoryczne sortujemy wg kolejnosci opcji (logicznej), a nie alfabetycznie
    case "interested":
      return meta.interestedOptions.findIndex((o) => o.value === lead.interested);
    case "caller":
      return meta.callers.indexOf(lead.caller);
    case "answered":
      return ANSWERED_SORT_ORDER.indexOf(lead.answered);
    case "phone":
      return lead.phone.replace(/\D/g, "");
    // kolumna Reminder pokazuje blizszy z dwoch terminow (patrz reminderInfo), wiec sortuje
    // sie po tym samym - nie tylko po callback_when, inaczej rozjezdza sie z tym co widac
    case "reminder_effective": {
      const dates = [
        lead.callback_when ? lead.callback_when.slice(0, 10) : "",
        lead.google_term ? lead.google_term.slice(0, 10) : "",
      ]
        .filter(Boolean)
        .map((d) => new Date(d + "T00:00:00").getTime())
        .filter((t) => !isNaN(t));
      return dates.length ? Math.min(...dates) : Number.MAX_SAFE_INTEGER;
    }
    // stare importy CSV czasem wsadzily do tych pol tekst zamiast daty (np. "za tydzien") -
    // sortowanie jako string ustawialoby je losowo wsrod prawdziwych dat, wiec parsujemy
    // i wszystko nieprawidlowe/puste ladowanie na koniec, zamiast alfabetycznie
    case "callback_when": {
      const t = lead.callback_when ? new Date(lead.callback_when.slice(0, 10) + "T00:00:00").getTime() : NaN;
      return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    }
    case "attempts_count":
      return lead.attempts_count || 0;
    case "google_term": {
      const t = lead.google_term ? new Date(lead.google_term).getTime() : NaN;
      return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    }
    default:
      return lead[field] || "";
  }
}

function matchesSearch(lead, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const digitsQuery = query.replace(/\D/g, "");
  const nameMatch = lead.company_name.toLowerCase().includes(q);
  const cityMatch = (lead.city || "").toLowerCase().includes(q);
  const phoneMatch = digitsQuery.length > 0 && lead.phone.replace(/\D/g, "").includes(digitsQuery);
  return nameMatch || cityMatch || phoneMatch;
}

function getVisibleLeads() {
  const list = leads.filter(
    (l) =>
      (!todoFilter || isTodoLead(l)) &&
      Object.entries(filters).every(([field, values]) => !values.length || values.includes(l[field])) &&
      matchesSearch(l, searchQuery)
  );

  if (!sortState.field) return list;

  const dir = sortState.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = sortValue(a, sortState.field);
    const bv = sortValue(b, sortState.field);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv), "pl") * dir;
  });
}

// Czy zmiana tych pol moze przestawic wiersz (sortowanie) albo go ukryc (filtr)?
// Jesli nie - wystarczy odswiezyc sam wiersz zamiast przebudowywac cala tabele.
function affectsOrdering(fields) {
  // przy aktywnym filtrze "Do zrobienia" zmiana pol wplywajacych na status zrobienia
  // (COUNTER_FIELDS) albo na eligibility (ELIGIBILITY_FIELDS) moze usunac wiersz z listy
  if (todoFilter && fields.some((f) => COUNTER_FIELDS.has(f) || ELIGIBILITY_FIELDS.has(f))) return true;
  return fields.some((field) => {
    const sortKey = field.startsWith("tag_") ? "tags_count" : field;
    return sortKey === sortState.field || (field in filters && filters[field].length > 0);
  });
}

// ---------- zapamietany widok niszy (sortowanie + filtry) ----------
// Kazda nisza ma wlasny zapis: w Fryzjerach mozesz miec sortowanie po jakosci, a w
// Kosmetyczkach po czym innym i z wlasnymi filtrami - jedno drugiego nie nadpisuje.
// Stan przezywa odswiezenie strony (localStorage). Wyszukiwarka celowo sie nie zapisuje -
// to doraznie szukanie konkretnej firmy, nie ustawienie widoku.
const VIEW_STORAGE_KEY = `coldcalls.view.${slug}`;

// ---------- ostatnio dzwoniony lead (przezywa odswiezenie) ----------
// Ten sam mechanizm co wejscie z dashboardu (?lead=<id>, patrz focusLeadRow) - tylko zamiast
// linku z panelu "Najblizsze" zrodlem jest ostatnia akcja dzwonienia (Kto dzwonil / Odebral /
// Status) w tej samej niszy. Dzieki temu odswiezenie w trakcie sesji wraca w to samo miejsce.
const LAST_LEAD_KEY = `coldcalls.lastLead.${slug}`;

function rememberLastLead(id) {
  try {
    localStorage.setItem(LAST_LEAD_KEY, String(id));
  } catch {
    // np. tryb prywatny bez dostepu do localStorage - po prostu nie zapamietamy pozycji
  }
}

function recallLastLead() {
  try {
    return localStorage.getItem(LAST_LEAD_KEY);
  } catch {
    return null;
  }
}

function forgetLastLead() {
  try {
    localStorage.removeItem(LAST_LEAD_KEY);
  } catch {
    // patrz rememberLastLead - brak localStorage nie jest bledem, po prostu nic nie zapamietamy
  }
}

// ---------- powrot na to samo miejsce (scheme rozmowy -> nisza) ----------
// Pozycja scrolla per nisza w sessionStorage: wyjscie w scheme i powrot "<- Powrot" to dwie
// pelne nawigacje, wiec bez tego zawsze ladujemy na gorze tabeli - przy 300 leadach to bolesne.
const SCROLL_KEY = `coldcalls.scroll.${slug}`;

function rememberScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
  } catch {
    // jak wyzej - brak sessionStorage tylko wylacza pamiec pozycji
  }
}

function restoreScroll() {
  try {
    const y = Number(sessionStorage.getItem(SCROLL_KEY));
    if (y > 0) window.scrollTo(0, y);
  } catch {
    // ignorujemy
  }
}

function saveViewState() {
  try {
    localStorage.setItem(
      VIEW_STORAGE_KEY,
      JSON.stringify({ sort: { id: sortState.id, dir: sortState.dir }, filters, todo: todoFilter })
    );
  } catch {
    // np. tryb prywatny bez dostepu do localStorage - UI ma dzialac mimo to
  }
}

function applySortIndicators() {
  document.querySelectorAll("th.sortable").forEach((el) => {
    el.classList.toggle("sort-asc", el.dataset.sortId === sortState.id && sortState.dir === "asc");
    el.classList.toggle("sort-desc", el.dataset.sortId === sortState.id && sortState.dir === "desc");
  });
}

// Wolane PRZED pierwszym renderem paska filtrow i tabeli, zeby od razu wyswietlily sie
// z przywroconym stanem (bez mrugniecia niesortowana lista).
function restoreViewState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || "null");
  } catch {
    return; // uszkodzony wpis nie moze wywalic calej strony
  }
  if (!saved) return;

  // kolumna musi nadal istniec w tabeli - inaczej zapis ze starszej wersji UI
  // sortowalby po polu, ktorego juz nie ma
  const th = saved.sort?.id && document.querySelector(`th.sortable[data-sort-id="${saved.sort.id}"]`);
  if (th) {
    sortState = { id: saved.sort.id, field: th.dataset.sort, dir: saved.sort.dir === "desc" ? "desc" : "asc" };
    applySortIndicators();
  }

  // bierzemy tylko znane pola filtrow i tylko wartosci, ktore nadal istnieja w /api/meta
  // ("" dopisane recznie do caller/answered - patrz callerFilterOptions/answeredFilterOptions,
  // multiFilterHtml nie ma pojecia pustej opcji jak fieldCsel, wiec /api/meta o niej nie wie)
  const allowed = {
    interested: meta.interestedOptions.map((o) => o.value),
    caller: ["", ...meta.callers],
    answered: ["", ...meta.answeredOptions.map((o) => o.value)],
    quality: meta.qualityOptions.map((o) => o.value),
  };
  for (const [key, values] of Object.entries(allowed)) {
    const savedValues = saved.filters?.[key];
    if (Array.isArray(savedValues)) filters[key] = savedValues.filter((v) => values.includes(v));
  }

  todoFilter = Boolean(saved.todo);
}

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    // identyfikujemy po kolumnie, nie po polu - dwie kolumny moga sortowac po tym samym polu
    // (Reminder i Kiedy oddzwonic), a strzalka ma sie zapalic tylko na klikanej
    const id = th.dataset.sortId;
    if (sortState.id === id) sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    else sortState = { id, field: th.dataset.sort, dir: "asc" };

    applySortIndicators();
    saveViewState();
    renderLeads();
  });
});

// ---------- render ----------

function renderLeads() {
  const tbody = document.getElementById("leads-tbody");
  const visible = getVisibleLeads();
  if (!visible.length) {
    const msg = todoFilter ? "Nic do zrobienia — wszystko obdzwonione. 🎉" : "Brak leadow spelniajacych kryteria.";
    tbody.innerHTML = `<tr><td colspan="15"><div class="empty-state">${msg}</div></td></tr>`;
    updateScrollHint();
    return;
  }
  tbody.innerHTML = visible.map((lead, i) => rowHtml(lead, i + 1)).join("");
  renderPresenceBadges();
  applyActiveRowClass();
  updateScrollHint();
}

// #iPad - podpowiedz "da sie przewinac tabele w bok" (patrz .table-scroll-hint w style.css):
// widoczna tylko dopoki tabela faktycznie nie miesci sie na ekranie I nikt jeszcze nie
// przewinal w prawo - zwykly wzorzec "wskazowki swipe", ktora znika po pierwszym uzyciu.
function updateScrollHint() {
  const scroller = document.getElementById("leads-scroll");
  const hint = document.getElementById("table-scroll-hint");
  if (!scroller || !hint) return;
  const overflowing = scroller.scrollWidth > scroller.clientWidth + 2;
  hint.classList.toggle("show", overflowing && scroller.scrollLeft < 4);
}

document.getElementById("leads-scroll")?.addEventListener("scroll", updateScrollHint);
window.addEventListener("resize", updateScrollHint);

function renderSingleRow(lead) {
  const tr = document.querySelector(`tr[data-id="${lead.id}"]`);
  if (!tr) return renderLeads();
  tr.outerHTML = rowHtml(lead, tr.querySelector(".idx-num")?.textContent || "");
  renderPresenceBadges();
  applyActiveRowClass();
}

// ---------- "na czym teraz jestem" - trwaly wskaznik ostatnio klikanego wiersza ----------
// Wlasny, prywatny stan (nie ma nic wspolnego z dymkiem "kto tu jest" dla innych) -
// przezywa odswiezenie strony (ten sam mechanizm co LAST_LEAD_KEY/recallLastLead nizej),
// zeby po powrocie do niszy od razu bylo widac, ktory lead byl ostatnio kliknietym.
let activeRowId = null;

function setActiveRow(id) {
  activeRowId = id;
  rememberLastLead(id);
  applyActiveRowClass();
}

// Odklikniecie ("juz sie tym leadem nie zajmuje") - klik w kolumne "#" aktywnego wiersza.
// Zdejmuje i Twoje podswietlenie, i dymek "kto tu jest" u pozostalych: lead_id=0 znaczy
// "jestem w tej niszy, ale nie na konkretnym leadzie" (patrz server/routes/presence.js).
function clearActiveRow() {
  activeRowId = null;
  forgetLastLead();
  applyActiveRowClass();
  pingPresence(0);
}

function applyActiveRowClass() {
  document.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.classList.toggle("row-active", Number(tr.dataset.id) === activeRowId);
  });
}

// ---------- "kto tu jest" - kolizja dwoch osob na tym samym leadzie ----------
// Klik gdziekolwiek w wierszu = "ja teraz na to patrze" (zapis, throttlowany per lead).
// Co 4s odpytujemy, kto INNY jest aktywny na leadach tej niszy, i pokazujemy dymek
// nad nazwa firmy (patrz .presence-badge w style.css) - ambientowo, bez klikania.
let presenceMap = new Map(); // lead_id -> { display_name, color }
let lastPresencePing = { leadId: null, time: 0 };
let presencePollTimer = null;

async function pingPresence(leadId) {
  if (!currentNiche) return;
  const now = Date.now();
  if (lastPresencePing.leadId === leadId && now - lastPresencePing.time < 3000) return;
  lastPresencePing = { leadId, time: now };
  try {
    await api.post("/api/presence", { lead_id: leadId, niche_id: currentNiche.id });
  } catch {
    // best-effort - brak zapisu obecnosci nie powinien przerywac pracy z leadem
  }
}

function renderPresenceBadges() {
  document.querySelectorAll("tr[data-id]").forEach((tr) => {
    const leadId = Number(tr.dataset.id);
    const badge = tr.querySelector(".presence-badge");
    const idxCol = tr.querySelector(".idx-col");
    const info = presenceMap.get(leadId);

    if (!info) {
      if (badge) badge.style.display = "none";
      if (idxCol) {
        idxCol.classList.remove("idx-presence");
        idxCol.style.color = "";
      }
      return;
    }

    const color = info.color || "#888";
    if (badge) {
      badge.textContent = info.display_name;
      badge.style.color = color;
      badge.style.background = `${color}22`;
      badge.style.borderColor = `${color}66`;
      badge.style.display = "";
    }
    // # kolumna tez podswietlona w kolorze TEJ osoby - odrozniona od .row-active (Twoj wlasny
    // ostatnio kliknietey wiersz, kolorowany na Twoj kolor), zeby dwa sygnaly sie nie mylily
    if (idxCol) {
      idxCol.classList.add("idx-presence");
      idxCol.style.color = color;
    }
  });
}

async function pollPresence() {
  if (!currentNiche || document.visibilityState !== "visible") return;
  try {
    const rows = await api.get(`/api/presence?niche_id=${currentNiche.id}`);
    presenceMap = new Map(rows.map((r) => [r.lead_id, r]));
    renderPresenceBadges();
  } catch {
    // pojedynczy nieudany poll pomijamy - kolejny za 4s
  }
}

function startPresencePolling() {
  if (presencePollTimer) return;
  presencePollTimer = setInterval(pollPresence, 4000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pollPresence();
  });
  pollPresence();
}

// zamkniecie karty / nawigacja gdzies indziej / odswiezenie = "wychodze z tego leada" -
// sendBeacon (nie fetch) dziala niezawodnie w trakcie zamykania strony. Przy zwyklym
// odswiezeniu ponowne wejscie od razu zglasza obecnosc z powrotem (patrz init() wyzej),
// wiec u innych dymek co najwyzej mignie, a nie zniknie na dobre.
window.addEventListener("pagehide", () => {
  navigator.sendBeacon("/api/presence/leave");
  rememberScroll();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") rememberScroll();
});

// Powrot "wstecz" ze scheme rozmowy oddaje strone z bfcache - czyli dokladnie taka, jaka byla
// przed wyjsciem, ze starymi danymi (dlatego trzeba bylo odswiezac recznie). Dociagamy je same,
// bez location.reload(), zeby nie zgubic pozycji scrolla ani otwartych filtrow.
window.addEventListener("pageshow", async (e) => {
  if (!e.persisted) return;
  try {
    await loadNicheHeader();
    await loadLeads();
    pingPresence(activeRowId || 0);
    pollPresence();
  } catch {
    // brak sieci przy powrocie - zostaja dane sprzed wyjscia, kolejna akcja i tak je odswiezy
  }
});

document.getElementById("leads-tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  if (e.target.closest(".lead-delete-btn")) return; // kosz ma wlasna obsluge (patrz #15 nizej)
  const id = Number(tr.dataset.id);
  // klik w "#" wiersza, ktory JUZ jest aktywny = odklikniecie (kolumna pokazuje wtedy ✕)
  if (id === activeRowId && e.target.closest(".idx-col")) {
    clearActiveRow();
    return;
  }
  pingPresence(id);
  setActiveRow(id);
});

// cselHtml/fieldCsel/closeAllPopovers/tagsTriggerContent/tagsMenuContent - wspolne z
// script.js, patrz public/js/api.js
const platformTriggerContent = (lead) => tagsTriggerContent(lead, meta);
const platformMenuContent = (lead) => tagsMenuContent(lead, meta);

function answeredHtml(lead) {
  return `
    <div class="answered-toggle">
      <button type="button" class="answered-btn yes ${lead.answered === "Tak" ? "active" : ""}" data-answered-value="Tak" title="Odebrał">✓</button>
      <button type="button" class="answered-btn no ${lead.answered === "Nie" ? "active" : ""}" data-answered-value="Nie" title="Nie odebrał">✕</button>
    </div>
  `;
}

// Podglad notatek w komorce: ZAWSZE najnowsza notatka (lista z serwera idzie od najnowszej),
// plus licznik gdy jest ich wiecej. Klik otwiera tablice korkowa.
function notesCellHtml(lead) {
  const notes = lead.notes_list || [];
  const newest = notes[0];
  const inner = newest
    ? `<span class="note-preview">${escapeHtml(newest.content)}</span>${notes.length > 1 ? `<span class="note-count">${notes.length}</span>` : ""}`
    : `<span class="note-empty">+ notatka</span>`;
  return `<button type="button" class="note-cell" title="Notatki (${notes.length})">${inner}</button>`;
}

// #4 - komorka "Proby": liczba prob dzwonienia. Klik otwiera popover z historia (godzina +
// data kazdego polaczenia), reczna edycja liczby i przyciskiem "Dodaj polaczenie".
function attemptsCellHtml(lead) {
  const n = lead.attempts_count || 0;
  return `<button type="button" class="attempts-cell ${n ? "has" : ""}" data-attempts-open title="Próby dzwonienia — kliknij, żeby zobaczyć i edytować historię">${n}</button>`;
}

function rowHtml(lead, index) {
  const reminder = reminderInfo(lead);
  const highlightClass = highlightStatuses.has(lead.interested) ? `row-glow-${lead.interested}` : "";
  const titleAttr = lead.research_notes ? `title="${escapeHtml(lead.research_notes)}"` : "";

  return `
    <tr data-id="${lead.id}" class="${highlightClass}" ${titleAttr}>
      <td class="idx-col"><span class="idx-num">${index}</span><span class="idx-unclick">✕</span></td>
      <td class="company-cell">
        <div class="company-cell-inner">
          <span class="presence-badge" style="display:none;"></span>
          <a class="company-link" href="${escapeHtml(companyGoogleSearchHref(lead))}" target="_blank" rel="noopener" title="${escapeHtml(lead.company_name)} — szukaj w Google">${escapeHtml(lead.company_name)}</a>
        </div>
      </td>
      <td class="city-cell" title="${escapeHtml(lead.city)}">${escapeHtml(shortCity(lead.city))}</td>
      <td class="phone-cell">
        <a class="phone-call-btn" href="/script.html?leadId=${lead.id}" target="_blank" rel="noopener" title="Scheme rozmowy (nowe okno)">📖</a>
        <span class="phone-text">${escapeHtml(formatPhone(lead.phone))}</span>
      </td>
      <td>${fieldCsel("quality", meta.qualityOptions, lead.quality, "—")}</td>
      <td>
        <div class="tags-popover">
          <div class="tags-trigger">${platformTriggerContent(lead)}</div>
          <div class="tags-menu">${platformMenuContent(lead)}</div>
        </div>
      </td>
      <td>${answeredHtml(lead)}</td>
      <td>${fieldCsel("interested", meta.interestedOptions, lead.interested)}</td>
      <td>${fieldCsel("caller", callerOptions(), lead.caller, "—")}</td>
      <td>${attemptsCellHtml(lead)}</td>
      <td><span class="reminder-badge ${reminder.cls}">${reminder.text}</span></td>
      <td><button type="button" class="term-btn ${lead.callback_when ? "set" : ""}" data-callback-open title="${lead.callback_when ? "" : "Ustaw dzień oddzwonienia"}">${escapeHtml(callbackLabel(lead.callback_when))}</button></td>
      <td><button type="button" class="term-btn ${lead.google_term ? "set" : ""}" data-term-open title="${lead.google_term ? "" : "Ustaw termin Google Meet"}">${escapeHtml(termLabel(lead.google_term))}</button></td>
      <td>${notesCellHtml(lead)}</td>
      <td class="row-actions"><button type="button" class="lead-delete-btn" title="Usuń lead">✕</button></td>
    </tr>
  `;
}

// `keepPopoverOpen` - przy tagach chcemy odswiezyc tylko podglad, zeby menu nie znikalo pod palcem
async function saveLead(id, body, { keepPopoverOpen = false } = {}) {
  try {
    const updated = await api.patch(`/api/leads/${id}`, body);
    const idx = leads.findIndex((l) => l.id === Number(id));
    if (idx >= 0) leads[idx] = updated;

    const fields = Object.keys(body);
    if (keepPopoverOpen) {
      const tr = document.querySelector(`tr[data-id="${id}"]`);
      if (tr) tr.querySelector(".tags-trigger").innerHTML = platformTriggerContent(updated);
    } else if (affectsOrdering(fields)) {
      renderLeads();
    } else {
      renderSingleRow(updated);
    }

    // COUNTER_FIELDS zmienia licznik "zadzwonionych", ELIGIBILITY_FIELDS zmienia "eligible"/"do
    // zrobienia" (patrz STATS_ELIGIBLE_SQL) - oba wymagaja odswiezenia naglowka niszy, ale tylko
    // pierwsze liczy sie jako "dzwonienie" (zapamietanie pozycji na potrzeby powrotu)
    if (fields.some((f) => COUNTER_FIELDS.has(f) || ELIGIBILITY_FIELDS.has(f))) {
      await loadNicheHeader();
    }
    if (fields.some((f) => COUNTER_FIELDS.has(f))) {
      rememberLastLead(id); // Kto dzwonil / Odebral / Status - to jest "dzwonienie", zapamietaj pozycje
    }
  } catch (err) {
    alert("Blad zapisu: " + err.message);
  }
}

const tbody = document.getElementById("leads-tbody");

// checkboxy tagow platform - reczne dotkniecie tagow (nie import CSV) odznacza tez "verified"
// (patrz .verified-badge w prawym dolnym rogu ramki Social)
tbody.addEventListener("change", (e) => {
  const tagField = e.target.dataset.tagField;
  if (!tagField) return;
  const id = e.target.closest("tr").dataset.id;

  const body = { [tagField]: e.target.checked, social_verified: true };
  // zaznaczenie Booksy w tagach ustawia tez pole has_social (zyje dalej w bazie/eksporcie CSV,
  // mimo ze kolumna "Strona" zniknela z tabeli - patrz QUALITY_OPTIONS w constants.js)
  if (tagField === "tag_booksy" && e.target.checked) {
    const current = leads.find((l) => l.id === Number(id));
    if (current && current.has_social !== "Tak") body.has_social = "Booksy";
  }
  saveLead(id, body, { keepPopoverOpen: true });
});

// #12 - termin Google Meet wybieramy wlasnym kalendarzem (zajete dni/godziny na czerwono),
// a nie systemowym pickerem, ktorego nie da sie pokolorowac
tbody.addEventListener("click", (e) => {
  const termBtn = e.target.closest("[data-term-open]");
  if (!termBtn) return;
  const tr = termBtn.closest("tr");
  const lead = leads.find((l) => l.id === Number(tr.dataset.id));
  if (!lead) return;

  openTermPicker({
    anchor: termBtn,
    value: lead.google_term,
    // lead bez przypisanego dzwoniacego = patrzymy na kalendarz osoby, ktora wlasnie umawia
    caller: lead.caller || (currentUser && currentUser.display_name) || "",
    leadId: lead.id,
    onPick: async (value) => {
      await saveLead(lead.id, { google_term: value });
      await loadMeets(); // swiezo umowiony termin ma od razu blokowac te godzine
    },
  });
});

// "Kiedy oddzwonić" - ten sam kalendarzyk co Google Meet (#4), tylko bez godzin: to zwykla data.
tbody.addEventListener("click", (e) => {
  const callbackBtn = e.target.closest("[data-callback-open]");
  if (!callbackBtn) return;
  const tr = callbackBtn.closest("tr");
  const lead = leads.find((l) => l.id === Number(tr.dataset.id));
  if (!lead) return;

  openCallbackPicker({
    anchor: callbackBtn,
    value: lead.callback_when,
    onPick: (value) => saveLead(lead.id, { callback_when: value }),
  });
});

// #4 - popover kolumny "Proby": historia polaczen (godzina + data), reczna edycja liczby,
// dodawanie wpisu. Zrodlem prawdy jest tabela lead_call_attempts na serwerze; tu tylko
// synchronizujemy lead.attempts_count i przerysowujemy wiersz.
let attemptsPopEl = null;

function closeAttemptsPop() {
  if (attemptsPopEl) attemptsPopEl.remove();
  attemptsPopEl = null;
}

function fmtAttempt(when) {
  const hasTime = when.length > 10;
  const d = new Date(hasTime ? when : `${when}T00:00:00`);
  if (isNaN(d.getTime())) return when;
  const p = (n) => String(n).padStart(2, "0");
  const date = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  return hasTime ? `${date}, ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}

async function openAttemptsPopover(anchor, lead) {
  closeAttemptsPop();
  closeCallbackPicker?.();

  const pop = document.createElement("div");
  pop.className = "term-pop attempts-pop";
  document.body.appendChild(pop);
  attemptsPopEl = pop;

  let attempts = [];
  let adding = false;

  function position() {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    const below = r.bottom + 6;
    pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  }

  function syncCount() {
    lead.attempts_count = attempts.length;
    const cell = document.querySelector(`tr[data-id="${lead.id}"] .attempts-cell`);
    if (cell) {
      cell.textContent = attempts.length;
      cell.classList.toggle("has", attempts.length > 0);
    }
  }

  function render() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const nowDate = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    const nowTime = `${p(now.getHours())}:${p(now.getMinutes())}`;

    const list = attempts.length
      ? attempts
          .map(
            (a) => `
        <li class="attempts-item">
          <span>${fmtAttempt(a.happened_at)}${a.created_by ? ` · <span class="attempts-by">${escapeHtml(a.created_by)}</span>` : ""}</span>
          <button type="button" class="attempts-del" data-attempt-del="${a.id}" title="Usuń wpis">✕</button>
        </li>`
          )
          .join("")
      : `<li class="attempts-empty">Brak zapisanych prób</li>`;

    pop.innerHTML = `
      <div class="attempts-head">
        <span>Próby:</span>
        <input type="number" class="attempts-count-input" min="0" max="999" value="${attempts.length}" data-attempts-count>
        <button type="button" class="btn" data-attempts-count-save>OK</button>
      </div>
      <ul class="attempts-list">${list}</ul>
      ${
        adding
          ? `<div class="attempts-add-form">
               <input type="date" data-attempt-date value="${nowDate}">
               <input type="time" data-attempt-time value="${nowTime}">
               <button type="button" class="btn primary" data-attempt-add-save>Dodaj</button>
             </div>`
          : `<button type="button" class="btn attempts-add-btn" data-attempts-add>+ Dodaj połączenie</button>`
      }
    `;
    position();
  }

  async function refetch() {
    attempts = await api.get(`/api/leads/${lead.id}/attempts`);
    syncCount();
    render();
  }

  pop.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      if (e.target.closest("[data-attempts-add]")) {
        adding = true;
        return render();
      }
      const del = e.target.closest("[data-attempt-del]");
      if (del) {
        attempts = await api.del(`/api/leads/${lead.id}/attempts/${del.dataset.attemptDel}`);
        syncCount();
        return render();
      }
      if (e.target.closest("[data-attempts-count-save]")) {
        const val = Number(pop.querySelector("[data-attempts-count]").value);
        attempts = await api.put(`/api/leads/${lead.id}/attempts/count`, { count: val });
        syncCount();
        return render();
      }
      if (e.target.closest("[data-attempt-add-save]")) {
        const date = pop.querySelector("[data-attempt-date]").value;
        const time = pop.querySelector("[data-attempt-time]").value;
        if (!date) return;
        attempts = await api.post(`/api/leads/${lead.id}/attempts`, {
          happened_at: time ? `${date}T${time}` : date,
        });
        adding = false;
        syncCount();
        return render();
      }
    } catch (err) {
      alert("Blad: " + err.message);
    }
  });

  render();
  try {
    await refetch();
  } catch (err) {
    pop.innerHTML = `<div class="attempts-empty">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-attempts-open]");
  if (!btn) return;
  const lead = leads.find((l) => l.id === Number(btn.closest("tr").dataset.id));
  if (lead) openAttemptsPopover(btn, lead);
});

document.addEventListener("click", (e) => {
  if (attemptsPopEl && !attemptsPopEl.contains(e.target) && !e.target.closest("[data-attempts-open]")) closeAttemptsPop();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAttemptsPop();
});
window.addEventListener("resize", closeAttemptsPop);

tbody.addEventListener("click", (e) => {
  const noteBtn = e.target.closest(".note-cell");
  if (noteBtn) {
    openNotesModal(Number(noteBtn.closest("tr").dataset.id));
    return;
  }

  const trigger = e.target.closest(".csel-trigger, .tags-trigger");
  if (trigger) {
    const box = trigger.closest(".csel, .tags-popover");
    const wasOpen = box.classList.contains("open");
    closeAllPopovers();
    if (!wasOpen) box.classList.add("open");
    return;
  }

  const option = e.target.closest(".csel-option");
  if (option) {
    const csel = option.closest(".csel");
    const field = csel.dataset.field;
    const value = option.dataset.value;
    csel.classList.remove("open");

    const tr = option.closest("tr");
    const body = { [field]: value };

    const before = leads.find((l) => l.id === Number(tr.dataset.id));
    if (field === "interested" && value === "dopiete" && before?.interested !== "dopiete") celebrateDeal();

    saveLead(tr.dataset.id, body);
    return;
  }

  const answeredBtn = e.target.closest(".answered-btn");
  if (answeredBtn) {
    const id = answeredBtn.closest("tr").dataset.id;
    const lead = leads.find((l) => l.id === Number(id));
    const val = answeredBtn.dataset.answeredValue;
    saveLead(id, { answered: lead && lead.answered === val ? "" : val }); // ponowny klik = odznacz
  }
});

// pasek filtrow - checkboxy w popoverze, wiec zaznaczenie jednego nie zamyka menu
// (mozna od razu zaznaczyc np. Dopiete + SMS)
document.getElementById("filter-bar").addEventListener("click", (e) => {
  const trigger = e.target.closest(".csel-trigger");
  if (!trigger) return;
  const box = trigger.closest(".tags-popover");
  const wasOpen = box.classList.contains("open");
  closeAllPopovers();
  if (!wasOpen) box.classList.add("open");
});

document.getElementById("filter-bar").addEventListener("change", (e) => {
  const value = e.target.dataset.filterValue;
  if (value === undefined) return;
  const key = e.target.closest(".tags-popover").dataset.filter;

  const set = new Set(filters[key]);
  e.target.checked ? set.add(value) : set.delete(value);
  filters[key] = [...set];

  refreshFilterTrigger(key);
  saveViewState();
  renderLeads();
});

// klik-poza-zamyka juz obsluzone globalnie w api.js
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeAllPopovers();
  closeNotesModal();
});

// ---------- notatki: tablica korkowa ----------

let notesLeadId = null;
let editingNoteId = null; // id notatki aktualnie w trybie edycji (jedna naraz)
const openHistoryNoteIds = new Set(); // ktore kartki maja rozwinieta historie starych wersji
const noteHistoryCache = new Map(); // note id -> lista poprzednich wersji (doladowana z serwera)

// (noteDateLabel - wspolny helper w api.js)

function noteHistoryHtml(noteId) {
  const entries = noteHistoryCache.get(noteId);
  if (!entries) return `<div class="note-history-loading">Wczytywanie historii…</div>`;
  if (!entries.length) return `<div class="note-history-loading">Brak wcześniejszych wersji.</div>`;
  return entries
    .map(
      (h) => `
      <div class="note-history-entry">
        <div class="note-history-content">${escapeHtml(h.content)}</div>
        <div class="note-history-date">obowiązywało do ${noteDateLabel(h.replaced_at)}</div>
      </div>`
    )
    .join("");
}

function notePaperHtml(n) {
  if (n.id === editingNoteId) {
    return `
      <div class="note-paper note-paper-editing">
        <span class="note-pin"></span>
        <textarea class="note-edit-input">${escapeHtml(n.content)}</textarea>
        <div class="note-edit-actions">
          <button type="button" class="note-edit-save" data-note-id="${n.id}">Zapisz</button>
          <button type="button" class="note-edit-cancel">Anuluj</button>
        </div>
      </div>`;
  }

  const editedLbl = n.updated_at
    ? ` · <button type="button" class="note-history-toggle" data-note-id="${n.id}">edytowano ${noteDateLabel(n.updated_at)}</button>`
    : "";
  const historyOpen = openHistoryNoteIds.has(n.id);

  return `
    <div class="note-paper">
      <span class="note-pin"></span>
      <button type="button" class="note-paper-edit" data-note-id="${n.id}" title="Edytuj notatkę">✎</button>
      <button type="button" class="note-paper-delete" data-note-id="${n.id}" title="Usuń notatkę">✕</button>
      <div class="note-paper-content">${escapeHtml(n.content)}</div>
      <div class="note-paper-date">${noteDateLabel(n.created_at)}${editedLbl}</div>
      ${historyOpen ? `<div class="note-history">${noteHistoryHtml(n.id)}</div>` : ""}
    </div>`;
}

function renderNotesModal() {
  const lead = leads.find((l) => l.id === notesLeadId);
  if (!lead) return;
  const notes = lead.notes_list || [];

  document.getElementById("notes-modal-title").textContent = `📌 Notatki — ${lead.company_name}`;
  document.getElementById("notes-modal-sub").textContent = notes.length
    ? `${notes.length} ${notes.length === 1 ? "notatka" : notes.length < 5 ? "notatki" : "notatek"} · najnowsza u góry`
    : "";

  document.getElementById("corkboard").innerHTML = notes.length
    ? notes.map(notePaperHtml).join("")
    : `<div class="corkboard-empty">Pusta tablica — przypnij pierwszą notatkę poniżej.</div>`;

  if (editingNoteId != null) {
    const textarea = document.querySelector(".note-edit-input");
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }
}

function openNotesModal(leadId) {
  notesLeadId = leadId;
  editingNoteId = null;
  openHistoryNoteIds.clear();
  renderNotesModal();
  document.getElementById("note-input").value = "";
  document.getElementById("notes-modal").classList.remove("hidden");
  document.getElementById("note-input").focus();
}

function closeNotesModal() {
  document.getElementById("notes-modal").classList.add("hidden");
  notesLeadId = null;
  editingNoteId = null;
  openHistoryNoteIds.clear();
}

// wspolna koncowka dla dodania/usuniecia: serwer odsyla pelna liste notatek leada
function applyNotesUpdate(updatedList) {
  const lead = leads.find((l) => l.id === notesLeadId);
  if (!lead) return;
  lead.notes_list = updatedList;
  renderNotesModal();
  renderSingleRow(lead); // odswieza podglad najnowszej notatki w komorce tabeli
}

document.getElementById("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("note-input");
  const content = input.value.trim();
  if (!content || !notesLeadId) return;
  try {
    const list = await api.post(`/api/leads/${notesLeadId}/notes`, { content });
    input.value = "";
    applyNotesUpdate(list);
  } catch (err) {
    alert("Blad zapisu notatki: " + err.message);
  }
});

// Enter = przypnij (szybkie notowanie w trakcie dzwonienia), Shift+Enter = nowa linia
document.getElementById("note-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("note-form").requestSubmit();
  }
});

async function saveNoteEdit(noteId) {
  const textarea = document.querySelector(".note-edit-input");
  const content = textarea ? textarea.value.trim() : "";
  if (!content) return;
  try {
    const list = await api.patch(`/api/leads/${notesLeadId}/notes/${noteId}`, { content });
    noteHistoryCache.delete(noteId); // tresc sie zmienila - stara historia w cache jest juz nieaktualna
    editingNoteId = null;
    applyNotesUpdate(list);
  } catch (err) {
    alert("Blad zapisu notatki: " + err.message);
  }
}

document.getElementById("corkboard").addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".note-paper-edit");
  if (editBtn) {
    editingNoteId = Number(editBtn.dataset.noteId);
    renderNotesModal();
    return;
  }

  const saveBtn = e.target.closest(".note-edit-save");
  if (saveBtn) {
    await saveNoteEdit(Number(saveBtn.dataset.noteId));
    return;
  }

  const cancelBtn = e.target.closest(".note-edit-cancel");
  if (cancelBtn) {
    editingNoteId = null;
    renderNotesModal();
    return;
  }

  const historyBtn = e.target.closest(".note-history-toggle");
  if (historyBtn) {
    const noteId = Number(historyBtn.dataset.noteId);
    if (openHistoryNoteIds.has(noteId)) {
      openHistoryNoteIds.delete(noteId);
      renderNotesModal();
      return;
    }
    openHistoryNoteIds.add(noteId);
    renderNotesModal();
    if (!noteHistoryCache.has(noteId)) {
      try {
        noteHistoryCache.set(noteId, await api.get(`/api/leads/${notesLeadId}/notes/${noteId}/history`));
      } catch (err) {
        noteHistoryCache.set(noteId, []);
      }
      renderNotesModal();
    }
    return;
  }

  const delBtn = e.target.closest(".note-paper-delete");
  if (delBtn && notesLeadId) {
    if (!confirm("Usunąć tę notatkę?")) return;
    try {
      applyNotesUpdate(await api.del(`/api/leads/${notesLeadId}/notes/${delBtn.dataset.noteId}`));
    } catch (err) {
      alert("Blad usuwania notatki: " + err.message);
    }
  }
});

// W edycji: Enter = zapisz, Shift+Enter = nowa linia, Escape = anuluj (spojne z note-input)
document.getElementById("corkboard").addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("note-edit-input")) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    saveNoteEdit(editingNoteId);
  } else if (e.key === "Escape") {
    editingNoteId = null;
    renderNotesModal();
  }
});

document.getElementById("notes-modal").addEventListener("click", (e) => {
  if (e.target.id === "notes-modal") closeNotesModal();
});

// ---------- wejscie z dashboardu (?lead=<id>): scroll do wiersza + chwilowe podswietlenie ----------

function focusLeadRow(leadId) {
  // czyscimy parametr od razu, zeby odswiezenie strony nie powtarzalo scrolla/flasha
  history.replaceState(null, "", `/niche.html?slug=${encodeURIComponent(slug)}`);
  const tr = document.querySelector(`tr[data-id="${leadId}"]`);
  if (!tr) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  tr.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  tr.classList.add("row-flash");
  setTimeout(() => tr.classList.remove("row-flash"), 2600);
}


// ---------- #13: zestawy filtrow (prywatne, osobne dla kazdej niszy) ----------
// Serwer zawsze zaweza zapytania do zalogowanego konta (server/routes/filterSets.js), wiec tu
// nie ma juz zadnego "czyje to" - dostajemy po prostu swoje zestawy dla tej niszy.

let filterSets = [];
let renamingSetId = null; // zestaw, ktorego nazwe wlasnie edytujemy w menu

const EMPTY_FILTERS = () => ({ interested: [], caller: [], answered: [], quality: [] });

// ile pojedynczych wartosci siedzi w zestawie - liczba przy nazwie mowi "ile filtrow zalacze"
const setSize = (set) => Object.values(set.filters || {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);

async function loadFilterSets() {
  if (!currentNiche) return;
  try {
    filterSets = await api.get(`/api/filter-sets?niche_id=${currentNiche.id}`);
  } catch {
    filterSets = []; // brak zestawow nie moze zablokowac pracy z niszą
  }
}

// menu przebudowuje sie po kazdej zmianie (dodanie/usuniecie/zmiana nazwy), a przebudowa gubi
// klase .open - wiec po kazdej takiej operacji otwieramy je z powrotem, zeby nie zamykalo sie
// pod palcem w srodku pracy z zestawami
function reopenSetsMenu() {
  document.querySelector(".tags-popover[data-filter-sets]")?.classList.add("open");
}

function filterSetsHtml() {
  const rows = filterSets
    .map((set) =>
      set.id === renamingSetId
        ? `<div class="filter-set-row">
             <input type="text" class="filter-set-name-input" data-set-input="${set.id}" value="${escapeHtml(set.name)}" maxlength="40">
           </div>`
        : `<div class="filter-set-row">
             <button type="button" class="filter-set-apply" data-set-apply="${set.id}" title="Załącz ten zestaw filtrów">
               ${escapeHtml(set.name)}<span class="filter-set-count">${setSize(set)}</span>
             </button>
             <button type="button" class="filter-set-icon" data-set-overwrite="${set.id}" title="Nadpisz obecnie ustawionymi filtrami">💾</button>
             <button type="button" class="filter-set-icon" data-set-rename="${set.id}" title="Zmień nazwę">✎</button>
             <button type="button" class="filter-set-icon danger" data-set-delete="${set.id}" title="Usuń zestaw">✕</button>
           </div>`
    )
    .join("");

  return `
    <div class="filter-group">
      <span class="filter-label">Zestawy</span>
      <div class="tags-popover" data-filter-sets>
        <div class="csel-trigger">⭐ ${filterSets.length ? `Zapisane (${filterSets.length})` : "Brak zapisanych"}</div>
        <div class="tags-menu filter-sets-menu">
          ${rows || `<div class="filter-set-empty">Ustaw filtry, których używasz najczęściej, i zapisz je pod nazwą — wrócisz do nich jednym kliknięciem.</div>`}
          <div class="filter-set-new">
            <input type="text" id="filter-set-new-name" placeholder="Nazwa zestawu" maxlength="40">
            <button type="button" class="btn primary" id="filter-set-save">Zapisz obecne</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// wszystkie operacje na zestawach zwracaja z serwera pelna, aktualna liste - wiec jeden wspolny
// wrapper zamiast trzech razy tego samego try/catch + rerender
async function withFilterSets(request) {
  try {
    filterSets = await request();
    renamingSetId = null;
    renderFilterBar();
    reopenSetsMenu();
  } catch (err) {
    alert("Blad zapisu zestawu: " + err.message);
  }
}

document.getElementById("filter-bar").addEventListener("click", (e) => {
  const apply = e.target.closest("[data-set-apply]");
  if (apply) {
    const set = filterSets.find((s) => s.id === Number(apply.dataset.setApply));
    if (!set) return;
    // zestaw zastepuje CALY stan filtrow (a nie dokłada sie do obecnych) - inaczej nie dalo
    // by sie nim wrocic do znanego widoku, tylko zawezalo to, co akurat bylo ustawione.
    // Bierzemy tylko klucze, ktore nadal istnieja (stary zestaw sprzed usuniecia kolumn
    // Strona/Otwiera/Zamyka mogl miec has_social/open_time - te po cichu by juz nie dzialaly).
    const empty = EMPTY_FILTERS();
    filters = { ...empty, ...Object.fromEntries(Object.entries(set.filters || {}).filter(([k]) => k in empty)) };
    setTodoFilter(false);
    closeAllPopovers();
    saveViewState();
    renderFilterBar();
    renderLeads();
    return;
  }

  const overwrite = e.target.closest("[data-set-overwrite]");
  if (overwrite) {
    withFilterSets(() => api.patch(`/api/filter-sets/${overwrite.dataset.setOverwrite}`, { filters }));
    return;
  }

  const rename = e.target.closest("[data-set-rename]");
  if (rename) {
    renamingSetId = Number(rename.dataset.setRename);
    renderFilterBar();
    reopenSetsMenu();
    document.querySelector(".filter-set-name-input")?.select();
    return;
  }

  const del = e.target.closest("[data-set-delete]");
  if (del) {
    const set = filterSets.find((s) => s.id === Number(del.dataset.setDelete));
    if (!set || !confirm(`Usunąć zestaw „${set.name}"?`)) return;
    withFilterSets(() => api.del(`/api/filter-sets/${set.id}`));
    return;
  }

  if (e.target.id === "filter-set-save") {
    const input = document.getElementById("filter-set-new-name");
    const name = input.value.trim();
    if (!name) return input.focus();
    withFilterSets(() => api.post("/api/filter-sets", { niche_id: currentNiche.id, name, filters }));
  }
});

// zmiana nazwy: Enter zapisuje, Escape rezygnuje (bez zapisu)
document.getElementById("filter-bar").addEventListener("keydown", (e) => {
  const input = e.target.closest(".filter-set-name-input");
  if (input) {
    if (e.key === "Enter") {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      withFilterSets(() => api.patch(`/api/filter-sets/${input.dataset.setInput}`, { name }));
    } else if (e.key === "Escape") {
      e.stopPropagation(); // inaczej globalny Escape zamknalby cale menu
      renamingSetId = null;
      renderFilterBar();
      reopenSetsMenu();
    }
    return;
  }
  if (e.target.id === "filter-set-new-name" && e.key === "Enter") {
    e.preventDefault();
    document.getElementById("filter-set-save").click();
  }
});

// ---------- #15: reczne dodawanie i usuwanie leadow ----------

const addLeadModal = document.getElementById("add-lead-modal");

function openAddLeadModal() {
  document.getElementById("add-lead-error").style.display = "none";
  document.getElementById("add-lead-form").reset();
  addLeadModal.classList.remove("hidden");
  document.getElementById("add-lead-name").focus();
}

document.getElementById("add-lead-btn").addEventListener("click", openAddLeadModal);
document.getElementById("add-lead-cancel").addEventListener("click", () => addLeadModal.classList.add("hidden"));
addLeadModal.addEventListener("click", (e) => {
  if (e.target === addLeadModal) addLeadModal.classList.add("hidden");
});

document.getElementById("add-lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("add-lead-error");
  errorEl.style.display = "none";

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const lead = await api.post(`/api/niches/${encodeURIComponent(slug)}/leads`, {
      company_name: document.getElementById("add-lead-name").value,
      city: document.getElementById("add-lead-city").value,
      // telefon trzymamy w bazie samymi cyframi (tak samo jak przy edycji w tabeli)
      phone: document.getElementById("add-lead-phone").value.replace(/\D/g, ""),
    });
    leads.push(lead);
    addLeadModal.classList.add("hidden");
    renderLeads();
    await loadNicheHeader(); // nowy lead zmienia "wszystkich"/"do zrobienia" w kafelkach
    focusLeadRow(lead.id); // przescrolluj do swiezego wiersza i mrugnij nim
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
});

// kosz na koncu wiersza - potwierdzenie z nazwa firmy, bo razem z leadem znikaja jego notatki
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".lead-delete-btn");
  if (!btn) return;
  e.stopPropagation(); // nie ustawiaj przy okazji "zajmuje sie tym leadem"

  const id = Number(btn.closest("tr").dataset.id);
  const lead = leads.find((l) => l.id === id);
  if (!lead) return;
  if (!confirm(`Usunąć lead „${lead.company_name}" wraz z notatkami? Tej operacji nie da się cofnąć.`)) return;

  try {
    await api.del(`/api/leads/${id}`);
    leads = leads.filter((l) => l.id !== id);
    if (activeRowId === id) clearActiveRow();
    renderLeads();
    await loadNicheHeader();
  } catch (err) {
    alert("Nie udalo sie usunac leada: " + err.message);
  }
});

// ---------- ustawienia niszy ----------

let pendingColor = "";

function renderColorSwatches() {
  document.getElementById("color-swatches").innerHTML = ["", ...meta.nicheColors]
    .map((c) => {
      const cls = `color-swatch ${c === pendingColor ? "active" : ""} ${c ? "" : "none"}`;
      return `<button type="button" class="${cls}" data-color="${c}" style="${c ? `background:${c}` : ""}" title="${c || "Brak koloru"}">${c ? "" : "✕"}</button>`;
    })
    .join("");
}

async function openSettings() {
  document.getElementById("settings-error").style.display = "none";
  document.getElementById("settings-name").value = currentNiche.name;
  pendingColor = currentNiche.color || "";
  renderColorSwatches();

  // lista plikow schematow czytana przy kazdym otwarciu - swiezo dorzucony plik
  // w server/scriptsData/ pojawia sie bez przeladowania strony
  const sel = document.getElementById("settings-script-file");
  sel.innerHTML = `<option value="">Wczytuję…</option>`;
  document.getElementById("settings-modal").classList.remove("hidden");
  try {
    const files = await api.get("/api/scripts/files");
    const current = currentNiche.script_file || "default";
    sel.innerHTML = files
      .map((f) => `<option value="${escapeHtml(f)}" ${f === current ? "selected" : ""}>${escapeHtml(f)}.js</option>`)
      .join("");
  } catch (err) {
    sel.innerHTML = `<option value="">Nie udało się wczytać listy</option>`;
  }
}
function closeSettings() {
  document.getElementById("settings-modal").classList.add("hidden");
}

document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("settings-cancel").addEventListener("click", closeSettings);
document.getElementById("settings-modal").addEventListener("click", (e) => {
  if (e.target.id === "settings-modal") closeSettings();
});

document.getElementById("color-swatches").addEventListener("click", (e) => {
  const swatch = e.target.closest(".color-swatch");
  if (!swatch) return;
  pendingColor = swatch.dataset.color;
  renderColorSwatches();
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("settings-error");
  errorEl.style.display = "none";
  try {
    const body = {
      name: document.getElementById("settings-name").value.trim(),
      color: pendingColor,
    };
    // pusta wartosc = lista sie nie wczytala - nie nadpisujemy wyboru w bazie
    const scriptFile = document.getElementById("settings-script-file").value;
    if (scriptFile) body.script_file = scriptFile;
    await api.patch(`/api/niches/${currentNiche.id}`, body);
    closeSettings();
    await loadNicheHeader();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  }
});

document.getElementById("settings-delete-btn").addEventListener("click", async () => {
  if (!confirm(`Usunąć niszę „${currentNiche.name}" wraz ze wszystkimi ${currentNiche.total} leadami? Tej operacji nie da się cofnąć.`)) return;
  try {
    await api.del(`/api/niches/${currentNiche.id}`);
    location.href = "/";
  } catch (err) {
    alert("Blad usuwania: " + err.message);
  }
});

// #7 - "x" po prawej stronie searchbara czysci cale pole (widoczny tylko gdy jest co czyscic)
const leadSearchInput = document.getElementById("lead-search");
const leadSearchClear = document.getElementById("lead-search-clear");

leadSearchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  leadSearchClear.classList.toggle("hidden", !searchQuery);
  renderLeads();
});

leadSearchClear.addEventListener("click", () => {
  searchQuery = "";
  leadSearchInput.value = "";
  leadSearchClear.classList.add("hidden");
  leadSearchInput.focus();
  renderLeads();
});

init();
