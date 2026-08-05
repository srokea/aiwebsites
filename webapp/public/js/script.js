const params = new URLSearchParams(location.search);
const leadId = params.get("leadId");
if (!leadId) location.href = "/";

const SPEAKER_LABEL = { you: "Ty", them: "Oni", info: "Info" };
const TAG_LABELS = { instagram: "Instagram", facebook: "Facebook", booksy: "Booksy", youtube: "YouTube" };

function renderBlocks(blocks) {
  return (blocks || []).map(renderBlock).join("");
}

function renderBlock(b) {
  switch (b.type) {
    case "text": {
      // _src (indeks bloku w pliku zrodlowym) przychodzi tylko w trybie edycji - patrz /api/scripts/lead/:id?edit=1
      const src = b._src != null ? ` data-src="${b._src}"` : "";
      return `<div class="script-block ${b.speaker}"${src}><div class="speaker ${b.speaker}">${SPEAKER_LABEL[b.speaker] || ""}</div><div class="script-text">${b.html}</div></div>`;
    }
    case "note":
      return `<div class="note">${b.html}</div>`;
    case "dropWarning":
      return `<div class="drop-warning">${b.html}</div>`;
    case "divider":
      return `<div class="divider"></div>`;
    case "flowArrow":
      return `<div class="flow-arrow">&darr;</div>`;
    case "hookTag":
      return `<span class="hook-tag ${b.variant}">${escapeHtml(b.label)}</span>`;
    case "branch":
      return `
        <div class="branch ${b.open ? "open" : ""}">
          <div class="branch-header">
            <div class="branch-dot ${b.dot}"></div>
            <div class="branch-title">${escapeHtml(b.title)}</div>
            <div class="branch-arrow">&#9656;</div>
          </div>
          <div class="branch-content">${renderBlocks(b.content)}</div>
        </div>
      `;
    default:
      return "";
  }
}

function renderSection(section) {
  return `
    <div class="section">
      <span class="phase-label ${section.phaseClass}">Faza ${section.phase}</span>
      <h2>${escapeHtml(section.title)}</h2>
      ${renderBlocks(section.content)}
    </div>
  `;
}

// ---------- tryb edycji ----------
// Edytujemy SZABLON z pliku (surowa tresc z tokenami), nie wyrenderowany tekst tego leada -
// dzieki temu do pliku nie ma jak trafic nazwa konkretnej firmy w miejsce {firma}.
let editMode = false;
let scriptFile = null;
let sourceBlocks = []; // indeks w pliku -> { index, raw }
let openEditor = null;

async function loadSourceBlocks() {
  const { blocks } = await api.get(`/api/scripts/source/${encodeURIComponent(scriptFile)}`);
  sourceBlocks = blocks;
}

function closeEditor({ restore = true } = {}) {
  if (!openEditor) return;
  const { block, originalHtml } = openEditor;
  openEditor = null;
  if (restore) block.querySelector(".script-text").innerHTML = originalHtml;
  block.classList.remove("editing");
}

function openBlockEditor(block) {
  if (openEditor && openEditor.block === block) return;
  closeEditor();

  const index = Number(block.dataset.src);
  const source = sourceBlocks[index];
  if (!source || source.raw === null) {
    alert("Ten fragment ma dynamiczną treść (kod) — trzeba go zmienić bezpośrednio w pliku.");
    return;
  }

  const textEl = block.querySelector(".script-text");
  const originalHtml = textEl.innerHTML;
  openEditor = { block, originalHtml, index };
  block.classList.add("editing");

  textEl.innerHTML = `
    <textarea class="block-editor" rows="4"></textarea>
    <div class="block-editor-actions">
      <span class="block-editor-hint">Enter zapisuje · Shift+Enter nowa linia · Esc anuluje</span>
      <button type="button" class="btn block-cancel">Anuluj</button>
      <button type="button" class="btn primary block-save">Zapisz</button>
    </div>
  `;
  const ta = textEl.querySelector(".block-editor");
  ta.value = source.raw;
  ta.style.height = `${Math.max(ta.scrollHeight, 60)}px`;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

async function saveBlockEdit() {
  if (!openEditor) return;
  const { block, index } = openEditor;
  const raw = block.querySelector(".block-editor").value;
  const btn = block.querySelector(".block-save");
  btn.disabled = true;
  btn.textContent = "Zapisuję…";
  try {
    const { blocks } = await api.patch(`/api/scripts/source/${encodeURIComponent(scriptFile)}/${index}`, { raw });
    sourceBlocks = blocks;
    closeEditor({ restore: false });
    // przeladowanie z serwera - tresc wraca juz z podstawionymi wartosciami tego leada
    await render();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Zapisz";
    alert(err.message);
  }
}

async function setEditMode(on) {
  editMode = on;
  const toggle = document.getElementById("edit-toggle");
  toggle.classList.toggle("active", on);
  toggle.setAttribute("aria-pressed", String(on));
  toggle.title = on ? "Wyłącz edycję treści" : "Włącz edycję treści";
  document.getElementById("edit-banner").classList.toggle("hidden", !on);
  document.body.classList.toggle("edit-mode", on);
  closeEditor();

  if (on && !sourceBlocks.length) await loadSourceBlocks();
  await render();
}

document.getElementById("edit-toggle").addEventListener("click", () => setEditMode(!editMode));

document.getElementById("script-body").addEventListener("click", (e) => {
  if (e.target.closest(".block-save")) return saveBlockEdit();
  if (e.target.closest(".block-cancel")) return closeEditor();
  if (e.target.closest(".block-editor, .block-editor-actions")) return;

  const block = editMode && e.target.closest(".script-block[data-src]");
  if (block) {
    e.stopPropagation();
    openBlockEditor(block);
  }
});

document.getElementById("script-body").addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("block-editor")) return;
  if (e.key === "Escape") closeEditor();
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    saveBlockEdit();
  }
});

async function render() {
  const { lead, niche, script, scriptFile: file } = await api.get(
    `/api/scripts/lead/${leadId}${editMode ? "?edit=1" : ""}`
  );
  scriptFile = file;
  document.getElementById("edit-file").textContent = `${file}.js`;

  document.getElementById("back-link").href = `/niche.html?slug=${encodeURIComponent(niche.slug)}`;
  document.getElementById("back-link").textContent = `← Powrot do ${niche.name}`;

  document.title = `${lead.company_name} — scheme rozmowy`;
  document.getElementById("script-title").textContent = script.title;
  document.getElementById("script-subtitle").textContent = script.subtitle;
  document.getElementById("sms-note").textContent = script.smsNote;

  const activeTags = ["instagram", "facebook", "booksy", "youtube"].filter((t) => lead[`tag_${t}`]);
  document.getElementById("lead-context").innerHTML = `
    <div><b>${escapeHtml(lead.company_name)}</b></div>
    <div>${escapeHtml(lead.city || "—")}</div>
    <div>${escapeHtml(lead.phone || "—")}</div>
    <div>${activeTags.length ? activeTags.map((t) => TAG_LABELS[t]).join(", ") : "brak tagow platform"}</div>
  `;

  let body = script.sections.map(renderSection).join("");
  if (script.differences && script.differences.length) {
    body += `
      <div class="section">
        <h2>Roznice vs inne nisze</h2>
        <div class="differences">
          ${script.differences.map((d) => `<div class="diff-card"><h4>${escapeHtml(d.title)}</h4><p>${d.html}</p></div>`).join("")}
        </div>
      </div>
    `;
  }
  document.getElementById("script-body").innerHTML = body;
}

// rozwijanie galezi - w trybie edycji klik w naglowek nie moze zwijac galezi pod palcem,
// gdy celem bylo wejscie w tresc w srodku
document.getElementById("script-body").addEventListener("click", (e) => {
  const header = e.target.closest(".branch-header");
  if (!header) return;
  header.parentElement.classList.toggle("open");
});

initParticles();
render();
