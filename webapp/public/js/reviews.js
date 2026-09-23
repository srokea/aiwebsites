// Panel admina dla kart NFC (mmates.pl/r/:slug) - CRUD nad review_links, synchronizowany
// do Cloudflare KV po stronie serwera (patrz server/routes/reviews.js).

initParticles();

const gridEl = document.getElementById("review-grid");
const form = document.getElementById("review-form");
const errEl = document.getElementById("rv-error");

function cardHref(slug) {
  return `https://mmates.pl/r/${slug}`;
}

// Tlo strony karty: '' = domyslny gradient Workera, '#rrggbb' = kolor, '#rrggbb,#rrggbb' = gradient.
// "Domyślne" pokazujemy w podgladzie jako przyblizenie obecnego niebiesko-fioletowego gradientu.
const DEFAULT_BG_PREVIEW = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
const BG_PRESETS = [
  { value: "", label: "Domyślne" },
  { value: "#0f0f0f", label: "Czarne" },
  { value: "#232526,#414345", label: "Grafit" },
  { value: "#ffffff", label: "Białe" },
  { value: "#f5efe6", label: "Beż" },
  { value: "#0f2027,#2c5364", label: "Granat" },
  { value: "#134e5e,#71b280", label: "Zieleń" },
  { value: "#ee9ca7,#ffdde1", label: "Róż" },
];

function bgCss(bg) {
  if (!bg) return DEFAULT_BG_PREVIEW;
  const [a, b] = bg.split(",");
  return b ? `linear-gradient(135deg, ${a} 0%, ${b} 100%)` : a;
}
function isLightBg(bg) {
  if (!bg) return false;
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const cols = bg.split(",");
  return cols.reduce((s, c) => s + lum(c), 0) / cols.length > 0.6;
}

function logoHtml(r) {
  if (r.show_logo === 0) return "";
  return r.logo_url
    ? `<img class="review-logo" src="${escapeHtml(r.logo_url)}" alt="">`
    : `<span class="review-logo review-logo-emoji">${escapeHtml(r.logo_emoji || "🔗")}</span>`;
}

// mini-podglad strony karty w trybie edycji (tlo + logo/tekst) - odswiezany na zywo
// Podglad = to samo co publiczna karta (cloudflare-worker/review-card.js): biala karta na tle
// (kolor/gradient + opcjonalne zdjecie z rozmyciem), przycisk w kolorze tla.
function bgLayerHtml(r, scale = 1) {
  const img = r.bg_image_url;
  const blur = (Number(r.bg_blur) || 0) * scale;
  return `
    <div class="rv-bgfill" style="background:${bgCss(r.bg)}"></div>
    ${img ? `<div class="rv-preview-img" style="background-image:url('${escapeHtml(img)}'); filter:blur(${blur}px); transform:scale(${blur ? 1.15 : 1})"></div>` : ""}`;
}

function previewHtml(r) {
  const btnBg = isLightBg(r.bg) ? "#1a1a2e" : bgCss(r.bg);
  return `
    <div class="rv-preview">
      ${bgLayerHtml(r, 0.5)}
      <div class="rv-preview-card">
        ${logoHtml(r)}
        <div class="rv-preview-name">${escapeHtml(r.business_name || "Nazwa firmy")}</div>
        ${r.tagline ? `<div class="rv-preview-tagline">${escapeHtml(r.tagline)}</div>` : ""}
        <div class="rv-preview-stars">⭐⭐⭐⭐⭐</div>
        <div class="rv-preview-cta" style="background:${btnBg}">Napisz opinię w Google</div>
      </div>
    </div>`;
}

// zdjecie w tle: wgranie z pliku albo wklejenie ze schowka (Cmd/Ctrl+V w otwartej karcie) +
// suwak rozmycia (0-20 px, zapisywany razem z reszta przyciskiem "Zapisz")
function bgImageHtml(r) {
  const blur = Number(r.bg_blur) || 0;
  return `
    <div class="rv-bg-label">Zdjęcie w tle</div>
    <div class="review-logo-upload">
      <label class="review-file-btn">
        🖼️ ${r.bg_image_url ? "Zmień zdjęcie" : "Wgraj zdjęcie"}
        <input type="file" data-upload-bg="${escapeHtml(r.slug)}" accept="image/png,image/jpeg,image/webp" hidden>
      </label>
      ${r.bg_image_url ? `<button type="button" class="btn" data-del-bg="${escapeHtml(r.slug)}">Usuń zdjęcie</button>` : ""}
    </div>
    <div class="rv-bg-hint">albo skopiuj zdjęcie i wklej je tutaj (Cmd+V / Ctrl+V) · max 2 MB</div>
    ${
      r.bg_image_url
        ? `<label class="rv-blur">Rozmycie
             <input type="range" class="rv-edit-blur" min="0" max="20" step="1" value="${blur}">
             <span class="rv-blur-val">${blur}px</span>
           </label>`
        : `<input type="hidden" class="rv-edit-blur" value="${blur}">`
    }`;
}

function reviewCardHtml(r) {
  const logo = logoHtml(r);

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
      <span class="review-bg-thumb" title="Tło karty">${bgLayerHtml(r, 0.25)}</span>
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
    <label class="rv-check"><input type="checkbox" class="rv-edit-nologo" ${r.show_logo === 0 ? "checked" : ""}> Bez logo — sam tekst</label>
    <div class="review-logo-upload">
      <label class="review-file-btn">
        📎 Wgraj logo z pliku
        <input type="file" class="rv-edit-logo-file" data-upload-logo="${escapeHtml(r.slug)}" accept="image/png,image/jpeg,image/webp" hidden>
      </label>
      ${r.logo_url ? `<button type="button" class="btn" data-del-logo="${escapeHtml(r.slug)}">Usuń wgrane logo</button>` : ""}
    </div>
    <div class="rv-bg-editor">
      <div class="rv-bg-label">Tło karty</div>
      <input type="hidden" class="rv-edit-bg" value="${escapeHtml(r.bg || "")}">
      <div class="rv-bg-swatches">
        ${BG_PRESETS.map(
          (p) => `<button type="button" class="rv-bg-swatch ${(r.bg || "") === p.value ? "active" : ""}" data-bg-preset="${p.value}"
            title="${p.label}" style="background:${bgCss(p.value)}"></button>`
        ).join("")}
      </div>
      <div class="rv-bg-custom">
        <label>Własne <input type="color" class="rv-edit-bg1" value="${(r.bg || "").split(",")[0] || "#667eea"}"></label>
        <label class="rv-check"><input type="checkbox" class="rv-edit-bg-grad" ${(r.bg || "").includes(",") ? "checked" : ""}> gradient</label>
        <input type="color" class="rv-edit-bg2" value="${(r.bg || "").split(",")[1] || "#764ba2"}" ${(r.bg || "").includes(",") ? "" : "disabled"}>
      </div>
    </div>
    <div class="rv-bgimg">${bgImageHtml(r)}</div>
    <div class="rv-preview-wrap">${previewHtml(r)}</div>
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
    show_logo: !document.getElementById("rv-nologo").checked,
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
    document.getElementById("rv-nologo").checked = source.show_logo === 0;
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
      show_logo: !cardEl.querySelector(".rv-edit-nologo").checked,
      bg: cardEl.querySelector(".rv-edit-bg").value,
      bg_blur: Number(cardEl.querySelector(".rv-edit-blur").value) || 0,
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

// ---------- edycja tla + "bez logo": zywy podglad w otwartej karcie ----------
function editState(cardEl) {
  const r = cards.find((c) => c.slug === cardEl.dataset.slug) || {};
  return {
    ...r,
    business_name: cardEl.querySelector(".rv-edit-business").value.trim(),
    tagline: cardEl.querySelector(".rv-edit-tagline").value.trim(),
    logo_emoji: cardEl.querySelector(".rv-edit-emoji").value.trim(),
    logo_url: cardEl.querySelector(".rv-edit-logo").value.trim(),
    show_logo: cardEl.querySelector(".rv-edit-nologo").checked ? 0 : 1,
    bg: cardEl.querySelector(".rv-edit-bg").value,
    bg_blur: Number(cardEl.querySelector(".rv-edit-blur").value) || 0,
  };
}

function refreshPreview(cardEl) {
  const st = editState(cardEl);
  cardEl.querySelector(".rv-preview-wrap").innerHTML = previewHtml(st);
  cardEl.querySelectorAll(".rv-bg-swatch").forEach((b) => b.classList.toggle("active", b.dataset.bgPreset === st.bg));
}

// wartosc z "Wlasne" (kolor + opcjonalnie drugi kolor gradientu) -> ukryte pole bg
function applyCustomBg(cardEl) {
  const grad = cardEl.querySelector(".rv-edit-bg-grad").checked;
  const c2 = cardEl.querySelector(".rv-edit-bg2");
  c2.disabled = !grad;
  const c1 = cardEl.querySelector(".rv-edit-bg1").value;
  cardEl.querySelector(".rv-edit-bg").value = grad ? `${c1},${c2.value}` : c1;
  refreshPreview(cardEl);
}

gridEl.addEventListener("click", (e) => {
  const sw = e.target.closest("[data-bg-preset]");
  if (!sw) return;
  const cardEl = sw.closest(".review-card--edit");
  const v = sw.dataset.bgPreset;
  cardEl.querySelector(".rv-edit-bg").value = v;
  if (v) {
    const [a, b] = v.split(",");
    cardEl.querySelector(".rv-edit-bg1").value = a;
    cardEl.querySelector(".rv-edit-bg-grad").checked = Boolean(b);
    const c2 = cardEl.querySelector(".rv-edit-bg2");
    c2.disabled = !b;
    if (b) c2.value = b;
  }
  refreshPreview(cardEl);
});

gridEl.addEventListener("input", (e) => {
  const cardEl = e.target.closest(".review-card--edit");
  if (!cardEl) return;
  if (e.target.matches(".rv-edit-bg1, .rv-edit-bg2, .rv-edit-bg-grad")) applyCustomBg(cardEl);
  else if (e.target.matches(".rv-edit-blur")) {
    cardEl.querySelector(".rv-blur-val").textContent = `${e.target.value}px`;
    refreshPreview(cardEl);
  }
  else if (e.target.matches("input")) refreshPreview(cardEl);
});

// wgranie/usuniecie zdjecia zapisuje sie od razu na serwerze, ale NIE przerysowujemy calej
// karty - reszta niezapisanych zmian w formularzu (tlo, tekst, rozmycie) zostaje na miejscu
async function uploadBg(slug, file) {
  const cardEl = gridEl.querySelector(`.review-card--edit[data-slug="${CSS.escape(slug)}"]`);
  if (!cardEl || !file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return alert("Dozwolone pliki: JPG, PNG, WEBP");
  if (file.size > 2 * 1024 * 1024) return alert("Plik za duży (max 2 MB)");
  const fd = new FormData();
  fd.append("image", file, file.name || "tlo.png");
  try {
    applyBgImage(cardEl, await api.postForm(`/api/reviews/${slug}/bg`, fd));
  } catch (err) {
    alert("Błąd wgrywania zdjęcia: " + err.message);
  }
}

function applyBgImage(cardEl, saved) {
  const card = cards.find((c) => c.slug === saved.slug);
  if (card) card.bg_image_url = saved.bg_image_url;
  const st = { ...editState(cardEl), bg_image_url: saved.bg_image_url };
  cardEl.querySelector(".rv-bgimg").innerHTML = bgImageHtml(st);
  refreshPreview(cardEl);
}

gridEl.addEventListener("change", (e) => {
  const input = e.target.closest("[data-upload-bg]");
  if (input) uploadBg(input.dataset.uploadBg, input.files[0]);
});

gridEl.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del-bg]");
  if (!del) return;
  const cardEl = del.closest(".review-card--edit");
  try {
    applyBgImage(cardEl, await api.del(`/api/reviews/${del.dataset.delBg}/bg`));
  } catch (err) {
    alert("Błąd usuwania zdjęcia: " + err.message);
  }
});

// wklejenie zdjecia ze schowka, gdy jakas karta jest otwarta do edycji
document.addEventListener("paste", (e) => {
  if (!editingSlug) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
  if (!item) return;
  e.preventDefault();
  uploadBg(editingSlug, item.getAsFile());
});

load();
