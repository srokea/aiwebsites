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

// Miasta wieloczlonowe skracamy tam, gdzie liczy sie kazdy znak (tabela leadow, panel
// Najblizsze - #8, przygotowanie pod wezsze ekrany): pierwszy czlon zostaje pelny, kolejne
// skracaja sie do inicjalu z kropka ("Piotrków Trybunalski" -> "Piotrków T."). Nazwy
// jednoczlonowe ("Warszawa") zostaja bez zmian.
function shortCity(city) {
  const words = String(city || "").trim().split(/\s+/);
  if (words.length < 2) return city || "";
  return [words[0], ...words.slice(1).map((w) => `${w.charAt(0)}.`)].join(" ");
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

// ikonki platform do odznak tagow (patrz platformBadge ponizej) - prawdziwe logo. Instagram/
// Facebook/YouTube to wektorowe SVG (Simple Icons, CC0). Booksy nie ma publicznego samodzielnego
// SVG (ich brand kit to wylacznie wordmark "booksy"), wiec to prawdziwa ikonka ich apki
// mobilnej (Google Play, 512x512 -> przeskalowana lokalnie do 64x64) wbudowana jako base64 PNG.
const PLATFORM_ICONS = {
  instagram: `<svg viewBox="0 0 24 24" fill="white"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="white"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>`,
  booksy: `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAYnSURBVHhe7ZtrTBxVFMenFArsYLW1alKtSa0fjI9PJr4SbYyJMUZj4iPFGhtj/GBijB80GtOvfRk/mZjYwrLv3dmZfcGy0G2BFqgtRfoC7BNa3m0pLJRXW6Ds35y77LozLMKywK7LnOQfNjv33tnzm3PPPXfI5bgoyy0wP8HbS3fxQskpjcV9U2N29qeFLJ5e8om3e3fn6IRN0T5HjNdL+bzo688rPYI8Rzl4uxe8kCaye5lP5BsvlgZ4g+NTmfO5JscneW4/eKkMvMkJ3uxKT5Fvkg957kPgjeK2kPNa20be6hmmCzM6pKvIV2vxSK5BfJzjja49LDTS+ckrZXKGpoPZuY/TmF2NbM4rG6W5yGeN0dnMaUzOPpYoYjRKawle0ApBERBYsQBMrgGOKKxgAAEVgApABaACUAGoAFQAKoCZDZZI2UYnMvQSMgwSspO5AUsGgFyTE48IxXjO48ezHj/WWz3sO2W7ZdFyA9CYXeCK7LC0tmMyGMTkVBDFHd3I0IvsmrL9kitZAA733ETYzg/exhqjIzlRkCwAZV3XIwAaA4PIXskAmlQAKxzAmf6BSA6gJZHTi+CKhJB0dmQaHEuXIFMFAHO60Iq1Fhde9VUiv7oO22vq8Jb/KDZJpawPadFBpAKAhr4A1pld2HmqCVeGhiPfh21wfBwlHd14218NTiuwaMmLMfaClAoAhiYm0Dk6JnN6NvvjYgvWGCRkGRYJQioAiNeK27uRqReRsxhJM9UA3B6fwG9/X8bHVcfx7qEafHPiFKpv9CqbYV/TRXCFthnjx61UAlB/qx9bKOEVWNlcZ4mv0MY+f1t3WtY2GARe9B5Ghk6ccY+4lCoA2kdG8ajNw64p+1Coc/vN+KmhUdbH2NIGTptgFCwGgCyjI7RmTz8tJvpcZJ+x1Z0NwI7ak+zJz5bYaBzaMJ0LDEb69N65i4dtHqwxJpALFgqAfihzvNCGjfYS5B89gV+bL0G81gn7tU780nQRH1Qew1pyWCtEqrwwgIPdN2SOrLd52HjK+0Tfj+qEHxvORfqRveKrZDWEsv28tRAAeRYXOJ2Ihyxu7Gu8wByYzS7fHsZXx/5iTtMLEOpPQKJ3g1QIZRqkOUthGuOdQzWy8T+s+jPmtJm34gXAnoTOjqcdPjQN/BuOc5mrrSs0x7UCsgwSXiutZHDIWoaG57UXIOivlx+Rjbu9uo5NP2XbeSteAPTjyZHWoRHZDyHru3sPzYFB3JglIq4Oj+CNsqpIrlhvcaPgUiucbV0sAjSmmfeLFj3p9ypqZWN+tJwRwOavVoD1arvsR4zfn8J3J88wMNkGCRusHrxfUYuKqDAP2/1gEN/Xnw0tcZQsdXaW5eeq8VnkFVix83STbLyXSyuWLwes0onYqghBMhaG+83InA5jqtXD6/iXx+rRf29c2QXejh5snl7z56rt6RrLEUanbK/QM3YHD1rcM1aauBQXgCI7y/YdI2Osdqe/By61hrJ8jPYEg8J9i+TDwRiFD02Zr483IEsvsXaxVgEWdbpQtBha2mT9f79wJfFqMB4AJKJN1NdZPUyr58jeLHRpq6uz4+eGRgSphFMY7QY/r6nDhukkyXJEWFoBL7gPolwBcHRiEk85fCwylPeMS/ECoCdCEOi9PmmuuRsWq+YKrHiz/AhaYiRQsutjd9hGZ/e58/ih/ix2nT0Pf9d1TE5NKZvii9r6xKtAUrwAEhU9UUqSNHUWaiyJFtrmDf8/tdwAQgktVEFuLauCr7NH6d+sRq/PaXVZNOdJyw0gWmwpLLLjJW8F9jZewPHePlZV0rJKy+Xo5CRah0dYnbCj5iQeYH0SKHpiKZkASCzLs/eBNlYqPyaU4Bl3OZ4v9mOzw4e1Fndoo6UVElvuZlOyAUSLKkFaCukfpqv0ElYbHEvjdLRSCUBSpAJQAagAVAAqABWACkAFoB6YUI/MrOBDU2ZnM8ebHHtX9LG5XFsxHZwcWXkHJz2j7OAkWY5R3MaOk9KFdI4E8i18dNYk5cvOD9OBYl70BSKHpykxppGiDk8P8HrpM5nzYaOj5bzg3cMLJac1Fvctjck5QGvl/1vOAfKFF0rO8KJvT84B6clon/8BNvcCY0KMpxUAAAAASUVORK5CYII=" alt="Booksy" width="24" height="24" style="display:block;">`,
  youtube: `<svg viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  // Oficjalne logo TikToka to trzy kopie tej samej "nutki" przesuniete o kilka px: cyjanowa
  // w lewo-gore, rozowa w prawo-dol, czarna na wierzchu wysrodkowana - stad ten "neonowy"
  // efekt na krawedziach. Dziala tylko na CZARNYM tle (patrz PLATFORM_META.tiktok w
  // constants.js) - czarna kopia ma zlewac sie z tlem, widac tylko kolorowe "cienie".
  tiktok: `<svg viewBox="0 0 16 16">
    <path fill="#25F4EE" transform="translate(-0.7,-0.6)" d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/>
    <path fill="#FE2C55" transform="translate(0.7,0.6)" d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/>
    <path fill="#000" d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/>
  </svg>`,
};

// ---------- znaczek "verified" (#6) - w prawym dolnym rogu ramki Social, gdy ktos recznie
// poprawil tagi platform (patrz social_verified w niche.js/script.js). 12-ramienna rozeta +
// bialy checkmark, stylistyka jak niebieski "verified" na Facebooku/X.
const VERIFIED_BADGE_SVG = `<svg viewBox="0 0 24 24">
  <polygon fill="var(--blue)" points="12,1 14.23,3.69 17.5,2.47 18.08,5.92 21.53,6.5 20.31,9.77 23,12 20.31,14.23 21.53,17.5 18.08,18.08 17.5,21.53 14.23,20.31 12,23 9.77,20.31 6.5,21.53 5.92,18.08 2.47,17.5 3.69,14.23 1,12 3.69,9.77 2.47,6.5 5.92,5.92 6.5,2.47 9.77,3.69"/>
  <polyline points="7.5,12.2 10.3,15.3 16.8,7.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function platformBadge(m, t) {
  return `<span class="platform-badge" style="background:${m.color}" title="${m.name}">${PLATFORM_ICONS[t] || m.label}</span>`;
}

// ---------- tagi platform (IG/FB/Booksy/YT) - popover z checkboxami (.tags-popover),
// wspolne dla niche.js (kolumna Social) i script.js (panel boczny scheme rozmowy).
// `metaData` = obiekt z /api/meta (platformTags/platformMeta) - kazda strona ma swoja
// zmienna `meta`/`panelMeta`, wiec przekazywana jawnie zamiast domykania globala.
function tagsTriggerContent(lead, metaData) {
  const active = metaData.platformTags.filter((t) => lead[`tag_${t}`]);
  const verified = lead.social_verified
    ? `<span class="verified-badge" title="Ręcznie zweryfikowane">${VERIFIED_BADGE_SVG}</span>`
    : "";
  if (!active.length) return `<span class="plus">+</span>${verified}`;
  return active.map((t) => platformBadge(metaData.platformMeta[t], t)).join("") + verified;
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

// ---------- #4: kalendarzyk "Kiedy oddzwonić" - ta sama stylistyka co kalendarz Google Meet
// (openTermPicker) powyzej, tylko bez godzin i bez kolizji per-dzwoniacy: to zwykla data
// oddzwonienia, nie konkretny termin spotkania. Wspolny dla niche.js i script.js.

let callbackPickerEl = null;

function closeCallbackPicker() {
  if (callbackPickerEl) callbackPickerEl.remove();
  callbackPickerEl = null;
}

// value: "YYYY-MM-DD" albo "" | onPick(nowaWartosc) - wolane tez z "" przy czyszczeniu
function openCallbackPicker({ anchor, value, onPick }) {
  closeCallbackPicker();

  const start = value ? new Date(`${value}T00:00:00`) : new Date();
  const state = { year: start.getFullYear(), month: start.getMonth(), day: value || "" };

  const pop = document.createElement("div");
  pop.className = "term-pop";
  document.body.appendChild(pop);
  callbackPickerEl = pop;

  function render() {
    const first = new Date(state.year, state.month, 1);
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const todayIso = isoDay(new Date());

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<span class="term-day empty"></span>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoDay(new Date(state.year, state.month, d));
      const classes = ["term-day", iso === state.day ? "selected" : "", iso === todayIso ? "today" : ""]
        .filter(Boolean)
        .join(" ");
      cells.push(`<button type="button" class="${classes}" data-callback-day="${iso}">${d}</button>`);
    }

    const monthLabel = first.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

    pop.innerHTML = `
      <div class="term-head">
        <button type="button" class="term-nav" data-callback-nav="-1" title="Poprzedni miesiąc">‹</button>
        <span class="term-month">${monthLabel}</span>
        <button type="button" class="term-nav" data-callback-nav="1" title="Następny miesiąc">›</button>
      </div>
      <div class="term-grid">
        ${MEET_WEEKDAYS.map((d) => `<span class="term-dow">${d}</span>`).join("")}
        ${cells.join("")}
      </div>
      <div class="term-foot">
        <button type="button" class="btn" data-callback-clear>Wyczyść</button>
        <button type="button" class="btn" data-callback-close>Zamknij</button>
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
    e.stopPropagation(); // patrz ten sam komentarz w openTermPicker powyzej

    const nav = e.target.closest("[data-callback-nav]");
    if (nav) {
      const delta = Number(nav.dataset.callbackNav);
      const moved = new Date(state.year, state.month + delta, 1);
      state.year = moved.getFullYear();
      state.month = moved.getMonth();
      return render();
    }

    const day = e.target.closest("[data-callback-day]");
    if (day) {
      onPick(day.dataset.callbackDay);
      return closeCallbackPicker();
    }

    if (e.target.closest("[data-callback-clear]")) {
      onPick("");
      return closeCallbackPicker();
    }
    if (e.target.closest("[data-callback-close]")) closeCallbackPicker();
  });

  render();
}

document.addEventListener("click", (e) => {
  if (callbackPickerEl && !callbackPickerEl.contains(e.target) && !e.target.closest("[data-callback-open]")) closeCallbackPicker();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCallbackPicker();
});
window.addEventListener("resize", closeCallbackPicker);

// etykieta na guziku - jak termLabel powyzej, tylko bez godziny (callback_when to sama data)
function callbackLabel(value) {
  if (!value) return "📅";
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}
