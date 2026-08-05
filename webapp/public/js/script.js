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
    case "text":
      return `<div class="script-block ${b.speaker}"><div class="speaker ${b.speaker}">${SPEAKER_LABEL[b.speaker] || ""}</div>${b.html}</div>`;
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

async function init() {
  initParticles();
  const { lead, niche, script } = await api.get(`/api/scripts/lead/${leadId}`);

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

  document.getElementById("script-body").addEventListener("click", (e) => {
    const header = e.target.closest(".branch-header");
    if (!header) return;
    header.parentElement.classList.toggle("open");
  });
}

init();
