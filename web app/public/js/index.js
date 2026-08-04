let meta = null;

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
      <div class="greeting-sub">${date.charAt(0).toUpperCase() + date.slice(1)}</div>
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
      <div class="revenue-item accent-gold">
        <div class="revenue-num">${money(r.oneTime)}</div>
        <div class="revenue-lbl">Jednorazowo (${r.pricing.oneTime} zł/klient)</div>
      </div>
      <div class="revenue-item accent-green">
        <div class="revenue-num">${money(r.mrr)}</div>
        <div class="revenue-lbl">Miesięcznie (${r.pricing.monthly} zł/klient)</div>
      </div>
      <div class="revenue-item accent-blue">
        <div class="revenue-num">${money(r.annual)}</div>
        <div class="revenue-lbl">Rocznie z abonamentów</div>
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
  if (diffDays < 0) return `${Math.abs(diffDays)} dni temu`;
  if (diffDays === 0) return "dziś";
  if (diffDays === 1) return "jutro";
  return `za ${diffDays} dni`;
}
function urgencyClass(diffDays) {
  if (diffDays <= 0) return "r-due"; // dzis albo przeterminowane
  if (diffDays <= 3) return "r-soon"; // jutro / za kilka dni
  return "r-future";
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

  return `
    <a class="upcoming-item" href="/niche.html?slug=${encodeURIComponent(item.niche_slug)}">
      <div class="upcoming-who">
        <span class="upcoming-name">${escapeHtml(item.company_name)}</span>
        <span class="upcoming-niche">${escapeHtml(item.niche_name)}${item.city ? " · " + escapeHtml(item.city) : ""}</span>
      </div>
      <div class="upcoming-when">
        <span class="upcoming-date">${dateLabel}</span>
        <span class="reminder-badge ${urgencyClass(diffDays)}">${dayLabel(diffDays)}</span>
      </div>
    </a>
  `;
}

async function loadUpcoming() {
  const { meets, callbacks } = await api.get("/api/upcoming");
  const panel = document.getElementById("upcoming-panel");

  const col = (title, icon, items, withTime) => `
    <div class="upcoming-col">
      <div class="upcoming-col-title">${icon} ${title}</div>
      <div class="upcoming-list">
        ${
          items.length
            ? items.map((i) => upcomingItemHtml(i, withTime)).join("")
            : `<div class="upcoming-empty">Nic zaplanowanego</div>`
        }
      </div>
    </div>
  `;

  panel.innerHTML = col("Najbliższe Google Meety", "🖥️", meets, true) + col("Do oddzwonienia", "📞", callbacks, false);
}

async function loadStats() {
  const stats = await api.get("/api/stats");

  document.getElementById("global-stats").innerHTML = `
    <div class="stat-card"><div class="num">${stats.total}</div><div class="label">Wszystkich leadow</div></div>
    <div class="stat-card accent-green"><div class="num">${stats.called}</div><div class="label">Zadzwonionych</div></div>
    <div class="stat-card accent-red"><div class="num">${stats.todo}</div><div class="label">Do zrobienia</div></div>
    <div class="stat-card accent-blue"><div class="num">${stats.calledToday}/${stats.dailyGoal}</div><div class="label">Dzisiaj</div></div>
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

  const calledPct = stats.total ? Math.round((stats.called / stats.total) * 100) : 0;
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

async function loadNiches() {
  const niches = await api.get("/api/niches");

  const tiles = niches
    .map((n) => {
      const pct = n.total ? Math.round((n.called / n.total) * 100) : 0;
      return `
        <div class="niche-tile" ${n.color ? `style="border-left:3px solid ${n.color}"` : ""}
             onclick="location.href='/niche.html?slug=${encodeURIComponent(n.slug)}'">
          <div class="name" ${n.color ? `style="color:${n.color}"` : ""}>${escapeHtml(n.name)}</div>
          <div class="count">${n.called}/${n.total} zadzwonionych</div>
          <div class="progress-row">
            <div class="progress-track"><div class="progress-fill ${progressClass(pct)}" style="width:${pct}%"></div></div>
            <span class="progress-pct ${progressClass(pct)}">${pct}%</span>
          </div>
        </div>
      `;
    })
    .join("");

  document.getElementById("niche-grid").innerHTML =
    tiles + `<div class="niche-tile add-tile" id="add-tile">+</div>`;
  document.getElementById("add-tile").addEventListener("click", openModal);
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

(async () => {
  meta = await api.get("/api/meta");
  await Promise.all([loadStats(), loadNiches(), loadUpcoming()]);
})();
