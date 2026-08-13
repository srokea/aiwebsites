const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async patch(url, body) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async del(url) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async postForm(url, formData) {
    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Blad ${res.status}`);
    return data;
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

// Weekend = "rest day" dla licznika dziennego celu (patrz uzycie w index.js / niche.js) -
// sob/niedz nie ma planu dzwonienia, wiec 0/20 wygladaloby jak zaleglosc, a to po prostu wolne.
function isRestDay() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
