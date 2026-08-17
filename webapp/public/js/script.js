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
  const phoneHref = telHref(lead.phone);
  document.getElementById("lead-context").innerHTML = `
    <div><a class="lead-context-name" href="${escapeHtml(companyGoogleSearchHref(lead))}" target="_blank" rel="noopener" title="Szukaj w Google"><b>${escapeHtml(lead.company_name)}</b></a></div>
    <div>${escapeHtml(lead.city || "—")}</div>
    <div>${
      phoneHref
        ? `<a class="lead-call-btn" href="tel:${escapeHtml(phoneHref)}">📞 ${escapeHtml(lead.phone)}</a>`
        : escapeHtml(lead.phone || "—")
    }</div>
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

// ---------- panel boczny: szybkie akcje na leadzie, bez opuszczania scheme rozmowy ----------
// Te same pola co w tabeli niszy (fieldCsel/closeAllPopovers z api.js - wspolne z niche.js) -
// zapis idzie przez ten sam PATCH /api/leads/:id, wiec zmiany tu widac tez od razu w niszy.
let panelMeta = null;
let panelLead = null;

// "Czas do decyzji" - zabawowy stoper: ile czasu minelo na tej podstronie do PIERWSZEJ zmiany
// "Zainteresowany" w tej wizycie. Zamraza sie raz - kolejne zmiany juz nie licza czasu od nowa.
// Reczny reset (guzik ↺ przy zegarze) startuje od zera od nowa.
let panelTimerStart = Date.now();
let panelTimerFrozenAt = null;
let panelTimerInterval = null;

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function renderPanelTimer() {
  const el = document.getElementById("panel-timer");
  if (!el) return;
  el.textContent = formatElapsed((panelTimerFrozenAt ?? Date.now()) - panelTimerStart);
  el.classList.toggle("frozen", panelTimerFrozenAt != null);
}

function freezeTimerOnce() {
  if (panelTimerFrozenAt != null) return;
  panelTimerFrozenAt = Date.now();
  renderPanelTimer();
  clearInterval(panelTimerInterval);
}

async function resetPanelTimer() {
  panelTimerStart = Date.now();
  panelTimerFrozenAt = null;
  renderPanelTimer();
  clearInterval(panelTimerInterval);
  panelTimerInterval = setInterval(renderPanelTimer, 1000);
  try {
    panelLead = await api.patch(`/api/leads/${leadId}`, { decision_seconds: null });
  } catch {
    // reset lokalny i tak sie udal - brak zapisu na serwerze nie blokuje pracy dalej
  }
}

// edycja notatki wprost w panelu (bez modala) - te same endpointy co corkboard w niche.js
let editingPanelNoteId = null;

function panelNoteHtml(n) {
  if (n.id === editingPanelNoteId) {
    return `
      <div class="panel-note panel-note-editing">
        <textarea class="panel-note-edit-input">${escapeHtml(n.content)}</textarea>
        <div class="panel-note-edit-actions">
          <button type="button" class="panel-note-edit-cancel">Anuluj</button>
          <button type="button" class="panel-note-edit-save" data-note-id="${n.id}">Zapisz</button>
        </div>
      </div>`;
  }
  const editedLbl = n.updated_at ? ` · edytowano ${noteDateLabel(n.updated_at)}` : "";
  return `
    <div class="panel-note">
      <button type="button" class="panel-note-edit-btn" data-note-id="${n.id}" title="Edytuj notatkę">✎</button>
      <button type="button" class="panel-note-delete-btn" data-note-id="${n.id}" title="Usuń notatkę">✕</button>
      <div class="panel-note-content">${escapeHtml(n.content)}</div>
      <div class="panel-note-date">${noteDateLabel(n.created_at)}${editedLbl}</div>
    </div>`;
}

function panelNotesHtml() {
  const notes = panelLead.notes_list || [];
  if (!notes.length) return `<div class="panel-note-empty">Brak notatek</div>`;
  return notes.map(panelNoteHtml).join("");
}

async function savePanelNoteEdit(noteId) {
  const textarea = document.querySelector(".panel-note-edit-input");
  const content = textarea ? textarea.value.trim() : "";
  if (!content) return;
  try {
    panelLead.notes_list = await api.patch(`/api/leads/${leadId}/notes/${noteId}`, { content });
    editingPanelNoteId = null;
    renderLeadPanel();
  } catch (err) {
    alert("Błąd zapisu notatki: " + err.message);
  }
}

async function deletePanelNote(noteId) {
  if (!confirm("Usunąć tę notatkę?")) return;
  try {
    panelLead.notes_list = await api.del(`/api/leads/${leadId}/notes/${noteId}`);
    renderLeadPanel();
  } catch (err) {
    alert("Błąd usuwania notatki: " + err.message);
  }
}

function renderLeadPanel() {
  const panel = document.getElementById("lead-panel");
  if (!panel || !panelLead || !panelMeta) return;

  const callerOptions = panelMeta.callers.map((c) => ({ value: c, label: c, color: panelMeta.callerColors[c] || "#888" }));

  panel.innerHTML = `
    <div class="lead-panel-timer-row">
      <div class="lead-panel-timer" id="panel-timer" title="Czas od otwarcia strony do pierwszej decyzji o zainteresowaniu">00:00</div>
      <button type="button" class="panel-timer-reset" id="panel-timer-reset" title="Zresetuj czas">↺</button>
    </div>

    <div class="lead-panel-field">
      <label>Zainteresowany</label>
      ${fieldCsel("interested", panelMeta.interestedOptions, panelLead.interested)}
    </div>

    <div class="lead-panel-field">
      <label>Kto dzwoni</label>
      ${fieldCsel("caller", callerOptions, panelLead.caller, "—")}
    </div>

    <div class="lead-panel-field-row">
      <div class="lead-panel-field">
        <label>Jakość</label>
        ${fieldCsel("quality", panelMeta.qualityOptions, panelLead.quality, "—")}
      </div>
      <div class="lead-panel-field">
        <label>Strona</label>
        ${fieldCsel("has_social", panelMeta.websiteStatusOptions, panelLead.has_social, "—")}
      </div>
    </div>

    <div class="lead-panel-field-row">
      <div class="lead-panel-field">
        <label>Odebrał?</label>
        <div class="answered-toggle">
          <button type="button" class="answered-btn yes ${panelLead.answered === "Tak" ? "active" : ""}" data-answered-value="Tak" title="Odebrał">✓</button>
          <button type="button" class="answered-btn no ${panelLead.answered === "Nie" ? "active" : ""}" data-answered-value="Nie" title="Nie odebrał">✕</button>
        </div>
      </div>
      <div class="lead-panel-field">
        <label>Social</label>
        <div class="tags-popover">
          <div class="tags-trigger">${tagsTriggerContent(panelLead, panelMeta)}</div>
          <div class="tags-menu">${tagsMenuContent(panelLead, panelMeta)}</div>
        </div>
      </div>
    </div>

    <div class="lead-panel-field">
      <label>Kiedy oddzwonić</label>
      <input type="date" data-panel-field="callback_when" value="${escapeHtml(panelLead.callback_when)}">
    </div>

    <div class="lead-panel-field">
      <label>Termin Google Meet</label>
      <input type="datetime-local" data-panel-field="google_term" value="${escapeHtml(panelLead.google_term)}">
    </div>

    <div class="lead-panel-field">
      <label>Notatki</label>
      <div class="lead-panel-notes">${panelNotesHtml()}</div>
      <form id="panel-note-form">
        <textarea id="panel-note-input" placeholder="Nowa notatka... (Enter = przypnij)" rows="2"></textarea>
      </form>
    </div>
  `;
  renderPanelTimer();

  if (editingPanelNoteId != null) {
    const textarea = document.querySelector(".panel-note-edit-input");
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }
}

async function savePanelField(field, value) {
  try {
    const body = { [field]: value };
    // pierwsza zmiana Zainteresowany w tej wizycie - zamrazamy I ZAPISUJEMY czas na leadzie
    // (w tym samym requescie), zeby przetrwal odswiezenie/kolejna wizyte na tej podstronie
    if (field === "interested" && panelTimerFrozenAt == null) {
      body.decision_seconds = Math.round((Date.now() - panelTimerStart) / 1000);
    }
    // wybor "Booksy" w Stronie zaznacza tez tag platformy - tak samo jak w tabeli niszy
    if (field === "has_social" && value === "Booksy") body.tag_booksy = true;
    panelLead = await api.patch(`/api/leads/${leadId}`, body);
    if (field === "interested") freezeTimerOnce();
    renderLeadPanel();
    closeAllPopovers();
  } catch (err) {
    alert("Błąd zapisu: " + err.message);
  }
}

// nasluchy dopiete raz na staly kontener #lead-panel (przetrwaja kazdy renderLeadPanel, bo
// tylko innerHTML sie podmienia, nie sam element) - ten sam wzorzec co tbody w niche.js
document.getElementById("lead-panel").addEventListener("click", (e) => {
  const trigger = e.target.closest(".csel-trigger, .tags-trigger");
  if (trigger) {
    const box = trigger.closest(".csel, .tags-popover");
    const wasOpen = box.classList.contains("open");
    closeAllPopovers();
    if (!wasOpen) box.classList.add("open");
    return;
  }

  const option = e.target.closest(".csel-option");
  if (option) {
    const csel = option.closest(".csel");
    savePanelField(csel.dataset.field, option.dataset.value);
    return;
  }

  const answeredBtn = e.target.closest(".answered-btn");
  if (answeredBtn) {
    const val = answeredBtn.dataset.answeredValue;
    savePanelField("answered", panelLead.answered === val ? "" : val);
    return;
  }

  const resetBtn = e.target.closest("#panel-timer-reset");
  if (resetBtn) {
    resetPanelTimer();
    return;
  }

  const editBtn = e.target.closest(".panel-note-edit-btn");
  if (editBtn) {
    editingPanelNoteId = Number(editBtn.dataset.noteId);
    renderLeadPanel();
    return;
  }

  const saveBtn = e.target.closest(".panel-note-edit-save");
  if (saveBtn) {
    savePanelNoteEdit(Number(saveBtn.dataset.noteId));
    return;
  }

  const cancelBtn = e.target.closest(".panel-note-edit-cancel");
  if (cancelBtn) {
    editingPanelNoteId = null;
    renderLeadPanel();
    return;
  }

  const deleteBtn = e.target.closest(".panel-note-delete-btn");
  if (deleteBtn) {
    deletePanelNote(Number(deleteBtn.dataset.noteId));
  }
});

document.getElementById("lead-panel").addEventListener("change", (e) => {
  const tagField = e.target.dataset.tagField;
  if (tagField) {
    saveTagField(tagField, e.target.checked);
    return;
  }
  const field = e.target.dataset.panelField;
  if (field) savePanelField(field, e.target.value);
});

// checkbox tagu platformy - odswieza tylko podglad (i ew. dropdown Strona), nie caly panel,
// zeby popover z checkboxami zostal otwarty przy zaznaczaniu kilku naraz (jak w niche.js)
async function saveTagField(tagField, checked) {
  try {
    const body = { [tagField]: checked };
    if (tagField === "tag_booksy" && checked && panelLead.has_social !== "Tak") body.has_social = "Booksy";
    panelLead = await api.patch(`/api/leads/${leadId}`, body);

    const trigger = document.querySelector("#lead-panel .tags-trigger");
    if (trigger) trigger.innerHTML = tagsTriggerContent(panelLead, panelMeta);
    if ("has_social" in body) {
      const strona = document.querySelector('#lead-panel .csel[data-field="has_social"]');
      if (strona) strona.outerHTML = fieldCsel("has_social", panelMeta.websiteStatusOptions, panelLead.has_social, "—");
    }
  } catch (err) {
    alert("Błąd zapisu: " + err.message);
  }
}

document.getElementById("lead-panel").addEventListener("submit", async (e) => {
  if (e.target.id !== "panel-note-form") return;
  e.preventDefault();
  const input = document.getElementById("panel-note-input");
  const content = input.value.trim();
  if (!content) return;
  try {
    panelLead.notes_list = await api.post(`/api/leads/${leadId}/notes`, { content });
    input.value = "";
    renderLeadPanel();
  } catch (err) {
    alert("Błąd zapisu notatki: " + err.message);
  }
});

document.getElementById("lead-panel").addEventListener("keydown", (e) => {
  if (e.target.id === "panel-note-input") {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("panel-note-form").requestSubmit();
    }
    return;
  }
  if (e.target.classList.contains("panel-note-edit-input")) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      savePanelNoteEdit(editingPanelNoteId);
    } else if (e.key === "Escape") {
      editingPanelNoteId = null;
      renderLeadPanel();
    }
  }
});

async function loadLeadPanel() {
  const [meta, lead, me] = await Promise.all([api.get("/api/meta"), api.get(`/api/leads/${leadId}`), api.get("/api/auth/me")]);
  panelMeta = meta;
  panelLead = lead;
  // "Kto dzwoni" pusty - domyslnie Ty (zazwyczaj to Ty dzwonisz), ale zawsze edytowalne -
  // przydaje sie, gdy dzwonicie "za" siebie nawzajem
  if (!panelLead.caller) {
    panelLead = await api.patch(`/api/leads/${leadId}`, { caller: me.user.display_name });
  }

  // decyzja juz zapadla w poprzedniej wizycie - pokaz zapisany czas zamrozony, nie startuj
  // stopera od zera (patrz decision_seconds - kolumna leads.decision_seconds)
  if (panelLead.decision_seconds != null) {
    panelTimerFrozenAt = panelTimerStart + panelLead.decision_seconds * 1000;
  } else {
    panelTimerInterval = setInterval(renderPanelTimer, 1000);
  }
  renderLeadPanel();
}

initParticles();
render();
loadLeadPanel();
pingOnlinePresence(); // "jestem na scheme rozmowy" - patrz auth-widget.js
