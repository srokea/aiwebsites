let meta = null;
let usersByName = {}; // display_name -> user (patrz "Kto dzwonił" ikonki w panelu "Najblizsze")

// ---------- panel powitalny ----------

const MMATES_QUOTES = [
  "Sell me this pen. 🖊️",
  "Nie odkładaj na jutro telefonu, który możesz spartolić dzisiaj.",
  "Coffee is for closers.",
  "Każde „nie” to o jedno „tak” bliżej.",
  "The show goes on i tak, telefon numer dalej.",
  "Dziś dzwonisz Ty, jutro dzwonią do Ciebie.",
  "Rekord bije się jeden telefon na raz.",
  "Najgorsze, co usłyszysz, to „nie”. Już to przeżyłeś.",
  "ABC: Always Be Calling.",
  "Nikt nie pamięta setnego telefonu w tygodniu. Wszyscy pamiętają ten jeden dopięty.",
  "Cisza na linii boli bardziej niż odmowa — więc dzwoń dalej.",
  "10k samo się nie wydzwoni.",
  "Klient nie wie jeszcze, że Cię potrzebuje. Twoja robota mu to powiedzieć.",
  "Rutyna to najlepszy sprzedawca — pilnuj codziennego minimum.",
  "Nie sprzedajesz usługi. Sprzedajesz spokój głowy właścicielowi salonu.",
  "„Zadzwonię później” to najczęstsze kłamstwo w tej branży. Dzwoń teraz.",
  "Lepszy jeden telefon więcej niż jedna wymówka więcej.",
  "Nikodem czy Sylwester — nieważne kto, ważne ile.",
  "Formularz sam się nie wypełni, a lead sam nie zadzwoni.",
  "Najlepszy czas na telefon był rano. Drugi najlepszy jest teraz.",
  "Odmowa to dane, nie wyrok.",
  "Nie licz telefonów, które zrobisz jutro. Zrób jeden więcej dzisiaj.",
  "Ludzie kupują od tych, którzy dzwonią, nie od tych, którzy planują zadzwonić.",
  "Głos pewny, oferta prosta, telefon w ręku.",
  "Serie się liczą — nie przerywaj passy dla jednej kawy za długo.",
  "Dobry sprzedawca słucha więcej, niż mówi. Ale najpierw musi wybrać numer.",
  "Nikt nie zbudował firmy czekając, aż telefon zadzwoni sam.",
  "Uśmiechnij się przed „halo” — słychać to po drugiej stronie.",
  "Statystyka nie kłamie: więcej telefonów, więcej „tak”.",
  "Dziś ich niszę, jutro cały rynek.",
  "Nie ma złych leadów, są tylko telefony, których jeszcze nie wykonałeś.",
  "Small talk krótki, oferta konkretna, follow-up zaplanowany.",
  "Pierwsze 10 sekund decyduje — więc się nie jąkaj, tylko dzwoń.",
  "Konsekwencja bije talent, kiedy talent nie odbiera telefonu.",
  "Każdy „Oddzwonię” to lead, nie porażka — zapisz i wróć.",
  "Nie czekaj na idealny moment, bo idealny moment to teraz.",
  "MMates nie robi sobie wolnego od dzwonienia, robi sobie wolne od wymówek.",
];

const TIMEZONE_CITY = {
  "Europe/Warsaw": "Warszawa",
  "Europe/Berlin": "Berlin",
  "Europe/London": "Londyn",
  "Europe/Paris": "Paryż",
  "America/New_York": "Nowy Jork",
  "America/Los_Angeles": "Los Angeles",
};

function greetingForHour(h) {
  if (h >= 5 && h < 12) return { text: "Dzień dobry", emoji: "☀️" };
  if (h >= 12 && h < 18) return { text: "Miłego popołudnia", emoji: "🌤️" };
  if (h >= 18 && h < 23) return { text: "Dobry wieczór", emoji: "🌆" };
  return { text: "Nocna zmiana?", emoji: "🌙" };
}

function utcOffsetLabel() {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  return `UTC${sign}${Math.abs(offsetMin / 60)}`;
}

// ---------- pogoda (Piotrkow Trybunalski) - doklejona do panelu powitalnego ----------
let lastWeather = null;

function weatherInlineHtml() {
  if (!lastWeather) return "";
  return ` · ${lastWeather.icon} ${lastWeather.temp}°C`;
}

async function loadWeather() {
  try {
    lastWeather = await api.get("/api/weather");
  } catch {
    // brak pogody nie powinien wywalic reszty dashboardu - zostaje placeholder "⏳"
  }
  renderGreetingPanel();
}

function renderGreetingPanel() {
  const now = new Date();
  const { text, emoji } = greetingForHour(now.getHours());
  const time = now.toLocaleTimeString("pl-PL");
  const date = now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = TIMEZONE_CITY[tz] || tz.split("/").pop().replace(/_/g, " ");
  const quote = MMATES_QUOTES[Math.floor(Date.now() / 60000) % MMATES_QUOTES.length];

  document.getElementById("greeting-panel").innerHTML = `
    <div class="greeting-main">
      <div class="greeting-text">${emoji} ${text}, <span class="greeting-brand">MMates</span></div>
      <div class="greeting-quote">${escapeHtml(quote)}</div>
    </div>
    <div class="greeting-meta">
      <div class="greeting-clock">${time}</div>
      <div class="greeting-sub">${date.charAt(0).toUpperCase() + date.slice(1)}${weatherInlineHtml()}</div>
      <div class="greeting-sub">📍 ${escapeHtml(city)} &middot; ${utcOffsetLabel()}</div>
    </div>
  `;
}

// ---------- panel zarobkow ----------

let lastRevenue = null;

const money = (n) => `${n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} zł`;

// Ile z abonamentu "utykalo" od poczatku biezacego miesiaca do teraz - czysto dla klimatu,
// zeby liczba ruszala sie na zywo (jak w panelu powitalnym z zegarem).
function monthTickerAmount(mrr) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return mrr * ((now - start) / (end - start));
}

function renderRevenuePanel() {
  const panel = document.getElementById("revenue-panel");
  if (!lastRevenue) return;
  const r = lastRevenue;
  const today = new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

  panel.innerHTML = `
    <div class="revenue-head">
      <div class="revenue-title">💰 Kasa</div>
      <div class="revenue-asof">Stan na ${today}</div>
    </div>
    <div class="revenue-row">
      <div class="revenue-item">
        <div class="revenue-num">${r.clients}</div>
        <div class="revenue-lbl">Klientów (Dopięte)</div>
      </div>
      <div class="revenue-item">
        <div class="revenue-num">${money(r.oneTime)}</div>
        <div class="revenue-lbl">Jednorazowo (${r.pricing.oneTime} zł/klient)</div>
      </div>
      <div class="revenue-item">
        <div class="revenue-num">${money(r.mrr)}</div>
        <div class="revenue-lbl">Miesięcznie (${r.pricing.monthly} zł/klient)</div>
      </div>
      <div class="revenue-item">
        <div class="revenue-num">${money(r.net)}</div>
        <div class="revenue-lbl">Netto łącznie (jednorazowe + miesięczne − koszty)</div>
      </div>
    </div>
    <div class="revenue-ticker" id="revenue-ticker"></div>
  `;
  updateRevenueTicker();
}

function updateRevenueTicker() {
  const el = document.getElementById("revenue-ticker");
  if (!el || !lastRevenue) return;
  const monthLabel = new Date().toLocaleDateString("pl-PL", { month: "long" });
  el.textContent = `📈 Abonamenty za ${monthLabel}: ${monthTickerAmount(lastRevenue.mrr).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł i tyka dalej...`;
}

// ---------- panel: najblizsze spotkania i callbacki ----------

function dayLabel(diffDays) {
  if (diffDays === -1) return "wczoraj";
  if (diffDays < 0) return `${Math.abs(diffDays)} dni temu`;
  if (diffDays === 0) return "dziś";
  if (diffDays === 1) return "jutro";
  return `za ${diffDays} dni`;
}

function upcomingItemHtml(item, withTime) {
  const d = new Date(item.when_at);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOnly = new Date(d);
  dayOnly.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dayOnly - today) / 86400000);

  const dateLabel = withTime
    ? `${d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });

  // pinezka tylko gdy lead ma notatki - klik pokazuje je w dymku (patrz openNotePopover)
  const notes = item.notes || [];
  const pin = notes.length
    ? `<button type="button" class="note-pin-btn" data-item-key="${escapeHtml(itemKey(item))}" title="Pokaż notatkę">📌</button>`
    : "";
  // ikonka osoby "Kto dzwonił" - zawsze pierwsza w rzedzie, wiec ląduje na lewo od pinezki
  // (jesli sa notatki) albo wprost na lewo od "za X dni" (jesli nie ma)
  const caller = usersByName[item.caller];
  const callerIcon = caller ? `<span class="upcoming-caller-icon" title="${escapeHtml(item.caller)}">${avatarGlyphHtml(caller, 18)}</span>` : "";

  // &lead=<id> - widok niszy przescrolluje do tego wiersza i chwilowo go podswietli
  return `
    <a class="upcoming-item" href="/niche.html?slug=${encodeURIComponent(item.niche_slug)}&lead=${item.id}">
      <div class="upcoming-who">
        <span class="upcoming-name">${escapeHtml(item.company_name)}</span>
        <span class="upcoming-niche">${escapeHtml(item.niche_name)}${item.city ? " · " + escapeHtml(item.city) : ""}</span>
      </div>
      <div class="upcoming-when">
        <span class="upcoming-date">${dateLabel}</span>
        <span class="upcoming-badge-row">${callerIcon}${pin}<span class="reminder-badge ${urgencyClass(diffDays)}">${dayLabel(diffDays)}</span></span>
      </div>
    </a>
  `;
}

// ---------- pinezka: dymek z notatkami leada ----------

// ten sam lead moze byc na obu listach (meet + callback), wiec klucz zawiera typ listy
const itemKey = (item) => `${item._list}-${item.id}`;
let upcomingNotes = new Map();
let notePopoverEl = null;

function closeNotePopover() {
  if (notePopoverEl) notePopoverEl.remove();
  notePopoverEl = null;
}

function openNotePopover(btn, notes) {
  closeNotePopover();
  const pop = document.createElement("div");
  pop.className = "note-pop";
  pop.innerHTML = notes
    .map(
      (n) => `
      <div class="note-pop-item">
        <div class="note-pop-content">${escapeHtml(n.content)}</div>
        <div class="note-pop-date">${noteDateLabel(n.created_at)}</div>
      </div>`
    )
    .join("");
  document.body.appendChild(pop);

  // dymek pod pinezka, dosuniety tak, zeby nie wyszedl poza viewport
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
  pop.style.top = `${r.bottom + 8}px`;
  notePopoverEl = pop;
}

async function loadUpcoming() {
  const { meets, meetsTotal, callbacks, callbacksTotal } = await api.get("/api/upcoming");
  const panel = document.getElementById("upcoming-panel");

  meets.forEach((i) => (i._list = "meet"));
  callbacks.forEach((i) => (i._list = "cb"));
  upcomingNotes = new Map([...meets, ...callbacks].map((i) => [itemKey(i), i.notes || []]));

  // total = wszystkie zaplanowane pozycje (nie tylko widoczne na liscie, ktora ma limit)
  const col = (title, icon, items, total, withTime) => `
    <div class="upcoming-col">
      <div class="upcoming-col-title">${icon} ${title} <span class="upcoming-count">(${total})</span></div>
      <div class="upcoming-list">
        ${
          items.length
            ? items.map((i) => upcomingItemHtml(i, withTime)).join("")
            : `<div class="upcoming-empty">Nic zaplanowanego</div>`
        }
      </div>
    </div>
  `;

  panel.innerHTML =
    col("Najbliższe Google Meety", "🖥️", meets, meetsTotal, true) +
    col("Do oddzwonienia", "📞", callbacks, callbacksTotal, false);
}

// pinezka siedzi w <a> - preventDefault, zeby klik nie nawigowal do niszy
document.getElementById("upcoming-panel").addEventListener("click", (e) => {
  const btn = e.target.closest(".note-pin-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const wasOpen = notePopoverEl && notePopoverEl.dataset.forKey === btn.dataset.itemKey;
  closeNotePopover();
  if (wasOpen) return; // drugi klik w te sama pinezke = tylko zamknij
  openNotePopover(btn, upcomingNotes.get(btn.dataset.itemKey) || []);
  notePopoverEl.dataset.forKey = btn.dataset.itemKey;
});

document.addEventListener("click", (e) => {
  if (notePopoverEl && !notePopoverEl.contains(e.target) && !e.target.closest(".note-pin-btn")) closeNotePopover();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNotePopover();
});
window.addEventListener("scroll", closeNotePopover, { passive: true });

async function loadStats() {
  const stats = await api.get("/api/stats");

  document.getElementById("global-stats").innerHTML = `
    <div class="stat-card"><div class="num">${stats.total}</div><div class="label">${statIcon("layers")}Wszystkich leadów</div></div>
    <div class="stat-card"><div class="num">${stats.called}</div><div class="label">${statIcon("check")}Zadzwonionych</div></div>
    <div class="stat-card"><div class="num">${stats.todo}</div><div class="label">${statIcon("list")}Do zrobienia</div></div>
    <div class="stat-card"><div class="num">${isRestDay() ? "💤" : `${stats.calledToday}/${stats.dailyGoal}`}</div><div class="label">${statIcon("flame")}${isRestDay() ? "Rest day" : "Dzisiaj"}</div></div>
  `;

  lastRevenue = stats.revenue;
  renderRevenuePanel();

  const donutRow = document.getElementById("donut-row");
  const total = stats.interestedBreakdown.reduce((s, o) => s + o.count, 0);
  if (!total) {
    donutRow.innerHTML = `<div class="empty-state">Brak danych do statystyk zbiorczych — zaimportuj pierwsza nisze.</div>`;
    return;
  }

  // Wykres i legenda z kropkami na stronie glownej pokazuja tylko kluczowe statusy
  // (meta.donutOrder) - reszta (np. Strona, SMS, Brak wlasciciela) nie jest tu w ogole
  // wyswietlana (nadal liczy sie do "zadzwonionych"/postepu, tylko nie zaśmieca tej listy)
  const donutData = (meta.donutOrder || [])
    .map((v) => stats.interestedBreakdown.find((o) => o.value === v))
    .filter(Boolean);
  const donutTotal = donutData.reduce((s, o) => s + o.count, 0) || 1;

  let acc = 0;
  const stops = donutData
    .filter((o) => o.count > 0)
    .map((o) => {
      const start = (acc / donutTotal) * 360;
      acc += o.count;
      return `${o.color} ${start}deg ${(acc / donutTotal) * 360}deg`;
    })
    .join(", ");

  const legendItem = (color, label, value) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${color}"></span>
      <span class="lbl">${escapeHtml(label)}</span>
      <span class="val">${value}</span>
    </div>
  `;

  const legend = donutData.map((o) => legendItem(o.color, o.label, o.count)).join("");

  const maxCaller = Math.max(1, ...stats.byCaller.map((c) => c.count));
  const topCount = Math.max(0, ...stats.byCaller.map((c) => c.count));
  const callerBars = stats.byCaller
    .map((c) => {
      const color = meta.callerColors[c.caller] || "var(--blue)";
      const w = Math.round((c.count / maxCaller) * 100);
      const crown = topCount > 0 && c.count === topCount ? `<span class="crown" title="Lider">👑</span>` : "";
      return `
        <div class="caller-bar-row">
          <span style="color:${color}; font-weight:600;">${crown}${escapeHtml(c.caller)}</span>
          <div class="caller-bar-track"><div class="caller-bar-fill" style="width:${w}%; background:${color};"></div></div>
          <span>${c.count}</span>
        </div>
      `;
    })
    .join("");

  // postep liczony wzgledem leadow bez wlasnej strony (eligible), nie wszystkich w bazie
  const calledPct = stats.eligible ? Math.round((stats.called / stats.eligible) * 100) : 0;
  const pctColor = calledPct < 50 ? "#e06050" : calledPct < 70 ? "#c0a050" : calledPct < 90 ? "#5cb85c" : "#2e7d4e";

  donutRow.innerHTML = `
    <div class="donut" style="background: conic-gradient(${stops})">
      <div class="donut-pct">
        <span class="pct-num" style="color:${pctColor}">${calledPct}%</span>
        <span class="pct-lbl">zrobione</span>
      </div>
    </div>
    <div class="legend">
      <div class="section-title" style="margin-bottom:2px">Status zainteresowania</div>
      ${legend}
    </div>
    <div class="caller-bars" style="flex:1; min-width:200px;">
      <div class="section-title" style="margin-bottom:2px">Zadzwonione wg osoby</div>
      ${callerBars || '<div class="legend-item"><span class="lbl">Brak jeszcze polaczen</span></div>'}
    </div>
  `;
}

// ---------- kto teraz jest w ktorej niszy (dashboard) ----------
// Zbiorczy odpowiednik "kto tu jest" z niche.js - tu nie interesuje nas KTORY lead,
// tylko sama obecnosc w niszy (rowniez lead_id=0, patrz server/routes/presence.js),
// wiec ikonki lezą przy calej niszy, nie przy pojedynczym wierszu leada.
let lastNiches = [];
let presenceByNiche = new Map(); // niche_id -> [{ display_name, avatar, avatar_kind, color }, ...]

function nicheRowHtml(n) {
  const pct = n.eligible ? Math.round((n.called / n.eligible) * 100) : 0;
  const present = presenceByNiche.get(n.id) || [];
  const icons = present.length
    ? `<span class="niche-presence-icons">${present.map((u) => avatarGlyphHtml(u, 20)).join("")}</span>`
    : "";
  return `
    <a class="niche-row" href="/niche.html?slug=${encodeURIComponent(n.slug)}">
      <span class="niche-dot" style="background:${n.color || "#555"}"></span>
      <span class="niche-row-name" ${n.color ? `style="color:${n.color}"` : ""}>${escapeHtml(n.name)}</span>
      ${icons}
      <span class="niche-row-count">${n.called}/${n.eligible} zadzwonionych</span>
      <span class="niche-row-progress">
        <span class="progress-track"><span class="progress-fill ${progressClass(pct)}" style="width:${pct}%"></span></span>
        <span class="progress-pct ${progressClass(pct)}">${pct}%</span>
      </span>
      <span class="niche-row-chevron">›</span>
    </a>
  `;
}

function renderNicheRows() {
  // lista wierszy w jednym boxie (nie osobne kafelki) - postep liczony wzgledem "eligible",
  // czyli leadow bez wlasnej strony (patrz STATS_ELIGIBLE_SQL po stronie serwera)
  const rows = lastNiches.map(nicheRowHtml).join("");
  document.getElementById("niche-grid").innerHTML =
    rows + `<button type="button" class="niche-row add-row" id="add-tile"><span class="niche-dot add">+</span><span class="niche-row-name">Dodaj niszę</span></button>`;
  document.getElementById("add-tile").addEventListener("click", openModal);
}

async function loadNiches() {
  lastNiches = await api.get("/api/niches");
  renderNicheRows();
}

async function pollNichePresence() {
  if (document.visibilityState !== "visible") return;
  try {
    const rows = await api.get("/api/presence/summary");
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.niche_id)) map.set(r.niche_id, []);
      map.get(r.niche_id).push(r);
    }
    presenceByNiche = map;
    renderNicheRows();
  } catch {
    // pojedynczy nieudany poll pomijamy - kolejny za chwile
  }
}

function startNichePresencePolling() {
  setInterval(pollNichePresence, 6000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pollNichePresence();
  });
  pollNichePresence();
}

// ---------- "kto teraz jest w appce" - maly box przy tytule (obejmuje Ciebie samego,
// w przeciwienstwie do reszty "kto tu jest" - patrz uzasadnienie przy GET /online) ----------
function renderTeamStatus(users) {
  const el = document.getElementById("team-status");
  if (!el) return;
  const onlineCount = users.filter((u) => u.online).length;
  const avatars = users
    .map((u) => `<span class="team-avatar ${u.online ? "online" : "offline"}" title="${escapeHtml(u.display_name)} — ${u.online ? "online" : "offline"}">${avatarGlyphHtml(u, 30)}</span>`)
    .join("");
  el.innerHTML = `<span class="team-status-avatars">${avatars}</span><span class="team-status-count">${onlineCount}/${users.length}</span>`;
}

async function pollTeamStatus() {
  if (document.visibilityState !== "visible") return;
  try {
    renderTeamStatus(await api.get("/api/presence/online"));
  } catch {
    // pojedynczy nieudany poll pomijamy - kolejny za chwile
  }
}

function startTeamStatusPolling() {
  setInterval(pollTeamStatus, 6000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pollTeamStatus();
  });
  pollTeamStatus();
}

function openModal() {
  document.getElementById("import-error").style.display = "none";
  document.getElementById("import-form").reset();
  document.getElementById("import-modal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("import-modal").classList.add("hidden");
}

document.getElementById("import-cancel").addEventListener("click", closeModal);
document.getElementById("import-modal").addEventListener("click", (e) => {
  if (e.target.id === "import-modal") closeModal();
});

document.getElementById("import-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("import-error");
  errorEl.style.display = "none";

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const niche = await api.postForm("/api/niches/import", new FormData(e.target));
    closeModal();
    location.href = `/niche.html?slug=${encodeURIComponent(niche.slug)}`;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
});

initParticles();
renderGreetingPanel();
setInterval(renderGreetingPanel, 1000);
setInterval(updateRevenueTicker, 1000);
loadWeather();
setInterval(loadWeather, 20 * 60 * 1000); // dopasowane do cache serwera (server/routes/weather.js)

pingOnlinePresence(); // "jestem na dashboardzie" - patrz auth-widget.js

(async () => {
  const [metaRes, usersRes] = await Promise.all([api.get("/api/meta"), api.get("/api/users")]);
  meta = metaRes;
  usersByName = Object.fromEntries(usersRes.map((u) => [u.display_name, u]));
  await Promise.all([loadStats(), loadNiches(), loadUpcoming()]);
  startNichePresencePolling();
  startTeamStatusPolling();
})();
