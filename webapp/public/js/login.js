initParticles();

const params = new URLSearchParams(location.search);
const next = params.get("next");
const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

// juz zalogowany (np. wrocil na /login.html recznie) - od razu dalej, bez pokazywania kafelkow.
// Fetch bezposrednio (nie przez api.get) - jego 401-redirect wrzucilby nas z powrotem tutaj.
fetch("/api/auth/me").then((res) => {
  if (res.ok) location.href = safeNext;
});

let tileUsers = [];

function tileHtml(user) {
  return `
    <button type="button" class="login-tile" data-username="${escapeHtml(user.username)}">
      ${avatarGlyphHtml(user, 64)}
      <span class="login-tile-name">${escapeHtml(user.display_name)}</span>
    </button>
  `;
}

async function loadTiles() {
  const grid = document.getElementById("login-tiles");
  try {
    const res = await fetch("/api/auth/tiles");
    tileUsers = await res.json();
  } catch {
    tileUsers = [];
  }
  // "+" zawsze na koncu - konta bez kafelka (Root, przyszly Jarvis) loguja sie tylko tedy,
  // recznym podaniem loginu (patrz showPasswordStep(null))
  grid.innerHTML =
    tileUsers.map(tileHtml).join("") +
    `<button type="button" class="login-tile login-tile-add" id="login-tile-add" title="Zaloguj na inne konto">
      <span class="login-tile-plus">+</span>
      <span class="login-tile-name">Inne</span>
    </button>`;
}

function showTiles() {
  document.getElementById("login-tiles").classList.remove("hidden");
  document.getElementById("login-sub").textContent = "Kto dzwoni?";
  document.getElementById("login-password-step").classList.add("hidden");
}

function showPasswordStep(user) {
  document.getElementById("login-tiles").classList.add("hidden");
  document.getElementById("login-password-step").classList.remove("hidden");
  document.getElementById("login-error").style.display = "none";

  const selectedEl = document.getElementById("login-selected");
  const manualWrap = document.getElementById("login-manual-username-wrap");
  const hiddenUsername = document.getElementById("login-username");
  const visibleUsername = document.getElementById("login-username-visible");

  if (user) {
    document.getElementById("login-sub").textContent = "Podaj hasło";
    selectedEl.innerHTML = `${avatarGlyphHtml(user, 56)}<div class="login-selected-name">${escapeHtml(user.display_name)}</div>`;
    selectedEl.classList.remove("hidden");
    manualWrap.classList.add("hidden");
    hiddenUsername.value = user.username;
  } else {
    document.getElementById("login-sub").textContent = "Zaloguj się ręcznie";
    selectedEl.classList.add("hidden");
    manualWrap.classList.remove("hidden");
    visibleUsername.value = "";
    hiddenUsername.value = "";
  }

  document.getElementById("login-password").value = "";
  (user ? document.getElementById("login-password") : visibleUsername).focus();
}

document.getElementById("login-tiles").addEventListener("click", (e) => {
  if (e.target.closest("#login-tile-add")) {
    showPasswordStep(null);
    return;
  }
  const tile = e.target.closest(".login-tile");
  if (!tile) return;
  const user = tileUsers.find((u) => u.username === tile.dataset.username);
  if (user) showPasswordStep(user);
});

document.getElementById("login-back").addEventListener("click", showTiles);

document.getElementById("login-username-visible").addEventListener("input", (e) => {
  document.getElementById("login-username").value = e.target.value.trim();
});

document.getElementById("login-password-step").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.style.display = "none";

  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  try {
    await api.post("/api/auth/login", { username, password });
    location.href = safeNext;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
    document.getElementById("login-password").value = "";
    document.getElementById("login-password").focus();
  }
});

loadTiles();
