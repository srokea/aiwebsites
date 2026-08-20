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

// "W grze": leady tuz przed finiszem (Meet odbyty/umowiony albo czekajace na podpis, patrz
// pipelineCount w server/routes/stats.js) - motywacyjna linijka obok tykajacego abonamentu:
// "gdybyscie domkneli WSZYSTKO co juz macie w toku, tyle wpadnie do abonamentu co miesiac".
function pipelineHtml(r) {
  if (!r.pipelineCount) return "";
  const word = r.pipelineCount === 1 ? "Meet" : r.pipelineCount < 5 ? "Meety" : "Meetów";
  const bonus = r.pipelineCount * r.pricing.monthly;
  return `<div class="revenue-potential">🚀 W grze: <b>${r.pipelineCount}</b> ${word} — domknij wszystkie i abonament rośnie o <b>+${money(bonus)}</b>/mies.</div>`;
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
        <div class="revenue-num" data-count="${r.clients}">0</div>
        <div class="revenue-lbl">Klientów (Dopięte)</div>
      </div>
      <div class="revenue-item">
        <div class="revenue-num" data-count="${r.oneTime}" data-money>0 zł</div>
        <div class="revenue-lbl">Jednorazowo (${r.pricing.oneTime} zł/klient)</div>
      </div>
      <div class="revenue-item">
        <div class="revenue-num" data-count="${r.mrr}" data-money>0 zł</div>
        <div class="revenue-lbl">Miesięcznie (${r.pricing.monthly} zł/klient)</div>
      </div>
      <div class="revenue-item">
        <div class="revenue-num" data-count="${r.net}" data-money>0 zł</div>
        <div class="revenue-lbl">Netto łącznie (jednorazowe + miesięczne − koszty)</div>
      </div>
    </div>
    <div class="revenue-ticker-row">
      <div class="revenue-ticker" id="revenue-ticker"></div>
      ${pipelineHtml(r)}
    </div>
  `;
  updateRevenueTicker();
  // dopaminowy "doliczanie do wartosci" tak samo jak % zrobienia na wykresie - patrz
  // countUpValue/countUpPct nizej (ta sama sekcja animacji przy swiezych danych)
  panel.querySelectorAll(".revenue-num[data-count]").forEach((el) => {
    countUpValue(el, Number(el.dataset.count), "money" in el.dataset ? money : String);
  });
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

// #14 - kolko postepu budowy strony przy pozycji w "Najblizsze Google Meety". Klik przestawia
// na kolejny etap (i zawija sie z powrotem na "Wcale"), zeby dalo sie to ustawic bez wchodzenia
// w nisze - etapy i kolory pochodza z SITE_PROGRESS_OPTIONS w server/constants.js.
function siteProgressHtml(item) {
  const stages = (meta && meta.siteProgressOptions) || [];
  if (!stages.length) return "";
  const stage = stages.find((s) => s.value === (item.site_progress || 0)) || stages[0];
  const circumference = 2 * Math.PI * 7;
  return `
    <button type="button" class="site-progress" data-progress-lead="${item.id}" data-progress-stage="${stage.value}"
            title="Strona: ${escapeHtml(stage.label)} — kliknij, żeby zmienić">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="7" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"></circle>
        <circle cx="10" cy="10" r="7" fill="none" stroke="${stage.color}" stroke-width="3" stroke-linecap="round"
                transform="rotate(-90 10 10)"
                stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - stage.pct / 100)}"></circle>
      </svg>
    </button>
  `;
}

// #10 - guzik kopiujacy gotowego SMS-a z podstawiona godzina jutrzejszego spotkania
function smsCopyHtml(item, d) {
  const hour = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return `<button type="button" class="sms-copy-btn" data-sms-hour="${escapeHtml(hour)}" title="Skopiuj SMS potwierdzający">✉️</button>`;
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

  // Na liscie Closing data to ostatnia zmiana leada, a nie umowiony termin - wiec zamiast
  // "16 dni temu" (co sugerowaloby przegapiony termin) mowimy wprost, ile lezy bez ruchu.
  const badgeText =
    item._list === "closing" ? (diffDays === 0 ? "dziś ruszone" : `${Math.abs(diffDays)} dni bez ruchu`) : dayLabel(diffDays);

  // pinezka tylko gdy lead ma notatki - klik pokazuje je w dymku (patrz openNotePopover)
  const notes = item.notes || [];
  const pin = notes.length
    ? `<button type="button" class="note-pin-btn" data-item-key="${escapeHtml(itemKey(item))}" title="Pokaż notatkę">📌</button>`
    : "";
  // ikonka osoby "Kto dzwonił" - zawsze pierwsza w rzedzie, wiec ląduje na lewo od pinezki
  // (jesli sa notatki) albo wprost na lewo od "za X dni" (jesli nie ma)
  // obramowka wokol avatara w kolorze TEJ osoby (Sylwester niebieski, Nikodem pomaranczowy) -
  // zeby jednym rzutem oka bylo widac, czyj to termin, bez czytania tooltipa
  const caller = usersByName[item.caller];
  const ring = caller ? caller.color || (meta && meta.callerColors[item.caller]) || "#888" : "#888";
  const callerIcon = caller
    ? `<span class="upcoming-caller-icon" style="--ring-color:${ring}" title="${escapeHtml(item.caller)}">${avatarGlyphHtml(caller, 18)}</span>`
    : "";

  // dodatki zalezne od listy: postep strony przy Meetach, guzik SMS przy jutrzejszych
  const extra = item._list === "meet" ? siteProgressHtml(item) : item._list === "sms" ? smsCopyHtml(item, d) : "";

  // &lead=<id> - widok niszy przescrolluje do tego wiersza i chwilowo go podswietli
  return `
    <a class="upcoming-item" href="/niche.html?slug=${encodeURIComponent(item.niche_slug)}&lead=${item.id}">
      <div class="upcoming-who">
        <span class="upcoming-name">${escapeHtml(item.company_name)}</span>
        <span class="upcoming-niche">${escapeHtml(item.niche_name)}${item.city ? " · " + escapeHtml(item.city) : ""}</span>
      </div>
      <div class="upcoming-when">
        <span class="upcoming-date">${dateLabel}</span>
        <span class="upcoming-badge-row">${extra}${callerIcon}${pin}<span class="reminder-badge ${urgencyClass(diffDays)}">${badgeText}</span></span>
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

// #4 - przelacznik "Moje" nad panelem "Najblizsze": zawezenie wszystkich 4 list do leadow
// przypisanych zalogowanemu (patrz "caller" na leadzie). Serwer filtruje sam (nie tylko widoczne
// pozycje, ale i licznik "(N)" w naglowku), wiec przy wlaczonym przelaczniku dociagamy dane od nowa
// zamiast przycinac juz wczytana (nieprzefiltrowana) liste po stronie przegladarki.
let showOnlyMine = false;

async function loadUpcoming() {
  const url =
    showOnlyMine && currentUser
      ? `/api/upcoming?caller=${encodeURIComponent(currentUser.display_name)}`
      : "/api/upcoming";
  const { meets, meetsTotal, callbacks, callbacksTotal, sms, smsTotal, closing, closingTotal } = await api.get(url);
  const panel = document.getElementById("upcoming-panel");

  meets.forEach((i) => (i._list = "meet"));
  callbacks.forEach((i) => (i._list = "cb"));
  sms.forEach((i) => (i._list = "sms"));
  closing.forEach((i) => (i._list = "closing"));
  upcomingNotes = new Map([...meets, ...callbacks, ...sms, ...closing].map((i) => [itemKey(i), i.notes || []]));

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
    col("Do oddzwonienia", "📞", callbacks, callbacksTotal, false) +
    col("SMS do wysłania", "✉️", sms, smsTotal, true) +
    col("Closing", "🤝", closing, closingTotal, false);
}

const mineToggleInput = document.getElementById("upcoming-mine-toggle");
mineToggleInput.addEventListener("change", async (e) => {
  // bez zalogowanego usera (jeszcze nie doladowany) nie ma czego filtrowac - w praktyce
  // zmiana zawsze przychodzi dlugo po starcie strony, wiec currentUser juz jest gotowy
  if (!currentUser) {
    e.target.checked = false;
    return;
  }
  showOnlyMine = e.target.checked;
  await loadUpcoming();
});

// Kopiowanie dziala tez po zwyklym http (appka chodzi na http://...:3000), gdzie
// navigator.clipboard w ogole nie istnieje - stad fallback na stara metode z <textarea>.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // np. odmowa uprawnien - lecimy fallbackiem ponizej
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed; top:-1000px; opacity:0;";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

// Odmalowuje sam guzik po zmianie etapu (bez przeladowania calej listy) - patrz uzasadnienie
// przy wywolaniu ponizej.
function applySiteProgressStage(btn, stage) {
  const circumference = 2 * Math.PI * 7;
  btn.dataset.progressStage = stage.value;
  btn.title = `Strona: ${stage.label} — kliknij, żeby zmienić`;
  const ring = btn.querySelector("svg circle:last-child");
  ring.setAttribute("stroke", stage.color);
  ring.setAttribute("stroke-dashoffset", circumference * (1 - stage.pct / 100));
}

// #14 - klik w kolko przestawia etap budowy strony na kolejny (po ostatnim wraca na "Wcale").
// Odswiezamy TYLKO ten guzik (nie cale loadUpcoming()) - kazda z 4 list ma wlasny wewnetrzny
// scroll (.upcoming-list, max-height + overflow-y), a panel.innerHTML = ... w loadUpcoming()
// buduje te listy od zera, wiec kazdy taki reload zerowal scrollTop i "wyrzucal" na gore listy
// kogokolwiek, kto byl przescrollowany nizej - dokladnie ten bug, ktory to omija.
document.getElementById("upcoming-panel").addEventListener("click", async (e) => {
  const btn = e.target.closest(".site-progress");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const stages = meta.siteProgressOptions || [];
  const current = Number(btn.dataset.progressStage);
  const idx = stages.findIndex((s) => s.value === current);
  const next = stages[(idx + 1) % stages.length];
  try {
    await api.patch(`/api/leads/${btn.dataset.progressLead}`, { site_progress: next.value });
    applySiteProgressStage(btn, next);
  } catch (err) {
    alert("Nie udalo sie zapisac postepu strony: " + err.message);
  }
});

// #10 - guzik kopiuje gotowa tresc SMS-a z podstawiona godzina jutrzejszego spotkania
document.getElementById("upcoming-panel").addEventListener("click", async (e) => {
  const btn = e.target.closest(".sms-copy-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const text = (meta.smsConfirmTemplate || "").replace("{godzina}", btn.dataset.smsHour);
  const ok = await copyText(text);
  btn.textContent = ok ? "✅" : "✖";
  btn.classList.toggle("copied", ok);
  setTimeout(() => {
    btn.textContent = "✉️";
    btn.classList.remove("copied");
  }, 1600);
});

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

// ---------- #9: animacja wykresow przy wejsciu i po odswiezeniu ----------
// Wykresy rysuja sie "od zera" za kazdym razem, gdy dane sa swiezo wczytane (wejscie na strone,
// F5, powrot z podstrony) - nie przy kazdym pollingu obecnosci, zeby nie migalo co 6 sekund.

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// procent w srodku donuta dobija do wartosci razem z rysowaniem pierscienia
function countUpPct(el, to, duration = 900) {
  if (!el) return;
  if (reducedMotion()) {
    el.textContent = `${to}%`;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = `${Math.round(to * (1 - Math.pow(1 - t, 3)))}%`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Ten sam "dopaminowy" doliczanie co countUpPct, tylko na dowolna liczbe/kwote (panel Kasy) -
// stad osobny formatter zamiast sztywnego dopisywania "%".
function countUpValue(el, to, format = String, duration = 900) {
  if (!el) return;
  if (reducedMotion()) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(Math.round(to * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Paski renderuja sie z width:0 i docelowa szerokoscia w data-w - tu tylko ja przypisujemy,
// a rozjezdzanie sie robi transition z CSS. Podwojne rAF, bo po jednym przegladarka potrafi
// zlaczyc "0%" i "60%" w jedno wyliczenie stylu i animacja by nie ruszyla.
function growBars(selector, stagger = 90) {
  const bars = [...document.querySelectorAll(selector)];
  if (!bars.length) return;
  if (reducedMotion()) {
    bars.forEach((b) => (b.style.width = `${b.dataset.w}%`));
    return;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      bars.forEach((b, i) => {
        b.style.transitionDelay = `${i * stagger}ms`;
        b.style.width = `${b.dataset.w}%`;
      });
    })
  );
}

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
        <div class="caller-bar-row clickable" data-caller="${escapeHtml(c.caller)}" title="Statystyki: ${escapeHtml(c.caller)}">
          <span style="color:${color}; font-weight:600;">${crown}${escapeHtml(c.caller)}</span>
          <div class="caller-bar-track"><div class="caller-bar-fill" style="width:0; background:${color};" data-w="${w}"></div></div>
          <span>${c.count}</span>
        </div>
      `;
    })
    .join("");

  // postep liczony wzgledem leadow bez wlasnej strony (eligible), nie wszystkich w bazie
  const calledPct = stats.eligible ? Math.round((stats.called / stats.eligible) * 100) : 0;
  const pctColor = calledPct < 50 ? "#e06050" : calledPct < 70 ? "#c0a050" : calledPct < 90 ? "#5cb85c" : "#2e7d4e";

  // pierscien to osobna warstwa pod srodkiem donuta - dzieki temu maska animujaca rysowanie
  // wykresu nie zjada tez procentu w srodku (maska dziala na cale poddrzewo elementu)
  donutRow.innerHTML = `
    <div class="donut">
      <div class="donut-ring" style="background: conic-gradient(${stops})"></div>
      <div class="donut-pct">
        <span class="pct-num" style="color:${pctColor}">0%</span>
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

  countUpPct(donutRow.querySelector(".pct-num"), calledPct);
  growBars(".caller-bar-fill");
}

// ---------- kto teraz jest w ktorej niszy (dashboard) ----------
// Zbiorczy odpowiednik "kto tu jest" z niche.js - tu nie interesuje nas KTORY lead,
// tylko sama obecnosc w niszy (rowniez lead_id=0, patrz server/routes/presence.js),
// wiec ikonki lezą przy calej niszy, nie przy pojedynczym wierszu leada.
let lastNiches = [];
let presenceByNiche = new Map(); // niche_id -> [{ display_name, avatar, avatar_kind, color }, ...]

let nicheBarsAnimated = false;

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
        <span class="progress-track"><span class="progress-fill ${progressClass(pct)}" style="width:${nicheBarsAnimated ? pct : 0}%" data-w="${pct}"></span></span>
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

  if (!nicheBarsAnimated) {
    nicheBarsAnimated = true;
    growBars(".niche-row-progress .progress-fill", 50);
  }
}

async function loadNiches() {
  lastNiches = await api.get("/api/niches");
  nicheBarsAnimated = false; // swieze dane = paski rysuja sie od nowa (patrz growBars)
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
    .map(
      (u) =>
        `<span class="team-avatar clickable ${u.online ? "online" : "offline"}" data-caller="${escapeHtml(u.display_name)}" title="${escapeHtml(u.display_name)} — ${u.online ? "online" : "offline"} · kliknij po statystyki">${avatarGlyphHtml(u, 30)}</span>`
    )
    .join("");
  el.innerHTML = `<span class="team-status-avatars">${avatars}</span><span class="team-status-count">${onlineCount}/${users.length}</span>`;
  // caly zespol online = wyrazna zielen, ktos brakuje = przygaszony pomarancz, nikogo nie ma =
  // neutralny szary (bez klasy) - patrz .team-status.status-* w style.css
  el.classList.toggle("status-full", users.length > 0 && onlineCount === users.length);
  el.classList.toggle("status-partial", onlineCount > 0 && onlineCount < users.length);
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

// ---------- #1: statystyki jednej osoby (klik w avatar w pasku online albo w jej wiersz
// na wykresie "Zadzwonione wg osoby") ----------
// Modal budowany raz i doklejany do body - dokladnie tak samo jak panel profilu w auth-widget.js,
// zeby nie trzymac w index.html markupu, ktory przez wiekszosc czasu jest niepotrzebny.

let callerModalEl = null;

function ensureCallerModal() {
  if (callerModalEl) return callerModalEl;
  const el = document.createElement("div");
  el.className = "modal-overlay hidden";
  el.id = "caller-modal";
  el.innerHTML = `<div class="modal caller-modal"><div id="caller-modal-body"></div></div>`;
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.id === "caller-modal-close") el.classList.add("hidden");
  });
  document.body.appendChild(el);
  callerModalEl = el;
  return el;
}

// pasek w kolorze pozycji (status / nisza) - ten sam ksztalt co "Zadzwonione wg osoby"
function statBarRow(label, count, max, color) {
  const w = max ? Math.round((count / max) * 100) : 0;
  return `
    <div class="caller-bar-row">
      <span style="color:${color}; font-weight:600;">${escapeHtml(label)}</span>
      <div class="caller-bar-track"><div class="caller-bar-fill" style="width:0; background:${color};" data-w="${w}"></div></div>
      <span>${count}</span>
    </div>
  `;
}

function renderCallerStats(s, user) {
  const color = (user && user.color) || (meta && meta.callerColors[s.caller]) || "#6090e0";
  // #12 - pokazujemy KAZDY status z listy (nawet 0), zeby np. brak jeszcze zadnego "Dopiete"
  // nie znikal z wykresu, tylko byl widoczny jako pasek z zerem
  const statuses = s.interestedBreakdown;
  const maxStatus = Math.max(1, ...statuses.map((o) => o.count));
  const maxNiche = Math.max(1, ...s.byNiche.map((n) => n.c));

  const tile = (num, lbl) => `<div class="caller-stat"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;

  document.getElementById("caller-modal-body").innerHTML = `
    <div class="caller-modal-head">
      ${user ? avatarGlyphHtml(user, 48) : ""}
      <div>
        <div class="caller-modal-name" style="color:${color}">${escapeHtml(s.caller)}</div>
        <div class="caller-modal-sub">${s.sharePct}% wszystkich telefonów zespołu</div>
      </div>
    </div>

    <div class="caller-stat-grid">
      ${tile(s.called, "Zadzwonionych")}
      ${tile(isRestDay() ? "💤" : `${s.calledToday}/${s.dailyGoal}`, isRestDay() ? "Rest day" : "Dzisiaj")}
      ${tile(s.calledWeek, "Ostatnie 7 dni")}
      ${tile(s.answered, "Odebranych")}
      ${tile(s.clients, "Dopiętych")}
      ${tile(s.meetsAhead, "Meety przed nami")}
    </div>

    <div class="caller-modal-money-row">
      <div class="caller-modal-money">💰 Wykręcone: <b>${money(s.earned)}</b></div>
      <div class="caller-modal-money">🎯 Success ratio: <b>${s.called ? Math.round((s.clients / s.called) * 100) : 0}%</b></div>
    </div>

    <div class="section-title" style="margin-bottom:2px">Statusy</div>
    <div class="caller-bars">
      ${statuses.length ? statuses.map((o) => statBarRow(o.label, o.count, maxStatus, o.color)).join("") : '<div class="legend-item"><span class="lbl">Jeszcze nic tu nie ma</span></div>'}
    </div>

    <div class="section-title" style="margin-bottom:2px">Zadzwonione wg niszy</div>
    <div class="caller-bars">
      ${s.byNiche.length ? s.byNiche.map((n) => statBarRow(n.name, n.c, maxNiche, n.color || "#6090e0")).join("") : '<div class="legend-item"><span class="lbl">Jeszcze zadnego telefonu</span></div>'}
    </div>

    <div class="actions"><button type="button" class="btn" id="caller-modal-close">Zamknij</button></div>
  `;
  growBars("#caller-modal .caller-bar-fill", 40);
}

async function openCallerStats(name) {
  const el = ensureCallerModal();
  document.getElementById("caller-modal-body").innerHTML = `<div class="empty-state">Liczę…</div>`;
  el.classList.remove("hidden");
  try {
    renderCallerStats(await api.get(`/api/stats/caller/${encodeURIComponent(name)}`), usersByName[name]);
  } catch (err) {
    document.getElementById("caller-modal-body").innerHTML =
      `<div class="empty-state">${escapeHtml(err.message)}</div><div class="actions"><button type="button" class="btn" id="caller-modal-close">Zamknij</button></div>`;
  }
}

// oba miejsca z osobami (pasek online i wykres "wg osoby") przebudowuja sie przy kazdym
// pollingu, wiec nasluch siedzi na kontenerach, nie na samych elementach
for (const id of ["team-status", "donut-row"]) {
  document.getElementById(id).addEventListener("click", (e) => {
    const target = e.target.closest("[data-caller]");
    if (target) openCallerStats(target.dataset.caller);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && callerModalEl) callerModalEl.classList.add("hidden");
});

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

// Powrot "wstecz" z niszy/scheme oddaje strone z bfcache - ze statystykami sprzed wyjscia.
// Dociagamy je same, zeby nie trzeba bylo dodatkowo odswiezac recznie (wykresy rysuja sie
// przy okazji od nowa, patrz growBars/countUpPct).
window.addEventListener("pageshow", (e) => {
  if (!e.persisted || !meta) return;
  Promise.all([loadStats(), loadNiches(), loadUpcoming()]).catch(() => {});
});

(async () => {
  const [metaRes, usersRes] = await Promise.all([api.get("/api/meta"), api.get("/api/users")]);
  meta = metaRes;
  usersByName = Object.fromEntries(usersRes.map((u) => [u.display_name, u]));
  await Promise.all([loadStats(), loadNiches(), loadUpcoming()]);
  startNichePresencePolling();
  startTeamStatusPolling();
})();
