// Panel admina dla kart NFC (mmates.pl/r/:slug) - CRUD nad review_links, synchronizowany
// do Cloudflare KV po stronie serwera (patrz server/routes/reviews.js).

initParticles();

const gridEl = document.getElementById("review-grid");
const form = document.getElementById("review-form");
const errEl = document.getElementById("rv-error");

function cardHref(slug) {
  return `https://mmates.pl/r/${slug}`;
}

function reviewCardHtml(r) {
  const logo = r.logo_url
    ? `<img class="review-logo" src="${escapeHtml(r.logo_url)}" alt="">`
    : `<span class="review-logo review-logo-emoji">${escapeHtml(r.logo_emoji || "🔗")}</span>`;

  return `
  <div class="review-card ${r.active ? "" : "review-card--inactive"}" data-slug="${escapeHtml(r.slug)}" draggable="true">
    <div class="review-card-head">
      <span class="review-drag-handle" title="Przeciągnij, żeby zmienić kolejność">⠿</span>
      ${logo}
      <div class="review-card-title">
        <div class="review-name">${escapeHtml(r.business_name)}</div>
        <a class="review-link" href="${cardHref(r.slug)}" target="_blank" rel="noopener">mmates.pl/r/${escapeHtml(r.slug)}</a>
      </div>
    </div>
    ${r.tagline ? `<div class="review-tagline">${escapeHtml(r.tagline)}</div>` : ""}
    ${
      r.google_review_url
        ? `<a class="review-google" href="${escapeHtml(r.google_review_url)}" target="_blank" rel="noopener">↗ Opinia Google</a>`
        : `<span class="review-google review-google--missing">⚠ Brak linku do opinii — CTA nie zadziała</span>`
    }
    <div class="review-stats">
      <span>👆 ${r.scan_count} skanów</span>
      <span>🖱️ ${r.click_count} kliknięć</span>
    </div>
    <div class="review-actions">
      <button type="button" class="btn" data-edit="${escapeHtml(r.slug)}">Edytuj</button>
      <button type="button" class="btn" data-duplicate="${escapeHtml(r.slug)}">Duplikuj</button>
      <button type="button" class="btn" data-toggle="${escapeHtml(r.slug)}">${r.active ? "Wyłącz" : "Włącz"}</button>
      <button type="button" class="btn danger" data-del="${escapeHtml(r.slug)}">Usuń</button>
    </div>
  </div>`;
}

function editFormHtml(r) {
  return `
  <div class="review-card review-card--edit" data-slug="${escapeHtml(r.slug)}">
    <div class="review-name">${escapeHtml(r.business_name)} <span class="review-link">mmates.pl/r/${escapeHtml(r.slug)}</span></div>
    <input type="text" class="rv-edit-business" placeholder="Nazwa firmy" value="${escapeHtml(r.business_name)}">
    <input type="text" class="rv-edit-tagline" placeholder="Tagline" value="${escapeHtml(r.tagline)}">
    <input type="url" class="rv-edit-google" placeholder="Link do opinii Google" value="${escapeHtml(r.google_review_url)}">
    <input type="text" class="rv-edit-emoji" placeholder="Emoji" maxlength="4" value="${escapeHtml(r.logo_emoji)}">
    <input type="url" class="rv-edit-logo" placeholder="Logo URL" value="${escapeHtml(r.logo_url)}">
    <div class="review-logo-upload">
      <label class="review-file-btn">
        📎 Wgraj logo z pliku
        <input type="file" class="rv-edit-logo-file" data-upload-logo="${escapeHtml(r.slug)}" accept="image/png,image/jpeg,image/webp" hidden>
      </label>
      ${r.logo_url ? `<button type="button" class="btn" data-del-logo="${escapeHtml(r.slug)}">Usuń wgrane logo</button>` : ""}
    </div>
    <div class="review-actions">
      <button type="button" class="btn primary" data-save="${escapeHtml(r.slug)}">Zapisz</button>
      <button type="button" class="btn" data-cancel="${escapeHtml(r.slug)}">Anuluj</button>
    </div>
  </div>`;
}

let cards = [];
let editingSlug = null;

function render() {
  if (!cards.length) {
    gridEl.innerHTML = `<div class="empty-state">Brak kart — dodaj pierwszą powyżej.</div>`;
    return;
  }
  gridEl.innerHTML = cards
    .map((r) => (r.slug === editingSlug ? editFormHtml(r) : reviewCardHtml(r)))
    .join("");
}

async function load() {
  try {
    cards = await api.get("/api/reviews");
    render();
  } catch (err) {
    gridEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.style.display = "none";
  const body = {
    slug: document.getElementById("rv-slug").value.trim().toLowerCase(),
    business_name: document.getElementById("rv-business").value.trim(),
    tagline: document.getElementById("rv-tagline").value.trim(),
    google_url: document.getElementById("rv-google").value.trim(),
    emoji: document.getElementById("rv-emoji").value.trim(),
    logo_url: document.getElementById("rv-logo").value.trim(),
  };
  const fileInput = document.getElementById("rv-logo-file");
  const file = fileInput.files[0];

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await api.post("/api/reviews", body);
    if (file) {
      const fd = new FormData();
      fd.append("logo", file);
      await api.postForm(`/api/reviews/${body.slug}/logo`, fd);
    }
    form.reset();
    await load();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
  }
});

gridEl.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const duplicateBtn = e.target.closest("[data-duplicate]");
  const cancelBtn = e.target.closest("[data-cancel]");
  const saveBtn = e.target.closest("[data-save]");
  const toggleBtn = e.target.closest("[data-toggle]");
  const delBtn = e.target.closest("[data-del]");

  if (editBtn) {
    editingSlug = editBtn.dataset.edit;
    render();
    return;
  }
  if (duplicateBtn) {
    const source = cards.find((c) => c.slug === duplicateBtn.dataset.duplicate);
    if (!source) return;
    document.getElementById("rv-slug").value = "";
    document.getElementById("rv-business").value = source.business_name;
    document.getElementById("rv-tagline").value = source.tagline;
    document.getElementById("rv-google").value = source.google_review_url;
    document.getElementById("rv-emoji").value = source.logo_emoji;
    document.getElementById("rv-logo").value = source.logo_url;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("rv-slug").focus();
    return;
  }
  if (cancelBtn) {
    editingSlug = null;
    render();
    return;
  }
  if (saveBtn) {
    const slug = saveBtn.dataset.save;
    const cardEl = gridEl.querySelector(`.review-card--edit[data-slug="${CSS.escape(slug)}"]`);
    const body = {
      business_name: cardEl.querySelector(".rv-edit-business").value.trim(),
      tagline: cardEl.querySelector(".rv-edit-tagline").value.trim(),
      google_url: cardEl.querySelector(".rv-edit-google").value.trim(),
      emoji: cardEl.querySelector(".rv-edit-emoji").value.trim(),
      logo_url: cardEl.querySelector(".rv-edit-logo").value.trim(),
    };
    saveBtn.disabled = true;
    try {
      await api.patch(`/api/reviews/${slug}`, body);
      editingSlug = null;
      await load();
    } catch (err) {
      alert("Błąd zapisu: " + err.message);
      saveBtn.disabled = false;
    }
    return;
  }
  if (toggleBtn) {
    const slug = toggleBtn.dataset.toggle;
    const card = cards.find((c) => c.slug === slug);
    try {
      await api.patch(`/api/reviews/${slug}`, { active: card.active ? 0 : 1 });
      await load();
    } catch (err) {
      alert("Błąd: " + err.message);
    }
    return;
  }
  if (delBtn) {
    const slug = delBtn.dataset.del;
    if (!confirm(`Usunąć kartę "${slug}"? Link mmates.pl/r/${slug} przestanie działać.`)) return;
    try {
      await api.del(`/api/reviews/${slug}`);
      await load();
    } catch (err) {
      alert("Błąd usuwania: " + err.message);
    }
    return;
  }

  const delLogoBtn = e.target.closest("[data-del-logo]");
  if (delLogoBtn) {
    const slug = delLogoBtn.dataset.delLogo;
    try {
      await api.del(`/api/reviews/${slug}/logo`);
      await load();
      editingSlug = slug;
      render();
    } catch (err) {
      alert("Błąd usuwania logo: " + err.message);
    }
  }
});

// przeciagnij i upusc: zmienia kolejnosc kart w panelu (sort_order), bez wplywu na
// Cloudflare KV/publiczna strone - dziala tylko myszka (natywne HTML5 DnD, brak wsparcia dotyku)
let draggedSlug = null;

gridEl.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".review-card:not(.review-card--edit)");
  if (!card) return;
  draggedSlug = card.dataset.slug;
  card.classList.add("review-card--dragging");
  e.dataTransfer.effectAllowed = "move";
});

gridEl.addEventListener("dragover", (e) => {
  const card = e.target.closest(".review-card:not(.review-card--edit)");
  if (!card || card.dataset.slug === draggedSlug) return;
  e.preventDefault();
  const before = e.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
  card.classList.toggle("review-card--drop-before", before);
  card.classList.toggle("review-card--drop-after", !before);
});

gridEl.addEventListener("dragleave", (e) => {
  const card = e.target.closest(".review-card:not(.review-card--edit)");
  card?.classList.remove("review-card--drop-before", "review-card--drop-after");
});

gridEl.addEventListener("drop", async (e) => {
  const card = e.target.closest(".review-card:not(.review-card--edit)");
  if (!card || !draggedSlug || card.dataset.slug === draggedSlug) return;
  e.preventDefault();
  const before = card.classList.contains("review-card--drop-before");
  card.classList.remove("review-card--drop-before", "review-card--drop-after");

  const fromIdx = cards.findIndex((c) => c.slug === draggedSlug);
  const toIdx = cards.findIndex((c) => c.slug === card.dataset.slug);
  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = cards.splice(fromIdx, 1);
  const insertAt = toIdx + (before ? 0 : 1) - (fromIdx < toIdx ? 1 : 0);
  cards.splice(insertAt, 0, moved);
  render();

  try {
    await api.patch("/api/reviews/reorder", { slugs: cards.map((c) => c.slug) });
  } catch (err) {
    alert("Błąd zapisu kolejności: " + err.message);
    await load();
  }
});

gridEl.addEventListener("dragend", () => {
  draggedSlug = null;
  gridEl.querySelectorAll(".review-card--dragging").forEach((el) => el.classList.remove("review-card--dragging"));
  gridEl.querySelectorAll(".review-card--drop-before, .review-card--drop-after").forEach((el) =>
    el.classList.remove("review-card--drop-before", "review-card--drop-after")
  );
});

gridEl.addEventListener("change", async (e) => {
  const fileInput = e.target.closest("[data-upload-logo]");
  if (!fileInput) return;
  const slug = fileInput.dataset.uploadLogo;
  const file = fileInput.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("logo", file);
  try {
    await api.postForm(`/api/reviews/${slug}/logo`, fd);
    await load();
    editingSlug = slug;
    render();
  } catch (err) {
    alert("Błąd wgrywania logo: " + err.message);
  }
});

load();
