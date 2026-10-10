// Statystyki "na przestrzeni lat": ile dopietych bylo przy N-tym callu (np. "majac 50 calli"),
// kamienie milowe i rozklad na miesiace/lata. Dane = surowe zdarzenia z /api/stats/history
// (call, dopiecie, Meet), wszystko liczone tutaj - pytanie "przy X callach" odpowiada od reki.

initParticles();

const fmtDate = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const pct = (a, b) => (b ? `${((a / b) * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%` : "—");
const oneIn = (calls, deals) => (deals ? `1 na ${Math.round(calls / deals)}` : "—");
const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const FALLBACK_COLORS = ["#6090e0", "#cc7d44"];

let data = null; // { callers, calls, deals, meets }
let scope = "all"; // "all" albo indeks osoby
let gran = "month";

// ---------- kolory serii ----------
// Kolor osoby z appki (users.color), ale z jasnoscia przycieta do pasma czytelnego na ciemnym tle
// (OKLCH L 0.50-0.66) - ten sam odcien, wiec osoba zostaje "swoim" kolorem; zbyt jasny pomaranczowy
// zlewal sie z tekstem. Konwersja sRGB <-> OKLab (Ottosson).
function chartColor(hex, i) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return FALLBACK_COLORS[i % FALLBACK_COLORS.length];
  const n = parseInt(m[1], 16);
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  let L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  L = Math.min(0.66, Math.max(0.5, L));
  const l2 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m2 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const out = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${out(4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2)}${out(-1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2)}${out(-0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2)}`;
}

// ---------- obliczenia ----------

const inScope = (who) => scope === "all" || who === scope;
const scopedCalls = () => data.calls.filter((c) => inScope(c[1]));
const scopedDeals = () => data.deals.filter((d) => inScope(d[1]));
const meetMs = (term) => new Date(term).getTime(); // lokalny "YYYY-MM-DDTHH:MM"

// dla listy calli (posortowanej) i dopiec: ile dopietych bylo do chwili n-tego callu (n od 1)
function dealsAtEachCall(calls, deals) {
  const out = new Array(calls.length);
  let j = 0;
  for (let i = 0; i < calls.length; i++) {
    while (j < deals.length && deals[j][0] <= calls[i][0]) j++;
    out[i] = j;
  }
  return out;
}

function renderScope() {
  const btns = [`<button type="button" data-s="all">Razem</button>`].concat(
    data.callers.map((c, i) => `<button type="button" data-s="${i}">${escapeHtml(c.name)}</button>`)
  );
  const el = document.getElementById("st-scope");
  el.innerHTML = btns.join("");
  for (const b of el.children) b.classList.toggle("active", b.dataset.s === String(scope));
}

function renderTiles() {
  const calls = scopedCalls();
  const deals = scopedDeals();
  const answered = calls.filter((c) => c[2]).length;
  const now = Date.now();
  const meets = data.meets.filter((m) => inScope(m[1]) && meetMs(m[0]) <= now).length;
  const tile = (lbl, val, sub = "") =>
    `<div class="ledger-summary-item"><span class="ledger-lbl">${lbl}</span><span class="ledger-val">${val}</span>${sub ? `<span class="st-tile-sub">${sub}</span>` : ""}</div>`;
  document.getElementById("st-tiles").innerHTML = [
    tile("Calle", calls.length.toLocaleString("pl-PL"), calls.length ? `od ${fmtDate(calls[0][0])}` : ""),
    tile("Odebrane", answered.toLocaleString("pl-PL"), pct(answered, calls.length)),
    tile("Meety", meets.toLocaleString("pl-PL"), "wg terminu Meeta"),
    tile("Dopięte", deals.length.toLocaleString("pl-PL"), `${pct(deals.length, calls.length)} calli`),
    tile("1 dopięty na", deals.length ? String(Math.round(calls.length / deals.length)) : "—", deals.length ? "calli" : "jeszcze brak"),
  ].join("");
}

function renderAsk() {
  const el = document.getElementById("st-ask-answer");
  const n = Math.floor(Number(document.getElementById("st-ask-n").value));
  const calls = scopedCalls();
  const who = scope === "all" ? "Razem" : data.callers[scope].name;
  if (!n || n < 1) {
    el.innerHTML = "";
    return;
  }
  if (n > calls.length) {
    el.innerHTML = `${escapeHtml(who)}: na razie <b>${calls.length}</b> calli — do ${n} brakuje ${n - calls.length}. Teraz dopięte: <b>${scopedDeals().length}</b>.`;
    return;
  }
  const t = calls[n - 1][0];
  const d = scopedDeals().filter((x) => x[0] <= t).length;
  el.innerHTML = `${escapeHtml(who)}: ${n}. call był <b>${fmtDate(t)}</b> — do tego dnia dopięte: <b>${d}</b> (${d ? oneIn(n, d) + " calli" : "jeszcze żadnego"}).`;
}

// ---------- wykres: dopiete przy n-tym callu, osobna linia na osobe ----------

// geometria z szerokosci kontenera (viewBox = piksele), zeby napisy nie malaly na telefonie
function geometry(host) {
  const w = Math.max(300, Math.min(680, Math.round(host.clientWidth || 680)));
  const h = w < 500 ? 200 : 226;
  return { x0: 34, x1: w - 78, y0: 14, y1: h - 30, w, h };
}

function niceStep(max, target = 5) {
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) || mag * 10;
}

function renderChart() {
  const host = document.getElementById("st-plot");
  const series = data.callers.map((c, i) => {
    const calls = data.calls.filter((x) => x[1] === i);
    const deals = data.deals.filter((x) => x[1] === i);
    return { i, name: c.name, color: chartColor(c.color, i), calls, at: dealsAtEachCall(calls, deals) };
  });
  document.getElementById("st-legend").innerHTML = series
    .map((s) => `<span class="st-legend-item${scope !== "all" && scope !== s.i ? " is-muted" : ""}"><span class="st-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>`)
    .join("");

  const maxCalls = Math.max(0, ...series.map((s) => s.calls.length));
  for (const s of series) s.total = data.deals.filter((x) => x[1] === s.i).length;
  if (!maxCalls) {
    host.innerHTML = `<div class="networth-empty">Brak calli przypisanych do osób — wykres pojawi się po pierwszych telefonach.</div>`;
    return;
  }
  const maxDeals = Math.max(1, ...series.map((s) => s.total));
  const { x0, x1, y0, y1, w, h } = geometry(host);
  const X = (n) => x0 + (n / maxCalls) * (x1 - x0);
  const Y = (v) => y1 - (v / maxDeals) * (y1 - y0);

  let grid = "";
  const yStep = Math.max(1, niceStep(maxDeals, 4));
  for (let v = 0; v <= maxDeals; v += yStep) {
    grid += `<line x1="${x0}" y1="${Y(v).toFixed(1)}" x2="${x1}" y2="${Y(v).toFixed(1)}" class="nw-grid"/>`;
    grid += `<text x="${x0 - 6}" y="${Y(v).toFixed(1)}" class="nw-ylabel">${v}</text>`;
  }
  const xStep = niceStep(maxCalls, 5);
  for (let n = 0; n <= maxCalls; n += xStep) {
    grid += `<text x="${X(n).toFixed(1)}" y="${h - 6}" class="nw-xlabel">${n}</text>`;
  }

  // muted = inna osoba niz wybrana (emfaza zamiast przemalowania - kolor zostaje przy osobie)
  const order = [...series].sort((a, b) => (a.i === scope) - (b.i === scope));
  let lines = "";
  let labels = "";
  for (const s of order) {
    if (!s.calls.length) continue;
    const muted = scope !== "all" && scope !== s.i;
    let d = `M ${X(0).toFixed(1)},${Y(0).toFixed(1)}`;
    let prev = 0;
    s.at.forEach((v, k) => {
      const x = X(k + 1).toFixed(1);
      d += ` L ${x},${Y(prev).toFixed(1)}`;
      if (v !== prev) d += ` L ${x},${Y(v).toFixed(1)}`;
      prev = v;
    });
    if (s.total > prev) {
      d += ` L ${X(s.calls.length).toFixed(1)},${Y(s.total).toFixed(1)}`;
      prev = s.total;
    }
    lines += `<path d="${d}" class="st-line${muted ? " is-muted" : ""}" style="stroke:${muted ? "var(--muted-soft)" : s.color}"/>`;
    const ex = X(s.calls.length);
    const ey = Y(prev);
    if (!muted) {
      lines += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" class="st-end" style="fill:${s.color}"/>`;
      labels += `<text x="${(ex + 8).toFixed(1)}" y="${ey.toFixed(1)}" class="st-endlabel">${escapeHtml(s.name)} · ${prev}</text>`;
    }
  }

  host.innerHTML = `
    <svg class="nw-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Dopięte przy kolejnych callach — każda osoba osobno">
      ${grid}${lines}${labels}
      <line class="nw-cross" id="st-cross" x1="0" y1="${y0}" x2="0" y2="${y1}" style="display:none"/>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="transparent" id="st-hit"/>
    </svg>
    <div class="nw-tip st-tip" id="st-tip" hidden></div>`;

  const svg = host.querySelector("svg");
  const cross = host.querySelector("#st-cross");
  const tip = host.querySelector("#st-tip");
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const svgX = ((e.clientX - r.left) / r.width) * w;
    const n = Math.max(1, Math.min(maxCalls, Math.round(((svgX - x0) / (x1 - x0)) * maxCalls)));
    cross.setAttribute("x1", X(n));
    cross.setAttribute("x2", X(n));
    cross.style.display = "";
    const rows = series
      .filter((s) => s.calls.length)
      .map((s) => {
        const val = n <= s.calls.length ? `<b>${s.at[n - 1]}</b> dopięte · ${fmtDate(s.calls[n - 1][0])}` : `dopiero ${s.calls.length} calli`;
        return `<span class="st-tip-row"><span class="st-swatch" style="background:${s.color}"></span>${escapeHtml(s.name)}: ${val}</span>`;
      })
      .join("");
    tip.hidden = false;
    tip.innerHTML = `<span class="nw-tip-k">${n}. call</span>${rows}`;
    tip.style.left = `${Math.max(14, Math.min(80, (X(n) / w) * 100))}%`;
  };
  const hit = host.querySelector("#st-hit");
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => {
    cross.style.display = "none";
    tip.hidden = true;
  });
}

// ---------- tabele ----------

const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000];

function renderMilestones() {
  const calls = scopedCalls();
  const at = dealsAtEachCall(calls, scopedDeals());
  const marks = MILESTONES.filter((m) => m < calls.length);
  if (calls.length) marks.push(calls.length);
  const totalDeals = scopedDeals().length;
  const el = document.getElementById("st-milestones");
  if (!marks.length) {
    el.innerHTML = `<tbody><tr><td class="st-empty">Brak calli.</td></tr></tbody>`;
    return;
  }
  el.innerHTML = `
    <thead><tr><th>Po callach</th><th>Kiedy</th><th class="num">Dopięte</th><th class="num">Konwersja</th></tr></thead>
    <tbody>${marks
      .map((n, k) => {
        // wiersz "teraz" = stan na dzis (jak kafelki) - lacznie z dopieciami po ostatnim callu
        const isNow = k === marks.length - 1;
        const d = isNow ? totalDeals : at[n - 1];
        return `<tr${isNow ? ' class="st-now"' : ""}><td>${n.toLocaleString("pl-PL")}${isNow ? ' <span class="st-now-tag">teraz</span>' : ""}</td><td>${isNow ? "dziś" : fmtDate(calls[n - 1][0])}</td><td class="num">${d}</td><td class="num">${pct(d, n)}</td></tr>`;
      })
      .join("")}</tbody>`;
}

function periodKey(ms) {
  const d = new Date(ms);
  return gran === "year" ? `${d.getFullYear()}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function periodLabel(key) {
  if (gran === "year") return key;
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function renderPeriods() {
  const now = Date.now();
  const rows = new Map();
  const row = (key) => {
    if (!rows.has(key)) rows.set(key, { calls: 0, answered: 0, meets: 0, deals: 0 });
    return rows.get(key);
  };
  for (const c of scopedCalls()) {
    const r = row(periodKey(c[0]));
    r.calls += 1;
    r.answered += c[2];
  }
  for (const d of scopedDeals()) row(periodKey(d[0])).deals += 1;
  for (const m of data.meets) {
    const t = meetMs(m[0]);
    if (inScope(m[1]) && t <= now && !Number.isNaN(t)) row(periodKey(t)).meets += 1;
  }
  const keys = [...rows.keys()].sort().reverse();
  const el = document.getElementById("st-periods");
  if (!keys.length) {
    el.innerHTML = `<tbody><tr><td class="st-empty">Brak danych.</td></tr></tbody>`;
    return;
  }
  const sum = { calls: 0, answered: 0, meets: 0, deals: 0 };
  for (const r of rows.values()) for (const k in sum) sum[k] += r[k];
  const tr = (label, r, cls = "") =>
    `<tr${cls ? ` class="${cls}"` : ""}><td>${label}</td><td class="num">${r.calls}</td><td class="num">${r.answered}</td><td class="num">${r.meets}</td><td class="num">${r.deals}</td><td class="num">${pct(r.deals, r.calls)}</td></tr>`;
  el.innerHTML = `
    <thead><tr><th>${gran === "year" ? "Rok" : "Miesiąc"}</th><th class="num">Calle</th><th class="num">Odebrane</th><th class="num">Meety</th><th class="num">Dopięte</th><th class="num">Konwersja</th></tr></thead>
    <tbody>${keys.map((k) => tr(periodLabel(k), rows.get(k))).join("")}</tbody>
    <tfoot>${tr("Razem", sum, "st-sum")}</tfoot>`;
}

function renderAll() {
  renderScope();
  renderTiles();
  renderAsk();
  renderChart();
  renderMilestones();
  renderPeriods();
}

// ---------- zdarzenia ----------

document.getElementById("st-scope").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-s]");
  if (!b) return;
  scope = b.dataset.s === "all" ? "all" : Number(b.dataset.s);
  renderAll();
});
document.getElementById("st-gran").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-g]");
  if (!b) return;
  gran = b.dataset.g;
  for (const x of e.currentTarget.children) x.classList.toggle("active", x === b);
  renderPeriods();
});
document.getElementById("st-ask-n").addEventListener("input", renderAsk);
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => data && renderChart(), 150);
});

(async () => {
  try {
    data = await api.get("/api/stats/history");
    // domyslnie: statystyki zalogowanej osoby ("ile JA mialem dopietych"), jesli dzwoni
    const me = await api.get("/api/auth/me").catch(() => null);
    const mine = me && data.callers.findIndex((c) => c.name === me.user.display_name);
    if (mine != null && mine >= 0) scope = mine;
    renderAll();
  } catch (err) {
    document.getElementById("st-plot").innerHTML = `<div class="networth-empty">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
})();
