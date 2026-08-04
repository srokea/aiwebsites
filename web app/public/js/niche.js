const params = new URLSearchParams(location.search);
const slug = params.get("slug");
if (!slug) location.href = "/";

let meta = null;
let leads = [];
let currentNiche = null;
let sortState = { id: null, field: null, dir: "asc" };
// kazdy filtr to lista wartosci (multi-select) - pusta lista = brak filtra na tym polu
let filters = { interested: [], caller: [], answered: [], has_social: [] };
let searchQuery = "";
let highlightStatuses = new Set();

// Kolejnosc sortowania dla "Odebral?" - od pustego, przez Nie, po Tak.
const ANSWERED_SORT_ORDER = ["", "Nie", "Tak"];
// Zmiana tych pol moze przestawic licznik "zadzwonionych" w naglowku (patrz server/leadStatus.js)
const COUNTER_FIELDS = new Set(["caller", "answered", "interested"]);

const callerColor = (name) => meta.callerColors[name] || "#888";
const callerOptions = () => meta.callers.map((c) => ({ value: c, label: c, color: callerColor(c) }));

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
    renderFilterBar();
    await loadNicheHeader();
    await loadLeads();
  } catch (err) {
    // np. nisza usunieta w innej karcie albo zly link - lepiej pokazac komunikat niz pusta strone
    document.getElementById("niche-title").textContent = "Nie udało się wczytać niszy";
    document.getElementById("niche-sub").textContent = err.message;
    document.getElementById("leads-tbody").innerHTML =
      `<tr><td colspan="15"><div class="empty-state">${escapeHtml(err.message)} — <a href="/" style="color:var(--blue)">wróć do listy nisz</a></div></td></tr>`;
  }
}

async function loadNicheHeader() {
  const niche = await api.get(`/api/niches/${encodeURIComponent(slug)}`);
  currentNiche = niche;

  const titleEl = document.getElementById("niche-title");
  titleEl.textContent = niche.name;
  titleEl.style.color = niche.color || "";
  document.title = `${niche.name} — Cold Calls`;
  document.getElementById("niche-sub").textContent = `${niche.called}/${niche.total} zadzwonionych · ${niche.todo} do zrobienia`;

  const pct = niche.total ? Math.round((niche.called / niche.total) * 100) : 0;
  document.getElementById("niche-stats").innerHTML = `
    <div class="stat-card"><div class="num">${niche.total}</div><div class="label">Wszystkich</div></div>
    <div class="stat-card accent-green"><div class="num">${niche.called}</div><div class="label">Zadzwonionych</div></div>
    <div class="stat-card accent-red"><div class="num">${niche.todo}</div><div class="label">Do zrobienia</div></div>
    <div class="stat-card accent-gold"><div class="num">${pct}%</div><div class="label">Postep</div></div>
  `;

  const maxCaller = Math.max(1, ...niche.byCaller.map((c) => c.c));
  const topCount = Math.max(0, ...niche.byCaller.map((c) => c.c));
  const bars = meta.callers
    .map((name) => {
      const count = niche.byCaller.find((c) => c.caller === name)?.c || 0;
      const w = Math.round((count / maxCaller) * 100);
      // % tej osoby wzgledem WSZYSTKICH leadow w niszy (nie wzgledem sumy obu dzwoniacych)
      const pctOfTotal = niche.total ? Math.round((count / niche.total) * 100) : 0;
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
  badge.innerHTML = `<span class="n">${niche.calledToday}</span>/${meta.dailyGoal} dzisiaj`;
}

async function loadLeads() {
  leads = await api.get(`/api/niches/${encodeURIComponent(slug)}/leads`);
  renderLeads();
}

// Reminder patrzy na dwa terminy - "Kiedy oddzwonic" i "Termin Google" - i pokazuje ten,
// ktory jest blizej (chronologicznie pierwszy), z etykieta zalezna od tego ktory to termin.
function reminderInfo(lead) {
  const candidates = [
    lead.callback_when && { raw: lead.callback_when, kind: "Oddzwoń" },
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

  if (diffDays > 3) return { cls: "r-future", text: `${kind} za ${diffDays} dni` };
  if (diffDays > 0) return { cls: "r-soon", text: `${kind} za ${diffDays} ${diffDays === 1 ? "dzień" : "dni"}` };
  if (diffDays === 0) return { cls: "r-due", text: `${kind} dziś!` };
  return { cls: "r-due", text: kind === "Google" ? "Google minął!" : "Oddzwoń!" };
}

function formatPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// tel: link - Phone Link (Windows) i macOS/iPhone Continuity oba obsluguja ten sam schemat URI,
// wiec dziala identycznie u obu bez zadnej detekcji platformy. Numery PL bez prefiksu -> +48.
function telHref(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 9 ? `+48${digits}` : `+${digits}`;
}

// ---------- filtry (multi-select) + sortowanie ----------

function renderFilterBar() {
  document.getElementById("filter-bar").innerHTML = `
    ${multiFilterHtml("interested", "Zainteresowany", meta.interestedOptions)}
    ${multiFilterHtml("caller", "Kto dzwonił", callerOptions())}
    ${multiFilterHtml("answered", "Odebrał", meta.answeredOptions)}
    ${multiFilterHtml("has_social", "Strona", meta.websiteStatusOptions)}
    <button type="button" class="btn" id="filter-clear" style="margin-left:4px;">Wyczyść filtry</button>
  `;
  document.getElementById("filter-clear").addEventListener("click", () => {
    filters = { interested: [], caller: [], answered: [], has_social: [] };
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
    case "has_social":
      return meta.websiteStatusOptions.findIndex((o) => o.value === lead.has_social);
    case "caller":
      return meta.callers.indexOf(lead.caller);
    case "answered":
      return ANSWERED_SORT_ORDER.indexOf(lead.answered);
    case "phone":
      return lead.phone.replace(/\D/g, "");
    // kolumna Reminder pokazuje blizszy z dwoch terminow (patrz reminderInfo), wiec sortuje
    // sie po tym samym - nie tylko po callback_when, inaczej rozjezdza sie z tym co widac
    case "reminder_effective": {
      const dates = [lead.callback_when, lead.google_term ? lead.google_term.slice(0, 10) : ""]
        .filter(Boolean)
        .map((d) => new Date(d + "T00:00:00").getTime())
        .filter((t) => !isNaN(t));
      return dates.length ? Math.min(...dates) : Number.MAX_SAFE_INTEGER;
    }
    // stare importy CSV czasem wsadzily do tych pol tekst zamiast daty (np. "za tydzien") -
    // sortowanie jako string ustawialoby je losowo wsrod prawdziwych dat, wiec parsujemy
    // i wszystko nieprawidlowe/puste ladowanie na koniec, zamiast alfabetycznie
    case "callback_when": {
      const t = lead.callback_when ? new Date(lead.callback_when + "T00:00:00").getTime() : NaN;
      return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    }
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
  const phoneMatch = digitsQuery.length > 0 && lead.phone.replace(/\D/g, "").includes(digitsQuery);
  return nameMatch || phoneMatch;
}

function getVisibleLeads() {
  const list = leads.filter(
    (l) =>
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
  return fields.some((field) => {
    const sortKey = field.startsWith("tag_") ? "tags_count" : field;
    return sortKey === sortState.field || (field in filters && filters[field].length > 0);
  });
}

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    // identyfikujemy po kolumnie, nie po polu - dwie kolumny moga sortowac po tym samym polu
    // (Reminder i Kiedy oddzwonic), a strzalka ma sie zapalic tylko na klikanej
    const id = th.dataset.sortId;
    if (sortState.id === id) sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    else sortState = { id, field: th.dataset.sort, dir: "asc" };

    document.querySelectorAll("th.sortable").forEach((el) => {
      el.classList.toggle("sort-asc", el.dataset.sortId === sortState.id && sortState.dir === "asc");
      el.classList.toggle("sort-desc", el.dataset.sortId === sortState.id && sortState.dir === "desc");
    });
    renderLeads();
  });
});

// ---------- render ----------

function renderLeads() {
  const tbody = document.getElementById("leads-tbody");
  const visible = getVisibleLeads();
  if (!visible.length) {
    tbody.innerHTML = `<tr><td colspan="15"><div class="empty-state">Brak leadow spelniajacych kryteria.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = visible.map((lead, i) => rowHtml(lead, i + 1)).join("");
}

function renderSingleRow(lead) {
  const tr = document.querySelector(`tr[data-id="${lead.id}"]`);
  if (!tr) return renderLeads();
  tr.outerHTML = rowHtml(lead, tr.querySelector(".idx-col")?.textContent || "");
}

// Uniwersalny dropdown. `attr` trafia na kontener (data-field dla wiersza / data-filter dla paska).
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

function tagsTriggerContent(lead) {
  const active = meta.platformTags.filter((t) => lead[`tag_${t}`]);
  if (!active.length) return `<span class="plus">+</span>`;
  return active
    .map((t) => {
      const m = meta.platformMeta[t];
      return `<span class="platform-badge" style="background:${m.color}" title="${m.name}">${m.label}</span>`;
    })
    .join("");
}

function tagsMenuContent(lead) {
  return meta.platformTags
    .map((t) => {
      const m = meta.platformMeta[t];
      return `
      <label class="tags-option">
        <input type="checkbox" data-tag-field="tag_${t}" ${lead[`tag_${t}`] ? "checked" : ""}>
        <span class="check">✓</span>
        <span class="platform-badge" style="background:${m.color}">${m.label}</span>
        ${m.name}
      </label>`;
    })
    .join("");
}

function answeredHtml(lead) {
  return `
    <div class="answered-toggle">
      <button type="button" class="answered-btn yes ${lead.answered === "Tak" ? "active" : ""}" data-answered-value="Tak" title="Odebrał">✓</button>
      <button type="button" class="answered-btn no ${lead.answered === "Nie" ? "active" : ""}" data-answered-value="Nie" title="Nie odebrał">✕</button>
    </div>
  `;
}

function companyGoogleSearchHref(lead) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${lead.company_name} ${lead.city}`.trim())}`;
}

function rowHtml(lead, index) {
  const reminder = reminderInfo(lead);
  const highlightClass = highlightStatuses.has(lead.interested) ? `row-glow-${lead.interested}` : "";
  const titleAttr = lead.research_notes ? `title="${escapeHtml(lead.research_notes)}"` : "";

  return `
    <tr data-id="${lead.id}" class="${highlightClass}" ${titleAttr}>
      <td class="idx-col">${index}</td>
      <td><a class="company-link" href="${escapeHtml(companyGoogleSearchHref(lead))}" target="_blank" rel="noopener" title="${escapeHtml(lead.company_name)} — szukaj w Google">${escapeHtml(lead.company_name)}</a></td>
      <td>${fieldCsel("has_social", meta.websiteStatusOptions, lead.has_social, "—")}</td>
      <td class="city-cell">${escapeHtml(lead.city)}</td>
      <td class="phone-cell">
        <a class="phone-call-btn" href="tel:${escapeHtml(telHref(lead.phone))}" title="Zadzwoń (Phone Link / iPhone)">📞</a>
        <span class="phone-text">${escapeHtml(formatPhone(lead.phone))}</span>
      </td>
      <td><input type="text" class="quality-input" data-field="quality" value="${escapeHtml(lead.quality)}"></td>
      <td>
        <div class="tags-popover">
          <div class="tags-trigger">${tagsTriggerContent(lead)}</div>
          <div class="tags-menu">${tagsMenuContent(lead)}</div>
        </div>
      </td>
      <td>${answeredHtml(lead)}</td>
      <td>${fieldCsel("interested", meta.interestedOptions, lead.interested)}</td>
      <td>${fieldCsel("caller", callerOptions(), lead.caller, "—")}</td>
      <td><span class="reminder-badge ${reminder.cls}">${reminder.text}</span></td>
      <td><input type="date" data-field="callback_when" value="${escapeHtml(lead.callback_when)}"></td>
      <td><input type="datetime-local" data-field="google_term" value="${escapeHtml(lead.google_term)}"></td>
      <td><input type="text" data-field="notes" value="${escapeHtml(lead.notes)}" style="min-width:180px" placeholder="notatka..."></td>
      <td><a class="call-btn" href="/script.html?leadId=${lead.id}" title="Scheme rozmowy">📖</a></td>
    </tr>
  `;
}

function closeAllPopovers() {
  document.querySelectorAll(".csel.open, .tags-popover.open").forEach((el) => el.classList.remove("open"));
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
      if (tr) {
        tr.querySelector(".tags-trigger").innerHTML = tagsTriggerContent(updated);
        const strona = tr.querySelector('.csel[data-field="has_social"]');
        if (strona && "has_social" in body) {
          strona.outerHTML = fieldCsel("has_social", meta.websiteStatusOptions, updated.has_social, "—");
        }
      }
    } else if (affectsOrdering(fields)) {
      renderLeads();
    } else {
      renderSingleRow(updated);
    }

    if (fields.some((f) => COUNTER_FIELDS.has(f))) await loadNicheHeader();
  } catch (err) {
    alert("Blad zapisu: " + err.message);
  }
}

const tbody = document.getElementById("leads-tbody");

// pola tekstowe / daty
tbody.addEventListener("change", (e) => {
  const field = e.target.dataset.field;
  if (!field || e.target.tagName !== "INPUT") return;
  const value = field === "phone" ? e.target.value.replace(/\D/g, "") : e.target.value;
  saveLead(e.target.closest("tr").dataset.id, { [field]: value });
});

// checkboxy tagow platform
tbody.addEventListener("change", (e) => {
  const tagField = e.target.dataset.tagField;
  if (!tagField) return;
  const id = e.target.closest("tr").dataset.id;

  const body = { [tagField]: e.target.checked };
  // zaznaczenie Booksy w tagach ustawia tez kolumne Strona - chyba ze maja wlasna strone ("Tak")
  if (tagField === "tag_booksy" && e.target.checked) {
    const current = leads.find((l) => l.id === Number(id));
    if (current && current.has_social !== "Tak") body.has_social = "Booksy";
  }
  saveLead(id, body, { keepPopoverOpen: true });
});

tbody.addEventListener("click", (e) => {
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
    // wybor "Booksy" w kolumnie Strona zaznacza tez tag platformy
    if (field === "has_social" && value === "Booksy") body.tag_booksy = true;

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
  renderLeads();
});

document.addEventListener("click", (e) => {
  document.querySelectorAll(".csel.open, .tags-popover.open").forEach((el) => {
    if (!el.contains(e.target)) el.classList.remove("open");
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllPopovers();
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

function openSettings() {
  document.getElementById("settings-error").style.display = "none";
  document.getElementById("settings-name").value = currentNiche.name;
  pendingColor = currentNiche.color || "";
  renderColorSwatches();
  document.getElementById("settings-modal").classList.remove("hidden");
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
    await api.patch(`/api/niches/${currentNiche.id}`, {
      name: document.getElementById("settings-name").value.trim(),
      color: pendingColor,
    });
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

document.getElementById("lead-search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderLeads();
});

init();
