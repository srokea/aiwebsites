// Panel kart NFC do zbierania opinii Google. Lista linkow + statystyki (skany, kliknięcia,
// konwersja) i modal do tworzenia/edycji. Publiczna strona-ladowania klienta zyje pod
// /r/:slug (serwowana przez server/routes/reviews.js) - stad "Podgląd" otwiera nowa karte.

initParticles();

const listEl = document.getElementById("rev-list");
const modal = document.getElementById("rev-modal");
const form = document.getElementById("rev-form");
const errEl = document.getElementById("rev-error");
const modalTitle = document.getElementById("rev-modal-title");
const slugInput = document.getElementById("rev-slug");
const activeRow = document.getElementById("rev-active-row");
const activeInput = document.getElementById("rev-active");

let editingId = null;

const f = {
  slug: slugInput,
  biz: document.getElementById("rev-biz"),
  tagline: document.getElementById("rev-tagline"),
  url: document.getElementById("rev-url"),
  emoji: document.getElementById("rev-emoji"),
};

const logoFileInput = document.getElementById("rev-logo-file");
const logoPreview = document.getElementById("rev-logo-preview");
const logoRemoveBtn = document.getElementById("rev-logo-remove");

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

// plik wybrany w modalu, jeszcze nie wyslany (wysylka idzie dopiero przy "Zapisz", bo dla
// nowego linku potrzebujemy najpierw jego id); obiektowy URL do podgladu trzymamy, zeby go
// potem zwolnic
let stagedLogo = null;
let stagedLogoUrl = null;
let savedLogoPath = ""; // logo juz zapisane na serwerze dla edytowanego linku

function clearStagedLogo() {
  stagedLogo = null;
  logoFileInput.value = "";
  if (stagedLogoUrl) {
    URL.revokeObjectURL(stagedLogoUrl);
    stagedLogoUrl = null;
  }
}

function renderLogoPreview() {
  const src = stagedLogoUrl || savedLogoPath;
  if (src) {
    logoPreview.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
    logoRemoveBtn.hidden = false;
  } else {
    logoPreview.innerHTML = `<span class="rev-logo-none">bez logo — użyję emotki</span>`;
    logoRemoveBtn.hidden = true;
  }
}

function conversion(link) {
  if (!link.scan_count) return "—";
  return ((link.click_count / link.scan_count) * 100).toFixed(1) + "%";
}

// Z pola "emoji" bierzemy tylko PIERWSZY znak-grafem (pełna emotka razem z modyfikatorami
// koloru skóry / ZWJ), reszta i białe znaki lecą w kosz. Dzięki temu wklejenie "⭐ Kawiarnia"
// albo emotki z ogonem nie psuje karty, a maxlength w polu nie musi blokować dłuższych
// sekwencji emoji (rodzina, zawody itp. potrafią mieć 8+ jednostek UTF-16).
function firstEmoji(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    for (const { segment } of new Intl.Segmenter("pl", { granularity: "grapheme" }).segment(s)) {
      return segment;
    }
  }
  return Array.from(s)[0] || "";
}

function render(links) {
  if (!links.length) {
    listEl.innerHTML = `<div class="empty-state">Brak linków — kliknij „+ Nowy link”, żeby stworzyć pierwszą kartę.</div>`;
    return;
  }
  listEl.innerHTML = `
    <table class="rev-table">
      <thead>
        <tr>
          <th>Slug</th><th>Firma</th>
          <th class="num">Skany</th><th class="num">Kliknięcia</th><th class="num">Konwersja</th>
          <th>Aktywny</th><th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${links
          .map(
            (l) => `
          <tr class="${l.active ? "" : "rev-row-off"}">
            <td><a class="rev-slug-link" href="/r/${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">/r/${escapeHtml(l.slug)}</a></td>
            <td class="rev-biz-cell">
              ${
                l.logo_path
                  ? `<img class="rev-thumb" src="${escapeHtml(l.logo_path)}" alt="">`
                  : `<span class="rev-thumb rev-thumb-emoji">${escapeHtml(l.logo_emoji || "⭐")}</span>`
              }
              <span>${escapeHtml(l.business_name || "—")}</span>
            </td>
            <td class="num">${l.scan_count}</td>
            <td class="num">${l.click_count}</td>
            <td class="num">${conversion(l)}</td>
            <td>${l.active ? '<span class="rev-badge on">Tak</span>' : '<span class="rev-badge off">Nie</span>'}</td>
            <td class="rev-actions">
              <a class="btn rev-btn-sm" href="/r/${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">Podgląd</a>
              <button type="button" class="btn rev-btn-sm" data-edit="${l.id}">Edytuj</button>
              <button type="button" class="btn danger rev-btn-sm" data-del="${l.id}">Usuń</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

let cache = [];

async function load() {
  try {
    cache = await api.get("/api/reviews");
    render(cache);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

function openModal(link) {
  editingId = link ? link.id : null;
  errEl.style.display = "none";
  modalTitle.textContent = link ? "Edytuj link" : "Nowy link";
  slugInput.disabled = !!link;
  activeRow.hidden = !link;

  f.slug.value = link ? link.slug : "";
  f.biz.value = link ? link.business_name : "";
  f.tagline.value = link ? link.tagline : "";
  f.url.value = link ? link.google_review_url : "";
  f.emoji.value = link ? link.logo_emoji : "";
  activeInput.checked = link ? !!link.active : true;

  clearStagedLogo();
  savedLogoPath = link ? link.logo_path || "" : "";
  renderLogoPreview();

  modal.classList.remove("hidden");
  (link ? f.biz : f.slug).focus();
}

function closeModal() {
  modal.classList.add("hidden");
  clearStagedLogo();
}

document.getElementById("rev-new-btn").addEventListener("click", () => openModal(null));
document.getElementById("rev-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

// slug: na biezaco tniemy do dozwolonych znakow, zeby nie dalo sie wpisac czegos, co
// serwer i tak odrzuci (/^[a-z0-9-]+$/, max 20)
slugInput.addEventListener("input", () => {
  slugInput.value = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
});

// emoji: normalizujemy dopiero po wyjsciu z pola (nie w trakcie - klawiatura emoji na
// telefonie wstawia znak po znaku), zeby uzytkownik od razu widzial, co realnie zapiszemy
f.emoji.addEventListener("blur", () => {
  f.emoji.value = firstEmoji(f.emoji.value);
});

logoFileInput.addEventListener("change", () => {
  errEl.style.display = "none";
  const file = logoFileInput.files[0];
  if (!file) return;
  if (!LOGO_TYPES.includes(file.type)) {
    errEl.textContent = "Dozwolone pliki: PNG, JPG, WEBP.";
    errEl.style.display = "block";
    logoFileInput.value = "";
    return;
  }
  if (file.size > LOGO_MAX_BYTES) {
    errEl.textContent = "Plik za duży (max 2 MB).";
    errEl.style.display = "block";
    logoFileInput.value = "";
    return;
  }
  if (stagedLogoUrl) URL.revokeObjectURL(stagedLogoUrl);
  stagedLogo = file;
  stagedLogoUrl = URL.createObjectURL(file);
  renderLogoPreview();
});

logoRemoveBtn.addEventListener("click", async () => {
  if (stagedLogo) {
    // jeszcze niewyslany wybor - po prostu go cofamy
    clearStagedLogo();
    renderLogoPreview();
    return;
  }
  if (!editingId || !savedLogoPath) return;
  if (!confirm("Usunąć wgrane logo? Karta wróci do wyświetlania emotki.")) return;
  logoRemoveBtn.disabled = true;
  try {
    const updated = await api.del(`/api/reviews/${editingId}/logo`);
    savedLogoPath = updated.logo_path || "";
    renderLogoPreview();
    load();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  } finally {
    logoRemoveBtn.disabled = false;
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.style.display = "none";
  const saveBtn = document.getElementById("rev-save");
  saveBtn.disabled = true;
  try {
    let saved;
    if (editingId) {
      saved = await api.patch(`/api/reviews/${editingId}`, {
        business_name: f.biz.value,
        tagline: f.tagline.value,
        google_review_url: f.url.value,
        logo_emoji: firstEmoji(f.emoji.value),
        active: activeInput.checked,
      });
    } else {
      saved = await api.post("/api/reviews", {
        slug: f.slug.value,
        business_name: f.biz.value,
        tagline: f.tagline.value,
        google_review_url: f.url.value,
        logo_emoji: firstEmoji(f.emoji.value),
      });
    }

    // logo idzie osobnym multipartem - dopiero teraz, bo dla nowego linku potrzebowaliśmy id
    if (stagedLogo && saved && saved.id) {
      const fd = new FormData();
      fd.append("logo", stagedLogo);
      await api.postForm(`/api/reviews/${saved.id}/logo`, fd);
    }

    closeModal();
    load();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
  }
});

listEl.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");
  if (editBtn) {
    const link = cache.find((l) => String(l.id) === editBtn.dataset.edit);
    if (link) openModal(link);
    return;
  }
  if (delBtn) {
    const link = cache.find((l) => String(l.id) === delBtn.dataset.del);
    if (!link) return;
    if (!confirm(`Usunąć link /r/${link.slug}? Statystyki przepadną, a karta przestanie działać.`)) return;
    try {
      await api.del(`/api/reviews/${link.id}`);
      load();
    } catch (err) {
      alert("Błąd usuwania: " + err.message);
    }
  }
});

load();
