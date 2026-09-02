// Wspolny widget "zalogowany jako" - dolaczany na kazdej z 3 samodzielnych stron appki
// (index.html, niche.html, script.html) obok api.js. Renderuje sie w slocie #user-widget,
// jesli strona go ma; panel ustawien profilu buduje sam (nie duplikujemy modala w kazdym HTML-u).

let currentUser = null;

// avatarGlyphHtml/initials - wspolne z login.js/index.js, patrz public/js/api.js

// ---------- "jestem w appce" - globalny heartbeat obecnosci dla stron BEZ wlasnej logiki
// obecnosci (dashboard, scheme rozmowy - patrz index.js/script.js). niche.js ma wlasna,
// bogatsza wersje (per lead/nisza), wiec ten heartbeat NIE odpala sie tu automatycznie -
// wywolujemy go jawnie tylko tam, gdzie nie ma nic dokladniejszego do zaraportowania.
function pingOnlinePresence() {
  api.post("/api/presence", { lead_id: 0, niche_id: 0 }).catch(() => {});
}

// zamkniecie karty/nawigacja gdziekolwiek w appce = koniec obecnosci - wspolne dla wszystkich
// 3 stron (niche.js ma dodatkowo wlasny taki sam listener dla swojego przypadku, podwojne
// wywolanie jest nieszkodliwe - druga strona po prostu kasuje juz skasowany wiersz)
window.addEventListener("pagehide", () => {
  navigator.sendBeacon("/api/presence/leave");
});

function renderWidget() {
  const slot = document.getElementById("user-widget");
  if (!slot || !currentUser) return;
  // wlasny kolor uzytkownika - uzywany np. do podswietlenia "na czym teraz jestem" w niche.js
  document.documentElement.style.setProperty("--user-color", currentUser.color || "#6090e0");

  // Wyloguj tylko w glownym panelu (index.html) - na niszy/scheme rozmowy tylko avatar+profil
  const isMainPage = location.pathname === "/" || location.pathname === "/index.html";
  const logoutBtn = isMainPage
    ? `
    <button type="button" class="icon-btn user-widget-logout" id="user-widget-logout" title="Wyloguj">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v8"/>
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
      </svg>
    </button>`
    : "";

  // #1.3 - skrot do kalendarza w topbarze (obok dzwonka), tylko na dashboardzie
  const calBtn = isMainPage
    ? `
    <a class="icon-btn icon-btn-cal" href="/kalendarz.html" title="Kalendarz">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    </a>`
    : "";

  // #5b - dzwonek "skrzynki powiadomien" tylko na dashboardzie (obok avatara), kropka gdy sa
  // dzisiejsze zadania jeszcze nie przejrzane w skrzynce
  const bellBtn = isMainPage
    ? `
    <button type="button" class="icon-btn notif-bell" id="notif-bell" title="Powiadomienia">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span class="notif-bell-dot hidden" id="notif-bell-dot"></span>
    </button>`
    : "";

  slot.innerHTML = `
    <button type="button" class="user-widget-btn" id="user-widget-open" title="Profil i ustawienia">
      ${avatarGlyphHtml(currentUser, 38)}
      <span class="user-widget-name">${escapeHtml(currentUser.display_name)}</span>
    </button>
    ${calBtn}
    ${bellBtn}
    ${logoutBtn}
  `;
  document.getElementById("user-widget-open").addEventListener("click", openProfileModal);
  document.getElementById("user-widget-logout")?.addEventListener("click", doLogout);
  document.getElementById("notif-bell")?.addEventListener("click", toggleNotifPanel);
  if (isMainPage) refreshNotifDot();
}

async function doLogout() {
  await api.post("/api/auth/logout", {});
  location.href = "/login.html";
}

async function initAuthWidget() {
  try {
    const { user } = await api.get("/api/auth/me");
    currentUser = user;
    renderWidget();
  } catch {
    // api.js juz obsluzyl 401 (redirect na /login.html) - tu nic wiecej nie trzeba robic
  }
}

// ---------- modal profilu (budowany raz, doklejany do body przy pierwszym otwarciu) ----------

let profileModalEl = null;
let profileMeta = null;
let profileUsers = [];
let editingUserId = null;
let pendingProfileColor = "";
let avatarMode = "emoji";

function buildProfileModal() {
  const el = document.createElement("div");
  el.className = "modal-overlay hidden";
  el.id = "profile-modal";
  el.innerHTML = `
    <div class="modal">
      <h3>Profil</h3>
      <form id="profile-form">
        <div id="profile-user-picker"></div>

        <label for="profile-name">Wyświetlana nazwa</label>
        <input type="text" id="profile-name" required>

        <label>Avatar</label>
        <div class="avatar-editor">
          <div class="avatar-preview" id="profile-avatar-preview"></div>
          <div class="avatar-editor-controls">
            <div class="avatar-mode-toggle" id="avatar-mode-toggle">
              <button type="button" class="avatar-mode-btn" data-mode="emoji">Emoji</button>
              <button type="button" class="avatar-mode-btn" data-mode="photo">Zdjęcie</button>
            </div>
            <div id="avatar-mode-emoji">
              <input type="text" id="profile-avatar" maxlength="4" placeholder="np. 🐺 albo SM">
            </div>
            <div id="avatar-mode-photo" class="hidden">
              <input type="file" id="profile-avatar-file" accept="image/png,image/jpeg,image/webp" hidden>
              <div class="avatar-photo-actions">
                <button type="button" class="btn" id="profile-avatar-upload-btn">Wgraj zdjęcie</button>
                <button type="button" class="btn danger" id="profile-avatar-remove-btn">Usuń zdjęcie</button>
              </div>
              <div class="hint">JPG, PNG lub WEBP, max 2 MB.</div>
            </div>
          </div>
        </div>

        <label>Kolor</label>
        <div class="color-swatches" id="profile-color-swatches"></div>

        <div class="error" id="profile-error" style="display:none;"></div>

        <div class="actions">
          <button type="button" class="btn" id="profile-cancel">Anuluj</button>
          <button type="submit" class="btn primary">Zapisz</button>
        </div>
      </form>

      <div class="modal-divider"></div>

      <button type="button" class="btn" id="profile-password-toggle" style="width:100%;"></button>
      <form id="profile-password-form" class="hidden">
        <div id="profile-password-current-wrap">
          <label for="profile-current-password">Bieżące hasło</label>
          <input type="password" id="profile-current-password" autocomplete="current-password">
        </div>
        <label for="profile-new-password">Nowe hasło</label>
        <input type="password" id="profile-new-password" autocomplete="new-password">

        <div class="error" id="profile-password-error" style="display:none;"></div>

        <div class="actions">
          <button type="button" class="btn" id="profile-password-cancel">Anuluj</button>
          <button type="submit" class="btn primary">Zresetuj</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target.id === "profile-modal") closeProfileModal();
  });
  document.getElementById("profile-cancel").addEventListener("click", closeProfileModal);
  document.getElementById("profile-color-swatches").addEventListener("click", (e) => {
    const swatch = e.target.closest(".color-swatch");
    if (!swatch) return;
    pendingProfileColor = swatch.dataset.color;
    renderProfileColorSwatches();
  });
  document.getElementById("profile-form").addEventListener("submit", submitProfileForm);

  document.getElementById("avatar-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".avatar-mode-btn");
    if (btn) setAvatarMode(btn.dataset.mode);
  });
  document.getElementById("profile-avatar-upload-btn").addEventListener("click", () => {
    document.getElementById("profile-avatar-file").click();
  });
  document.getElementById("profile-avatar-file").addEventListener("change", handleAvatarFileChange);
  document.getElementById("profile-avatar-remove-btn").addEventListener("click", removeAvatarPhoto);

  document.getElementById("profile-password-toggle").addEventListener("click", expandPasswordSection);
  document.getElementById("profile-password-cancel").addEventListener("click", (e) => {
    e.preventDefault();
    collapsePasswordSection();
  });
  document.getElementById("profile-password-form").addEventListener("submit", submitPasswordForm);

  return el;
}

function renderProfileColorSwatches() {
  const colors = profileMeta ? profileMeta.nicheColors : [];
  document.getElementById("profile-color-swatches").innerHTML = ["", ...colors]
    .map((c) => {
      const cls = `color-swatch ${c === pendingProfileColor ? "active" : ""} ${c ? "" : "none"}`;
      return `<button type="button" class="${cls}" data-color="${c}" style="${c ? `background:${c}` : ""}" title="${c || "Brak koloru"}">${c ? "" : "✕"}</button>`;
    })
    .join("");
}

function setAvatarMode(mode) {
  avatarMode = mode;
  document.querySelectorAll(".avatar-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("avatar-mode-emoji").classList.toggle("hidden", mode !== "emoji");
  document.getElementById("avatar-mode-photo").classList.toggle("hidden", mode !== "photo");
}

function collapsePasswordSection() {
  document.getElementById("profile-password-form").classList.add("hidden");
  document.getElementById("profile-password-toggle").classList.remove("hidden");
  document.getElementById("profile-current-password").value = "";
  document.getElementById("profile-new-password").value = "";
  document.getElementById("profile-password-error").style.display = "none";
}

function expandPasswordSection() {
  document.getElementById("profile-password-toggle").classList.add("hidden");
  document.getElementById("profile-password-form").classList.remove("hidden");
  const isSelf = editingUserId === currentUser.id;
  document.getElementById(isSelf ? "profile-current-password" : "profile-new-password").focus();
}

function renderUserPicker() {
  const wrap = document.getElementById("profile-user-picker");
  if (currentUser.role !== "admin" || profileUsers.length <= 1) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = `
    <label for="profile-user-select">Edytujesz profil</label>
    <select id="profile-user-select">
      ${profileUsers
        .map((u) => `<option value="${u.id}" ${u.id === editingUserId ? "selected" : ""}>${escapeHtml(u.display_name)}${u.id === currentUser.id ? " (Ty)" : ""}</option>`)
        .join("")}
    </select>
  `;
  document.getElementById("profile-user-select").addEventListener("change", (e) => {
    editingUserId = Number(e.target.value);
    fillProfileFormForEditingUser();
  });
}

function fillProfileFormForEditingUser() {
  const target = profileUsers.find((u) => u.id === editingUserId) || currentUser;
  document.getElementById("profile-name").value = target.display_name;
  document.getElementById("profile-avatar").value = target.avatar_kind === "photo" ? "" : target.avatar || "";
  document.getElementById("profile-avatar-preview").innerHTML = avatarGlyphHtml(target, 64);
  setAvatarMode(target.avatar_kind === "photo" ? "photo" : "emoji");
  pendingProfileColor = target.color || "";
  renderProfileColorSwatches();

  // haslo: dla samego siebie trzeba podac biezace, admin resetujacy komus innemu - nie
  const isSelf = editingUserId === currentUser.id;
  document.getElementById("profile-password-toggle").textContent = isSelf ? "Zmień hasło" : `Zresetuj hasło — ${target.display_name}`;
  document.getElementById("profile-password-current-wrap").style.display = isSelf ? "" : "none";
  collapsePasswordSection();
}

async function openProfileModal() {
  if (!profileModalEl) profileModalEl = buildProfileModal();
  document.getElementById("profile-error").style.display = "none";
  editingUserId = currentUser.id;

  try {
    [profileMeta, profileUsers] = await Promise.all([api.get("/api/meta"), api.get("/api/users")]);
  } catch {
    profileMeta = profileMeta || { nicheColors: [] };
    profileUsers = profileUsers.length ? profileUsers : [currentUser];
  }

  renderUserPicker();
  fillProfileFormForEditingUser();
  profileModalEl.classList.remove("hidden");
}

function closeProfileModal() {
  if (profileModalEl) profileModalEl.classList.add("hidden");
}

// wspolna koncowka po kazdej zmianie avatara/nicku/koloru (zapis formularza, wgranie/usuniecie
// zdjecia) - aktualizuje lokalny cache, widget w topbarze (jesli edytowany to Ty) i sam formularz
function applyUpdatedUser(updated) {
  const idx = profileUsers.findIndex((u) => u.id === updated.id);
  if (idx >= 0) profileUsers[idx] = updated;
  if (updated.id === currentUser.id) {
    currentUser = updated;
    renderWidget();
  }
  if (updated.id === editingUserId) fillProfileFormForEditingUser();
  renderUserPicker();
}

async function submitProfileForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById("profile-error");
  errorEl.style.display = "none";
  try {
    const body = { display_name: document.getElementById("profile-name").value.trim(), color: pendingProfileColor };
    if (avatarMode === "emoji") body.avatar = document.getElementById("profile-avatar").value.trim();
    applyUpdatedUser(await api.patch(`/api/users/${editingUserId}`, body));
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  }
}

async function handleAvatarFileChange(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const errorEl = document.getElementById("profile-error");
  errorEl.style.display = "none";
  try {
    const formData = new FormData();
    formData.append("photo", file);
    applyUpdatedUser(await api.postForm(`/api/users/${editingUserId}/avatar-photo`, formData));
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  }
}

async function removeAvatarPhoto() {
  const errorEl = document.getElementById("profile-error");
  errorEl.style.display = "none";
  try {
    applyUpdatedUser(await api.patch(`/api/users/${editingUserId}`, { avatar: "" }));
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  }
}

async function submitPasswordForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById("profile-password-error");
  errorEl.style.display = "none";
  const newPassword = document.getElementById("profile-new-password").value;
  const isSelf = editingUserId === currentUser.id;

  try {
    if (isSelf) {
      await api.post(`/api/users/${editingUserId}/password`, {
        currentPassword: document.getElementById("profile-current-password").value,
        newPassword,
      });
    } else {
      await api.post(`/api/users/${editingUserId}/reset-password`, { newPassword });
    }
    collapsePasswordSection();
    alert("Hasło zapisane.");
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  }
}

// ---------- #5b: skrzynka powiadomien (dzwonek obok avatara na dashboardzie) ----------
// Alerty nie sa nigdzie zapisywane - serwer liczy je z biezacego stanu leadow
// (GET /api/notifications). "Przejrzane dzis" trzymamy w localStorage per dzien.

let notifPanelEl = null;
let notifData = null;

const NOTIF_KIND_LABEL = { meet: "Meet", callback: "Oddzwoń", sms: "SMS" };

function notifSeenKey(today) {
  return `notif-bell-seen-${today}`;
}

async function fetchNotifications() {
  try {
    notifData = await api.get("/api/notifications?days=14");
  } catch {
    notifData = { today: "", days: [] };
  }
  return notifData;
}

async function refreshNotifDot() {
  const dot = document.getElementById("notif-bell-dot");
  if (!dot) return;
  const data = await fetchNotifications();
  const todayGroup = data.days.find((d) => d.date === data.today);
  let seen = false;
  try {
    seen = localStorage.getItem(notifSeenKey(data.today)) === "1";
  } catch {}
  dot.classList.toggle("hidden", !(todayGroup && todayGroup.items.length && !seen));
}

function closeNotifPanel() {
  if (notifPanelEl) notifPanelEl.remove();
  notifPanelEl = null;
}

function notifDateLabel(iso, today) {
  if (iso === today) return "Dziś";
  const d = new Date(`${iso}T00:00:00`);
  const p = (n) => String(n).padStart(2, "0");
  const wd = d.toLocaleDateString("pl-PL", { weekday: "short" });
  return `${wd} ${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

async function toggleNotifPanel() {
  if (notifPanelEl) return closeNotifPanel();
  const bell = document.getElementById("notif-bell");
  if (!bell) return;

  const data = notifData || (await fetchNotifications());

  const pop = document.createElement("div");
  pop.className = "notif-panel";
  pop.innerHTML = data.days.length
    ? data.days
        .map(
          (g) => `
      <div class="notif-day">
        <div class="notif-day-head">${notifDateLabel(g.date, data.today)}</div>
        ${g.items
          .map(
            (it) => `
          <a class="notif-item" href="/script.html?leadId=${it.lead_id}">
            <span class="notif-item-kind ${it.kind}">${NOTIF_KIND_LABEL[it.kind] || it.kind}</span>
            <span class="notif-item-company">${escapeHtml(it.company)}</span>
            <span class="notif-item-meta">${escapeHtml(it.label)} · ${escapeHtml(it.niche_name)}</span>
          </a>`
          )
          .join("")}
      </div>`
        )
        .join("")
    : `<div class="notif-empty">Brak zadań w ostatnich dniach.</div>`;

  document.body.appendChild(pop);
  notifPanelEl = pop;

  const r = bell.getBoundingClientRect();
  pop.style.top = `${r.bottom + 8}px`;
  pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;

  try {
    if (data.today) localStorage.setItem(notifSeenKey(data.today), "1");
  } catch {}
  document.getElementById("notif-bell-dot")?.classList.add("hidden");
}

document.addEventListener("click", (e) => {
  if (notifPanelEl && !notifPanelEl.contains(e.target) && !e.target.closest("#notif-bell")) closeNotifPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNotifPanel();
});

initAuthWidget();
