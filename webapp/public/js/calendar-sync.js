// Parowanie z kalendarzem iCloud (patrz server/calendarSync.js). Dolaczany na kazdej stronie
// z auth-widget.js - okno parowania otwiera sie z profilu (avatar w topbarze), z paska na
// /kalendarz.html i z kalendarzyka wyboru terminu Meeta (api.js openTermPicker).
//
// Punkty wejscia w HTML: element z atrybutem data-calsync-slot="profile" | "bar" - wypelniany
// aktualnym stanem polaczenia; dowolny element z data-calsync-open - otwiera okno.

const calSync = { status: null, loading: null };

const CALSYNC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4.5"/></svg>`;

const CALSYNC_DURATIONS = [15, 30, 45, 60, 90];
const CALSYNC_ALARMS = [
  { value: -1, label: "Bez przypomnienia" },
  { value: 0, label: "W chwili startu" },
  { value: 5, label: "5 min przed" },
  { value: 10, label: "10 min przed" },
  { value: 15, label: "15 min przed" },
  { value: 30, label: "30 min przed" },
  { value: 60, label: "1 godz. przed" },
];
const CALSYNC_NEW_NAME = "Cold Call — Meety";

function loadCalSyncStatus() {
  calSync.loading = api
    .get("/api/calendar-sync")
    .then((s) => {
      calSync.status = s;
      renderCalSyncSlots();
      return s;
    })
    .catch(() => calSync.status);
  return calSync.loading;
}

const calSyncAccount = () => (calSync.status ? calSync.status.account : null);

// SQLite datetime('now') = UTC "YYYY-MM-DD HH:MM:SS"
function calSyncAgo(utc) {
  if (!utc) return "jeszcze nie";
  const d = new Date(utc.replace(" ", "T") + "Z");
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "przed chwilą";
  if (s < 3600) return `${Math.round(s / 60)} min temu`;
  if (s < 86400) return `${Math.round(s / 3600)} godz. temu`;
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

function calSyncState(acc) {
  if (!acc) return { kind: "off", text: "Niepołączony" };
  if (!acc.hasCalendar) return { kind: "warn", text: "Wybierz kalendarz" };
  if (acc.status === "auth_error") return { kind: "error", text: "Wymaga ponownego połączenia" };
  if (acc.status === "error") return { kind: "warn", text: "Problem z synchronizacją" };
  return { kind: "ok", text: acc.calendarName || "Połączono" };
}

function renderCalSyncSlots() {
  const acc = calSyncAccount();
  const st = calSyncState(acc);
  document.querySelectorAll("[data-calsync-slot]").forEach((slot) => {
    if (slot.dataset.calsyncSlot === "profile") {
      slot.innerHTML = `
        <button type="button" class="calsync-entry" data-calsync-open>
          <span class="calsync-entry-icon">${CALSYNC_ICON}</span>
          <span class="calsync-entry-text">
            <span class="calsync-entry-title">Kalendarz iCloud</span>
            <span class="calsync-entry-sub is-${st.kind}">${acc ? escapeHtml(st.text) : "Meety prosto do kalendarza na iPhonie"}</span>
          </span>
          <span class="calsync-entry-cta">${acc ? "Ustawienia" : "Połącz"}</span>
        </button>`;
    } else {
      const dot = acc && acc.hasCalendar && acc.calendarColor ? `style="--dot:${escapeHtml(acc.calendarColor)}"` : "";
      slot.innerHTML = `
        <button type="button" class="calsync-chip is-${st.kind}" data-calsync-open title="Synchronizacja Meetów z kalendarzem iCloud">
          <span class="calsync-chip-dot" ${dot}></span>
          ${acc ? `iCloud · ${escapeHtml(st.text)}` : "Połącz z iCloud"}
        </button>`;
    }
  });
}

// ---------- toast ----------
function calSyncToast(text, kind = "ok") {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.className = "toast-stack";
    stack.setAttribute("role", "status");
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast is-${kind}`;
  el.innerHTML = `<span class="toast-icon">${kind === "error" ? "!" : CALSYNC_ICON}</span><span>${escapeHtml(text)}</span>`;
  stack.appendChild(el);
  el.getBoundingClientRect(); // wymus styl startowy, zeby wejscie bylo animowane, a nie skokiem
  el.classList.add("in");
  setTimeout(() => {
    el.classList.remove("in");
    setTimeout(() => el.remove(), 300);
  }, kind === "error" ? 6000 : 3200);
}

// ---------- po zmianie terminu w kalendarzyku (niche.js / script.js) ----------
// Sync od razu + potwierdzenie, w czyim kalendarzu Meet teraz jest. Gdy nikt w zespole nie ma
// podpietego iCloud - nic nie robimy (zero dodatkowych requestow).
async function calSyncAfterTermChange(leadId, value) {
  if (!calSync.status) await loadCalSyncStatus();
  if (!calSync.status || !calSync.status.team.length) return;
  let r;
  try {
    r = await api.post("/api/calendar-sync/flush", { leadId });
  } catch {
    return;
  }
  const failed = r.actions.find((a) => a.action === "error");
  if (failed) return calSyncToast(`Nie udało się zapisać w iCloud: ${failed.error}`, "error");

  const me = typeof currentUser !== "undefined" && currentUser ? currentUser.display_name : "";
  if (value) {
    if (!r.inCalendars.length) return; // np. termin w przeszlosci albo Meet nikogo z podpietych
    const mine = r.inCalendars.some((x) => x.name === me);
    const others = r.inCalendars.filter((x) => x.name !== me).map((x) => x.name);
    const verb = r.actions.some((a) => a.action === "updated") ? "Przeniesiono w kalendarzu iCloud" : "Dodano do kalendarza iCloud";
    const who = [mine && others.length ? "Ty" : null, ...others].filter(Boolean);
    calSyncToast(who.length ? `${verb}: ${who.join(", ")}` : verb);
  } else if (r.actions.some((a) => a.action === "deleted")) {
    calSyncToast("Usunięto z kalendarza iCloud");
  }
}

// linijka w kalendarzyku terminu (api.js) - czy ten Meet gdzies trafi. owner = ten sam
// "kalendarz osoby", ktory pokazuje kalendarzyk (Kto dzwonil albo zalogowany).
function calSyncPickerHint(owner) {
  const s = calSync.status;
  if (!s) return "";
  const me = typeof currentUser !== "undefined" && currentUser ? currentUser.display_name : "";
  if (s.team.includes(owner)) {
    return `<div class="term-sync is-on">${CALSYNC_ICON}<span>Trafi do kalendarza iCloud${owner && owner !== me ? `: ${escapeHtml(owner)}` : ""}</span></div>`;
  }
  if (owner === me) {
    return `<button type="button" class="term-sync is-off" data-calsync-open>${CALSYNC_ICON}<span>Połącz iCloud, a Meety same trafią do kalendarza</span></button>`;
  }
  return "";
}

// ---------- okno parowania ----------
let calSyncModalEl = null;
const calSyncUi = { view: "connect", calendars: [], busy: false, error: "", note: "", confirmDisconnect: false, prefillUser: "" };

function openCalSyncModal() {
  if (!calSyncModalEl) {
    calSyncModalEl = document.createElement("div");
    calSyncModalEl.className = "modal-overlay hidden";
    calSyncModalEl.id = "calsync-modal";
    calSyncModalEl.innerHTML = `<div class="modal calsync-modal" role="dialog" aria-modal="true" aria-labelledby="calsync-title"></div>`;
    document.body.appendChild(calSyncModalEl);
    calSyncModalEl.addEventListener("click", onCalSyncClick);
    calSyncModalEl.addEventListener("submit", onCalSyncSubmit);
    calSyncModalEl.addEventListener("change", onCalSyncChange);
  }
  // profil (auth-widget) moze byc otwarty pod spodem - okno parowania idzie nad nim
  Object.assign(calSyncUi, { error: "", note: "", confirmDisconnect: false, busy: false, calendars: [] });
  calSyncModalEl.classList.remove("hidden");
  showDefaultCalSyncView();
  // swiezy stan w tle (np. drugi czlonek zespolu wlasnie sie podpial, minal kolejny sync) - przerysuj
  // tylko gdy zmienil sie widok albo to ekran statusu, zeby nie skasowac wpisywanego hasla
  loadCalSyncStatus().then(() => {
    if (calSyncModalEl.classList.contains("hidden") || calSyncUi.busy) return;
    if (defaultCalSyncView() !== calSyncUi.view) showDefaultCalSyncView();
    else if (calSyncUi.view === "status") renderCalSyncModal();
  });
}

function defaultCalSyncView() {
  const acc = calSyncAccount();
  return !acc ? "connect" : acc.hasCalendar ? "status" : "choose";
}

function showDefaultCalSyncView() {
  calSyncUi.view = defaultCalSyncView();
  if (calSyncUi.view === "choose" && !calSyncUi.calendars.length) return refreshCalendarList();
  renderCalSyncModal();
}

function closeCalSyncModal() {
  if (calSyncModalEl) calSyncModalEl.classList.add("hidden");
}

function calSyncHead(title, sub, pill) {
  return `
    <div class="calsync-head">
      <span class="calsync-icon">${CALSYNC_ICON}</span>
      <div class="calsync-head-text">
        <h3 id="calsync-title">${title}</h3>
        ${sub ? `<div class="calsync-sub">${sub}</div>` : ""}
      </div>
      ${pill || ""}
      <button type="button" class="calsync-x" data-calsync-close aria-label="Zamknij">✕</button>
    </div>`;
}

const calSyncErrorHtml = () => (calSyncUi.error ? `<div class="calsync-banner is-error">${escapeHtml(calSyncUi.error)}</div>` : "");
const calSyncNoteHtml = () => (calSyncUi.note ? `<div class="calsync-banner is-ok">${escapeHtml(calSyncUi.note)}</div>` : "");

function renderCalSyncModal() {
  const box = calSyncModalEl.querySelector(".modal");
  const acc = calSyncAccount();
  const busy = calSyncUi.busy ? "disabled" : "";

  if (calSyncUi.view === "connect" || calSyncUi.view === "connect-again") {
    const again = calSyncUi.view === "connect-again";
    box.innerHTML = `
      ${calSyncHead(
        again ? "Połącz ponownie" : "Kalendarz iCloud",
        again ? "Wklej nowe hasło do aplikacji — reszta ustawień zostaje." : "Każdy Meet, któremu ustawisz termin, sam pojawi się w Twoim kalendarzu na iPhonie. Zmiana terminu przesuwa wydarzenie, wyczyszczenie — usuwa je."
      )}
      <ol class="calsync-steps">
        <li>Otwórz <a href="https://account.apple.com" target="_blank" rel="noopener">account.apple.com</a> i zaloguj się.</li>
        <li>Wejdź w <b>Logowanie i bezpieczeństwo → Hasła do aplikacji</b> i utwórz nowe, np. „Cold Call”.</li>
        <li>Skopiuj je i wklej poniżej razem ze swoim Apple ID.</li>
      </ol>
      <form id="calsync-connect-form" autocomplete="off">
        <label for="calsync-user">Apple ID</label>
        <input type="text" id="calsync-user" inputmode="email" autocomplete="username" spellcheck="false" placeholder="np. jan@icloud.com" value="${escapeHtml(calSyncUi.prefillUser || (acc ? acc.username : ""))}" required>
        <label for="calsync-pass">Hasło do aplikacji</label>
        <input type="password" id="calsync-pass" autocomplete="new-password" spellcheck="false" placeholder="xxxx-xxxx-xxxx-xxxx" required>
        <div class="hint">To nie jest hasło do Apple ID. Trzymamy je zaszyfrowane i używamy tylko do dodawania Meetów. Możesz je unieważnić w każdej chwili na account.apple.com.</div>
        ${calSyncErrorHtml()}
        <div class="actions">
          <button type="button" class="btn" ${again ? 'data-calsync-view="status"' : "data-calsync-close"}>${again ? "Wstecz" : "Anuluj"}</button>
          <button type="submit" class="btn primary" ${busy}>${calSyncUi.busy ? "Łączę z iCloud…" : "Połącz"}</button>
        </div>
      </form>`;
    if (!calSyncUi.busy) box.querySelector(calSyncUi.prefillUser || acc ? "#calsync-pass" : "#calsync-user")?.focus();
    return;
  }

  if (calSyncUi.view === "choose") {
    const current = acc && acc.hasCalendar ? acc.calendarName : "";
    const list = calSyncUi.calendars;
    const anySelected = list.some((c) => c.name === current);
    const items = [
      `<label class="calsync-cal">
        <input type="radio" name="calsync-cal" value="__new" ${anySelected ? "" : "checked"}>
        <span class="calsync-cal-dot is-new">+</span>
        <span class="calsync-cal-text"><b>Nowy kalendarz „${CALSYNC_NEW_NAME}”</b><small>Polecane — łatwo go ukryć albo usunąć jednym ruchem</small></span>
      </label>`,
      ...list.map(
        (c) => `
      <label class="calsync-cal">
        <input type="radio" name="calsync-cal" value="${escapeHtml(c.url)}" ${c.name === current ? "checked" : ""}>
        <span class="calsync-cal-dot" style="background:${escapeHtml(c.color || "#8e8e93")}"></span>
        <span class="calsync-cal-text"><b>${escapeHtml(c.name)}</b>${c.name === current ? "<small>Obecnie wybrany</small>" : ""}</span>
      </label>`
      ),
    ];
    box.innerHTML = `
      ${calSyncHead("Gdzie dodawać Meety?", acc ? `Połączono jako <b>${escapeHtml(acc.username)}</b>` : "")}
      <div class="calsync-cal-list" role="radiogroup" aria-label="Kalendarz">${calSyncUi.busy && !list.length ? `<div class="calsync-loading">Wczytuję kalendarze…</div>` : items.join("")}</div>
      ${calSyncErrorHtml()}
      <div class="actions">
        <button type="button" class="btn" ${acc && acc.hasCalendar ? 'data-calsync-view="status"' : "data-calsync-close"}>${acc && acc.hasCalendar ? "Wstecz" : "Później"}</button>
        <button type="button" class="btn primary" data-calsync-choose ${busy}>${calSyncUi.busy && list.length ? "Zapisuję…" : "Zapisz"}</button>
      </div>`;
    return;
  }

  // status
  if (!acc) {
    calSyncUi.view = "connect";
    return renderCalSyncModal();
  }
  const st = calSyncState(acc);
  const pill = `<span class="calsync-pill is-${st.kind}">${st.kind === "ok" ? "Połączono" : st.kind === "error" ? "Błąd" : "Uwaga"}</span>`;
  const problem =
    acc.status === "auth_error"
      ? `<div class="calsync-banner is-error">iCloud nie przyjmuje już hasła (unieważnione albo zmienione). <button type="button" class="calsync-link" data-calsync-view="connect-again">Połącz ponownie</button></div>`
      : acc.status === "error" && acc.lastError
        ? `<div class="calsync-banner is-warn">Ostatnio coś nie przeszło: ${escapeHtml(acc.lastError)}</div>`
        : "";
  const options = (arr, val) => arr.map((o) => `<option value="${o.value}" ${o.value === val ? "selected" : ""}>${o.label}</option>`).join("");

  box.innerHTML = `
    ${calSyncHead("Kalendarz iCloud", `Meety z terminem trafiają do kalendarza na Twoim iPhonie.`, pill)}
    <div class="calsync-card">
      <div class="calsync-row"><span>Konto</span><b>${escapeHtml(acc.username)}</b></div>
      <div class="calsync-row"><span>Kalendarz</span><b><span class="calsync-cal-dot sm" style="background:${escapeHtml(acc.calendarColor || "#8e8e93")}"></span>${escapeHtml(acc.calendarName)} <button type="button" class="calsync-link" data-calsync-change>Zmień</button></b></div>
      <div class="calsync-row"><span>Nadchodzące Meety w kalendarzu</span><b>${acc.upcoming}</b></div>
      <div class="calsync-row"><span>Ostatnia synchronizacja</span><b>${calSyncAgo(acc.lastSyncAt)}</b></div>
    </div>
    ${problem}
    <label>Które Meety</label>
    <div class="seg" role="radiogroup" aria-label="Które Meety">
      <button type="button" class="seg-btn ${acc.scope === "mine" ? "active" : ""}" data-calsync-scope="mine" role="radio" aria-checked="${acc.scope === "mine"}">Tylko moje</button>
      <button type="button" class="seg-btn ${acc.scope === "all" ? "active" : ""}" data-calsync-scope="all" role="radio" aria-checked="${acc.scope === "all"}">Całego zespołu</button>
    </div>
    <div class="hint">„Moje” = Meety, gdzie jesteś w „Kto dzwonił”, a gdy nikt nie jest wpisany — umówione z Twojego konta.</div>
    <div class="calsync-two">
      <div><label for="calsync-duration">Długość spotkania</label><select id="calsync-duration" ${busy}>${options(CALSYNC_DURATIONS.map((m) => ({ value: m, label: `${m} min` })), acc.durationMin)}</select></div>
      <div><label for="calsync-alarm">Przypomnienie</label><select id="calsync-alarm" ${busy}>${options(CALSYNC_ALARMS, acc.alarmMin)}</select></div>
    </div>
    <div class="calsync-tools">
      <button type="button" class="btn" data-calsync-sync ${busy}>Synchronizuj teraz</button>
      ${acc.hasTest ? `<button type="button" class="btn" data-calsync-test-remove ${busy}>Usuń testowe wydarzenie</button>` : `<button type="button" class="btn" data-calsync-test ${busy}>Wyślij testowe wydarzenie</button>`}
    </div>
    ${calSyncNoteHtml()}
    ${calSyncErrorHtml()}
    ${
      calSyncUi.confirmDisconnect
        ? `<div class="calsync-confirm">
            <b>Rozłączyć kalendarz?</b>
            <label class="calsync-check"><input type="checkbox" id="calsync-remove-events" ${acc.upcoming ? "checked" : ""}> Usuń też z kalendarza nadchodzące Meety dodane przez appkę (${acc.upcoming})</label>
            <div class="actions">
              <button type="button" class="btn" data-calsync-disconnect-cancel>Zostaw</button>
              <button type="button" class="btn danger" data-calsync-disconnect-go ${busy}>Rozłącz</button>
            </div>
          </div>`
        : `<div class="calsync-foot">
            <button type="button" class="btn danger ghost" data-calsync-disconnect>Rozłącz</button>
            <button type="button" class="btn primary" data-calsync-close>Gotowe</button>
          </div>`
    }`;
}

function calSyncSetAccount(account) {
  if (!calSync.status) calSync.status = { account: null, team: [] };
  calSync.status.account = account;
  // lista "kto ma podpiety kalendarz" - doswiezamy w tle (wplywa na podpowiedz w kalendarzyku)
  loadCalSyncStatus();
  renderCalSyncSlots();
}

async function calSyncRun(fn) {
  calSyncUi.busy = true;
  calSyncUi.error = "";
  calSyncUi.note = "";
  renderCalSyncModal();
  try {
    await fn();
  } catch (err) {
    calSyncUi.error = err.message;
  } finally {
    calSyncUi.busy = false;
    renderCalSyncModal();
  }
}

async function refreshCalendarList() {
  calSyncUi.calendars = [];
  await calSyncRun(async () => {
    const { calendars } = await api.get("/api/calendar-sync/calendars");
    calSyncUi.calendars = calendars;
  });
}

function syncResultNote(result) {
  if (!result) return "Zsynchronizowano.";
  if (result.error) throw new Error(result.error);
  const parts = [];
  if (result.created) parts.push(`dodano ${result.created}`);
  if (result.updated) parts.push(`zaktualizowano ${result.updated}`);
  if (result.deleted) parts.push(`usunięto ${result.deleted}`);
  return parts.length ? `Gotowe: ${parts.join(", ")}.` : "Wszystko aktualne.";
}

function onCalSyncSubmit(e) {
  if (e.target.id !== "calsync-connect-form") return;
  e.preventDefault();
  const username = document.getElementById("calsync-user").value.trim();
  const password = document.getElementById("calsync-pass").value;
  calSyncUi.prefillUser = username;
  const wasAgain = calSyncUi.view === "connect-again";
  calSyncRun(async () => {
    const { account, calendars } = await api.post("/api/calendar-sync/connect", { username, password });
    calSyncSetAccount(account);
    calSyncUi.calendars = calendars;
    calSyncUi.prefillUser = "";
    if (account.hasCalendar) {
      calSyncUi.view = "status";
      if (wasAgain) {
        const { account: synced, result } = await api.post("/api/calendar-sync/sync", {});
        calSyncSetAccount(synced);
        calSyncUi.note = `Połączono ponownie. ${syncResultNote(result)}`;
      }
    } else {
      calSyncUi.view = "choose";
    }
  });
}

function onCalSyncChange(e) {
  const acc = calSyncAccount();
  if (!acc) return;
  if (e.target.id === "calsync-duration" || e.target.id === "calsync-alarm") {
    const body = e.target.id === "calsync-duration" ? { durationMin: Number(e.target.value) } : { alarmMin: Number(e.target.value) };
    saveCalSyncSettings(body);
  }
}

function saveCalSyncSettings(body) {
  calSyncRun(async () => {
    const { account, result } = await api.patch("/api/calendar-sync/settings", body);
    calSyncSetAccount(account);
    calSyncUi.note = `Zapisano. ${syncResultNote(result)}`;
  });
}

function onCalSyncClick(e) {
  if (e.target === calSyncModalEl || e.target.closest("[data-calsync-close]")) return closeCalSyncModal();
  if (calSyncUi.busy) return;
  const acc = calSyncAccount();

  const viewBtn = e.target.closest("[data-calsync-view]");
  if (viewBtn) {
    Object.assign(calSyncUi, { view: viewBtn.dataset.calsyncView, error: "", note: "" });
    return renderCalSyncModal();
  }
  if (e.target.closest("[data-calsync-change]")) {
    calSyncUi.view = "choose";
    return refreshCalendarList();
  }
  if (e.target.closest("[data-calsync-choose]")) {
    const picked = calSyncModalEl.querySelector('input[name="calsync-cal"]:checked');
    if (!picked) return;
    const body = picked.value === "__new" ? { create: CALSYNC_NEW_NAME } : { url: picked.value };
    return calSyncRun(async () => {
      const { account, result } = await api.post("/api/calendar-sync/calendar", body);
      calSyncSetAccount(account);
      calSyncUi.view = "status";
      calSyncUi.note = `Kalendarz „${account.calendarName}” podpięty. ${syncResultNote(result)}`;
    });
  }
  const scopeBtn = e.target.closest("[data-calsync-scope]");
  if (scopeBtn && acc && scopeBtn.dataset.calsyncScope !== acc.scope) return saveCalSyncSettings({ scope: scopeBtn.dataset.calsyncScope });

  if (e.target.closest("[data-calsync-sync]")) {
    return calSyncRun(async () => {
      const { account, result } = await api.post("/api/calendar-sync/sync", {});
      calSyncSetAccount(account);
      calSyncUi.note = syncResultNote(result);
    });
  }
  if (e.target.closest("[data-calsync-test]")) {
    return calSyncRun(async () => {
      const { account, start } = await api.post("/api/calendar-sync/test", {});
      calSyncSetAccount(account);
      calSyncUi.note = `Wysłano wydarzenie „Test: Cold Call Tracker” na dziś, ${start.slice(11, 16)}. Sprawdź iPhone'a — powinno pojawić się w ciągu kilkunastu sekund.`;
    });
  }
  if (e.target.closest("[data-calsync-test-remove]")) {
    return calSyncRun(async () => {
      const { account } = await api.del("/api/calendar-sync/test");
      calSyncSetAccount(account);
      calSyncUi.note = "Testowe wydarzenie usunięte.";
    });
  }
  if (e.target.closest("[data-calsync-disconnect]")) {
    calSyncUi.confirmDisconnect = true;
    return renderCalSyncModal();
  }
  if (e.target.closest("[data-calsync-disconnect-cancel]")) {
    calSyncUi.confirmDisconnect = false;
    return renderCalSyncModal();
  }
  if (e.target.closest("[data-calsync-disconnect-go]")) {
    const removeEvents = document.getElementById("calsync-remove-events")?.checked;
    return calSyncRun(async () => {
      const out = await api.del(`/api/calendar-sync${removeEvents ? "?removeEvents=1" : ""}`);
      calSyncSetAccount(null);
      calSyncUi.confirmDisconnect = false;
      calSyncUi.view = "connect";
      calSyncUi.note = "";
      calSyncToast(removeEvents ? `Rozłączono. Usunięto z kalendarza: ${out.removed}` : "Rozłączono kalendarz iCloud");
    });
  }
}

document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-calsync-open]");
  if (opener && !opener.closest("#calsync-modal")) openCalSyncModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && calSyncModalEl && !calSyncModalEl.classList.contains("hidden")) closeCalSyncModal();
});

loadCalSyncStatus();
