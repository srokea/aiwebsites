// #6 - Historia transakcji (Kasa). Jedno miejsce na finanse:
//   - naleznosci klientow DO POTWIERDZENIA (300 zl wdrozenie + 100 zl/mies. abonament),
//   - reczne wpisy (przychod / wydatek),
//   - auto-koszty subskrypcji (dopisywane same, bez potwierdzania).
// Podsumowanie (przychod / koszty / bilans) = te same liczby co panel na dashboardzie.

initParticles();

const listEl = document.getElementById("tx-list");
const summaryEl = document.getElementById("ledger-summary");
const splitSection = document.getElementById("split-section");
const splitGridEl = document.getElementById("split-grid");
const duesSection = document.getElementById("dues-section");
const duesListEl = document.getElementById("dues-list");
const form = document.getElementById("tx-form");
const errEl = document.getElementById("tx-error");
const dateInput = document.getElementById("tx-date");

const zl = (n) => `${Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtPeriod(period) {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function renderSummary(s) {
  summaryEl.innerHTML = `
    <div class="ledger-summary-item"><span class="ledger-lbl">Łączny przychód</span><span class="ledger-val pos">${zl(s.income)}</span></div>
    <div class="ledger-summary-item"><span class="ledger-lbl">Łączne koszty</span><span class="ledger-val neg">${zl(s.expense)}</span></div>
    <div class="ledger-summary-item"><span class="ledger-lbl">Bilans</span><span class="ledger-val ${s.balance >= 0 ? "pos" : "neg"}">${zl(s.balance)}</span></div>`;
}

function renderSplit(pp) {
  if (!pp || !pp.people || pp.people.length < 2) {
    splitSection.hidden = true;
    splitGridEl.innerHTML = "";
    return;
  }
  splitSection.hidden = false;
  const frac = pp.splitCount === 2 ? "½" : `1/${pp.splitCount}`;
  const cards = pp.people
    .map(
      (p) => `
      <div class="split-card" style="--split-color:${escapeHtml(p.color || "var(--border)")}">
        <div class="split-name">${escapeHtml(p.person)}</div>
        <div class="split-profit ${p.profit >= 0 ? "pos" : "neg"}">${zl(p.profit)}</div>
        <div class="split-lines">
          <div><span>Wdrożenia (Twoi klienci)</span><span class="pos">+${zl(p.onetime)}</span></div>
          <div><span>Wspólny przychód (${frac})</span><span class="pos">+${zl(p.sharedIncome)}</span></div>
          <div><span>Wspólne koszty (${frac})</span><span class="neg">−${zl(p.sharedExpense)}</span></div>
        </div>
      </div>`
    )
    .join("");
  const note = pp.unassignedOnetime
    ? `<div class="split-note">+ ${zl(pp.unassignedOnetime)} z wdrożeń bez przypisanej osoby (lead bez „Kto dzwonił”) — nie wchodzi do żadnego udziału.</div>`
    : "";
  splitGridEl.innerHTML = cards + note;
}

function renderDues(dues) {
  if (!dues || !dues.length) {
    duesSection.hidden = true;
    duesListEl.innerHTML = "";
    return;
  }
  duesSection.hidden = false;
  duesListEl.innerHTML = dues
    .map(
      (d) => `
      <div class="dues-row">
        <span class="dues-company">${escapeHtml(d.company)}</span>
        <span class="dues-what">${escapeHtml(d.label)}${d.kind === "monthly" ? ` · ${escapeHtml(fmtPeriod(d.period))}` : ""}</span>
        <span class="dues-amount">${zl(d.amount)}</span>
        <span class="dues-actions">
          <button type="button" class="btn primary dues-confirm" data-confirm="${d.id}">Potwierdź</button>
          <button type="button" class="btn dues-skip" data-skip="${d.id}">Pomiń</button>
        </span>
      </div>`
    )
    .join("");
}

function renderList(rows) {
  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">Brak wpisów — dodaj pierwszy albo potwierdź należność powyżej.</div>`;
    return;
  }
  listEl.innerHTML = rows
    .map((t) => {
      const income = t.category === "przychod";
      return `
      <div class="tx-row ${t.auto ? "tx-row--auto" : ""}">
        <span class="tx-date">${fmtDate(t.occurred_on)}</span>
        <span class="tx-desc">${escapeHtml(t.description || "—")}${t.auto ? ' <span class="tx-tag">auto</span>' : ""}</span>
        <span class="tx-by">${escapeHtml(t.created_by || "")}</span>
        <span class="tx-amount ${income ? "pos" : "neg"}">${income ? "+" : "−"}${zl(t.amount)}</span>
        ${t.auto ? '<span class="tx-del-slot"></span>' : `<button type="button" class="tx-del" data-del="${t.id}" title="Usuń wpis">✕</button>`}
      </div>`;
    })
    .join("");
}

// ---------- wykres net worth w czasie (jeden szereg: skumulowany bilans) ----------
let nwGranularity = "month";
let nwFrom = "";
let nwTo = "";
try {
  nwGranularity = localStorage.getItem("nw-gran") || "month";
  nwFrom = localStorage.getItem("nw-from") || "";
  nwTo = localStorage.getItem("nw-to") || "";
} catch {
  /* prywatne okno itp. */
}
let nwTransactions = [];

const NW_P = { x0: 46, x1: 672, y0: 12, y1: 168, h: 200, w: 680 }; // geometria plot area w viewBox

function nwKey(iso, g) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  if (g === "year") return `${d.getFullYear()}`;
  if (g === "month") return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  if (g === "week") {
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // poniedzialek tego tygodnia
    return `${mon.getFullYear()}-${p(mon.getMonth() + 1)}-${p(mon.getDate())}`;
  }
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nwNextKey(key, g) {
  if (g === "year") return `${Number(key) + 1}`;
  const [y, m, day] = key.split("-").map(Number);
  if (g === "month") {
    const d = new Date(y, m - 1 + 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const step = g === "week" ? 7 : 1;
  const d = new Date(y, m - 1, day + step);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nwLabel(key, g) {
  if (g === "year") return key;
  const [y, m, day] = key.split("-").map(Number);
  if (g === "month") return `${["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"][m - 1]} ${String(y).slice(2)}`;
  return `${String(day).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}
// zakres kalendarzowy okresu (YYYY-MM-DD .. YYYY-MM-DD) - do filtrowania po wybranej dacie od/do
function nwKeyRange(key, g) {
  if (g === "year") return { start: `${key}-01-01`, end: `${key}-12-31` };
  if (g === "month") {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, "0")}` };
  }
  if (g === "week") {
    const [y, m, d] = key.split("-").map(Number);
    const end = new Date(y, m - 1, d + 6);
    const p = (n) => String(n).padStart(2, "0");
    return { start: key, end: `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}` };
  }
  return { start: key, end: key };
}

// szereg: dla kazdego okresu od pierwszej transakcji do dzis -> skumulowany bilans na koniec okresu
function nwBuildSeries(transactions, g) {
  const txs = transactions
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.occurred_on))
    .map((t) => ({ date: t.occurred_on, delta: t.category === "przychod" ? t.amount : -t.amount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (txs.length < 2) return [];

  const pts = [];
  let bal = 0;
  for (const t of txs) {
    bal += t.delta;
    pts.push({ key: nwKey(t.date, g), bal });
  }

  const todayKey = nwKey(new Date().toISOString().slice(0, 10), g);
  const series = [];
  let ptr = 0;
  let carried = 0;
  for (let k = pts[0].key; ; k = nwNextKey(k, g)) {
    while (ptr < pts.length && pts[ptr].key <= k) carried = pts[ptr++].bal;
    series.push({ key: k, label: nwLabel(k, g), bal: carried });
    if (k >= todayKey || series.length > 400) break;
  }
  return series;
}

function renderNetworthChart() {
  const host = document.getElementById("networth-plot");
  const capEl = document.getElementById("networth-caption");
  if (!host) return;
  let s = nwBuildSeries(nwTransactions, nwGranularity);

  if (s.length === 0) {
    host.innerHTML = `<div class="networth-empty">Za mało wpisów, żeby narysować wykres.</div>`;
    capEl.textContent = "";
    return;
  }

  // wybrany zakres dat (od/do) - tniemy szereg do okna, ale skumulowany bilans pierwszego
  // widocznego punktu zostaje prawdziwy (uwzglednia wszystko, co bylo wczesniej)
  let from = nwFrom;
  let to = nwTo;
  if (from && to && from > to) [from, to] = [to, from];
  if (from || to) {
    s = s.filter((d) => {
      const { start, end } = nwKeyRange(d.key, nwGranularity);
      return (!from || end >= from) && (!to || start <= to);
    });
    if (s.length === 0) {
      host.innerHTML = `<div class="networth-empty">Brak wpisów w wybranym zakresie dat.</div>`;
      capEl.textContent = "";
      return;
    }
  }

  // jeden okres (np. widok roczny w pierwszym roku) - rysujemy plaska linie zamiast komunikatu
  if (s.length === 1) s = [s[0], { ...s[0] }];

  const bals = s.map((d) => d.bal);
  let dmin = Math.min(...bals);
  let dmax = Math.max(...bals);
  if (dmin === dmax) {
    dmin -= 1;
    dmax += 1;
  }
  const padY = (dmax - dmin) * 0.12;
  dmin -= padY;
  dmax += padY;
  if (dmin > 0 && dmin < dmax * 0.5) dmin = 0;

  const { x0, x1, y0, y1, w, h } = NW_P;
  const X = (i) => (s.length === 1 ? (x0 + x1) / 2 : x0 + (i / (s.length - 1)) * (x1 - x0));
  const Y = (v) => y1 - ((v - dmin) / (dmax - dmin)) * (y1 - y0);

  const linePts = s.map((d, i) => `${X(i).toFixed(1)},${Y(d.bal).toFixed(1)}`).join(" ");
  const areaD = `M ${X(0).toFixed(1)},${y1} L ${linePts.replace(/ /g, " L ")} L ${X(s.length - 1).toFixed(1)},${y1} Z`;

  // 4 poziome linie siatki + etykiety zl
  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const v = dmin + (i / 4) * (dmax - dmin);
    const y = Y(v).toFixed(1);
    grid += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="nw-grid"/>`;
    grid += `<text x="${x0 - 6}" y="${y}" class="nw-ylabel">${Math.round(v).toLocaleString("pl-PL")}</text>`;
  }
  const zeroLine =
    dmin < 0 && dmax > 0 ? `<line x1="${x0}" y1="${Y(0).toFixed(1)}" x2="${x1}" y2="${Y(0).toFixed(1)}" class="nw-zero"/>` : "";

  // ~5 etykiet osi X
  let xlabels = "";
  const step = Math.max(1, Math.round((s.length - 1) / 4));
  for (let i = 0; i < s.length; i += step) {
    xlabels += `<text x="${X(i).toFixed(1)}" y="${h - 6}" class="nw-xlabel">${s[i].label}</text>`;
  }

  // peak i dolek
  const iMax = bals.indexOf(Math.max(...bals));
  const iMin = bals.indexOf(Math.min(...bals));
  const marker = (i, cls) => {
    const anchor = i === 0 ? "start" : i === s.length - 1 ? "end" : "middle";
    return (
      `<circle cx="${X(i).toFixed(1)}" cy="${Y(bals[i]).toFixed(1)}" r="3.5" class="nw-dot ${cls}"/>` +
      `<text x="${X(i).toFixed(1)}" y="${(Y(bals[i]) + (cls === "peak" ? -8 : 14)).toFixed(1)}" text-anchor="${anchor}" class="nw-mlabel">${Math.round(bals[i]).toLocaleString("pl-PL")} zł</text>`
    );
  };

  host.innerHTML = `
    <svg class="nw-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Net worth w czasie">
      ${grid}${zeroLine}
      <path d="${areaD}" class="nw-area"/>
      <polyline points="${linePts}" class="nw-line"/>
      ${iMax !== iMin ? marker(iMax, "peak") + marker(iMin, "dip") : ""}
      ${xlabels}
      <line class="nw-cross" id="nw-cross" x1="0" y1="${y0}" x2="0" y2="${y1}" style="display:none"/>
      <circle class="nw-hoverdot" id="nw-hoverdot" r="4" style="display:none"/>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="transparent" id="nw-hit"/>
    </svg>
    <div class="nw-tip" id="nw-tip" hidden></div>
  `;

  const first = s[0].bal;
  const last = s[s.length - 1].bal;
  const diff = last - first;
  capEl.innerHTML = `Teraz: <b>${zl(last)}</b> · w tym okresie <span class="${diff >= 0 ? "pos" : "neg"}">${diff >= 0 ? "▲" : "▼"} ${zl(Math.abs(diff))}</span>`;

  // hover
  const svg = host.querySelector(".nw-svg");
  const hit = host.querySelector("#nw-hit");
  const cross = host.querySelector("#nw-cross");
  const hdot = host.querySelector("#nw-hoverdot");
  const tip = host.querySelector("#nw-tip");
  hit.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const svgX = ((e.clientX - r.left) / r.width) * w;
    let i = Math.round(((svgX - x0) / (x1 - x0)) * (s.length - 1));
    i = Math.max(0, Math.min(s.length - 1, i));
    const px = X(i);
    const py = Y(s[i].bal);
    cross.setAttribute("x1", px);
    cross.setAttribute("x2", px);
    cross.style.display = "";
    hdot.setAttribute("cx", px);
    hdot.setAttribute("cy", py);
    hdot.style.display = "";
    tip.hidden = false;
    tip.innerHTML = `<span class="nw-tip-k">${s[i].label}</span><span class="nw-tip-v">${zl(s[i].bal)}</span>`;
    const leftPct = (px / w) * 100;
    tip.style.left = `${Math.max(4, Math.min(88, leftPct))}%`;
  });
  hit.addEventListener("mouseleave", () => {
    cross.style.display = "none";
    hdot.style.display = "none";
    tip.hidden = true;
  });
}

const nwSaveLS = (k, v) => {
  try {
    v ? localStorage.setItem(k, v) : localStorage.removeItem(k);
  } catch {
    /* ignoruj */
  }
};

document.getElementById("networth-gran").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-g]");
  if (!btn) return;
  nwGranularity = btn.dataset.g;
  nwSaveLS("nw-gran", nwGranularity);
  [...e.currentTarget.children].forEach((b) => b.classList.toggle("active", b === btn));
  renderNetworthChart();
});

const nwFromInput = document.getElementById("nw-from");
const nwToInput = document.getElementById("nw-to");
const nwClearBtn = document.getElementById("nw-range-clear");

function nwSyncRangeUI() {
  nwFromInput.value = nwFrom;
  nwToInput.value = nwTo;
  nwClearBtn.hidden = !nwFrom && !nwTo;
}
nwFromInput.addEventListener("change", () => {
  nwFrom = nwFromInput.value;
  nwSaveLS("nw-from", nwFrom);
  nwSyncRangeUI();
  renderNetworthChart();
});
nwToInput.addEventListener("change", () => {
  nwTo = nwToInput.value;
  nwSaveLS("nw-to", nwTo);
  nwSyncRangeUI();
  renderNetworthChart();
});
nwClearBtn.addEventListener("click", () => {
  nwFrom = "";
  nwTo = "";
  nwSaveLS("nw-from", "");
  nwSaveLS("nw-to", "");
  nwSyncRangeUI();
  renderNetworthChart();
});

function applyBundle(b) {
  nwTransactions = b.transactions || [];
  const dates = nwTransactions.map((t) => t.occurred_on).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length) {
    nwFromInput.min = nwToInput.min = dates[0];
    nwFromInput.max = nwToInput.max = new Date().toISOString().slice(0, 10);
  }
  nwSyncRangeUI();
  renderNetworthChart();
  document.querySelectorAll("#networth-gran button").forEach((b2) => b2.classList.toggle("active", b2.dataset.g === nwGranularity));
  renderSummary(b.summary);
  renderSplit(b.perPerson);
  renderDues(b.pendingDues);
  renderList(b.transactions);
}

async function load() {
  try {
    applyBundle(await api.get("/api/transactions"));
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.style.display = "none";
  const body = {
    occurred_on: dateInput.value,
    description: document.getElementById("tx-desc").value,
    amount: document.getElementById("tx-amount").value,
    category: form.querySelector('input[name="tx-cat"]:checked').value,
  };
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    applyBundle(await api.post("/api/transactions", body));
    document.getElementById("tx-desc").value = "";
    document.getElementById("tx-amount").value = "";
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
  }
});

listEl.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  if (!confirm("Usunąć ten wpis?")) return;
  try {
    applyBundle(await api.del(`/api/transactions/${del.dataset.del}`));
  } catch (err) {
    alert("Blad usuwania: " + err.message);
  }
});

duesListEl.addEventListener("click", async (e) => {
  const confirmBtn = e.target.closest("[data-confirm]");
  const skipBtn = e.target.closest("[data-skip]");
  if (!confirmBtn && !skipBtn) return;
  const id = (confirmBtn || skipBtn).dataset.confirm || skipBtn.dataset.skip;
  const action = confirmBtn ? "confirm" : "skip";
  if (action === "skip" && !confirm("Pominąć tę należność? Nie wróci na listę.")) return;
  try {
    applyBundle(await api.post(`/api/finance/dues/${id}/${action}`, {}));
  } catch (err) {
    alert("Blad: " + err.message);
  }
});

// domyslna data = dzis (lokalnie)
(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  dateInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

load();
