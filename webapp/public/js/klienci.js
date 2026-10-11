// Lista klientow (modul "Klienci i umowy"): kto ile ma do konca umowy - posortowane od
// najblizszego konca, zeby od razu bylo widac, z kim rozmawiac o przedluzeniu. Na gorze suma
// abonamentow z aktywnych umow i dopiete leady, ktore nie maja jeszcze karty klienta.

initParticles();

const listEl = document.getElementById("cl-list");
const summaryEl = document.getElementById("clients-summary");
const candidatesEl = document.getElementById("cl-candidates");
let meta = null;
let candidates = [];

function renderSummary(d) {
  summaryEl.innerHTML = `
    <div class="ledger-summary-item">
      <span class="ledger-lbl">Abonamenty / mies.</span>
      <span class="ledger-val pos">${clZl(d.monthlySum)}</span>
      <span class="cl-summary-sub">z ${d.activeCount} ${d.activeCount === 1 ? "aktywnej umowy" : "aktywnych umów"}</span>
    </div>`;
}

// przypominajki z rachunkami (te same co w dzwonku na dashboardzie): wystaw / wyslij / po terminie
const todoEl = document.getElementById("cl-todo");

function todoAction(t) {
  if (t.type === "issue") {
    const q = `id=${t.client_id}&wystaw=${t.contract_id}&kind=${t.kind}${t.period ? `&period=${t.period}` : ""}`;
    return `<button type="button" class="cl-linkbtn cl-todo-skip" data-skip="${t.contract_id}" data-kind="${t.kind}" data-period="${t.period || ""}">pomiń</button>
      <a class="btn prices-btn" href="/klient.html?${q}">Wystaw</a>`;
  }
  if (t.type === "send") {
    return `<a class="btn prices-btn" href="/rachunek.html?id=${t.bill_id}" target="_blank" title="Podgląd / druk">🖨️</a>
      <button type="button" class="btn prices-btn" data-sent="${t.bill_id}">Wysłany</button>`;
  }
  return `<a class="btn prices-btn" href="/klient.html?id=${t.client_id}">Karta</a>`;
}

function renderTodo(todo) {
  if (!todo || !todo.length) {
    todoEl.hidden = true;
    todoEl.innerHTML = "";
    return;
  }
  todoEl.hidden = false;
  todoEl.innerHTML = `
    <div class="cl-candidates-title">Do zrobienia z rachunkami (${todo.length})</div>
    <div class="cl-todo-list">
      ${todo
        .map(
          (t) => `
        <div class="cl-todo-item${t.late ? " is-late" : ""}">
          <span class="cl-todo-text"><b>${escapeHtml(t.client_name)}</b> <span class="cl-todo-label">${escapeHtml(t.label)}</span></span>
          <span class="cl-todo-actions">${todoAction(t)}</span>
        </div>`
        )
        .join("")}
    </div>`;
}

todoEl.addEventListener("click", async (e) => {
  const skip = e.target.closest("[data-skip]");
  const btn = skip || e.target.closest("[data-sent]");
  if (!btn) return;
  if (skip && !confirm("Nie przypominać o tym rachunku? (np. darmowy miesiąc albo rozliczone inaczej)")) return;
  btn.disabled = true;
  try {
    if (skip) {
      await api.post(`/api/clients/contracts/${skip.dataset.skip}/skip`, { kind: skip.dataset.kind, period: skip.dataset.period });
    } else {
      await api.post(`/api/clients/bills/${btn.dataset.sent}/sent`, {});
    }
    load();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
});

function renderCandidates() {
  if (!candidates.length) {
    candidatesEl.hidden = true;
    candidatesEl.innerHTML = "";
    return;
  }
  candidatesEl.hidden = false;
  candidatesEl.innerHTML = `
    <div class="cl-candidates-title">Dopięte bez karty klienta (${candidates.length})</div>
    <div class="cl-candidates-list">
      ${candidates
        .map(
          (l) => `
        <div class="cl-candidate">
          <span class="cl-candidate-name">${escapeHtml(l.company_name)}<span class="cl-muted"> · ${escapeHtml(l.niche_name)}</span></span>
          <button type="button" class="btn prices-btn" data-add-lead="${l.id}">Dodaj</button>
        </div>`
        )
        .join("")}
    </div>`;
}

function renderList(clients) {
  if (!clients.length) {
    listEl.innerHTML = `<div class="empty-state">Brak klientów — dodaj pierwszego albo przepisz dopiętego leada powyżej.</div>`;
    return;
  }
  listEl.innerHTML = clients
    .map((c) => {
      const k = c.contract;
      const sub = [c.city, c.niche].filter(Boolean).map(escapeHtml).join(" · ");
      const contract = k
        ? `<span class="cl-row-contract">Umowa ${escapeHtml(k.number)} ${clStatusChip(meta?.contractStatusOptions, k.status)}${
            k.covered_by ? `<span class="cl-row-cover">w umowie: ${escapeHtml(k.covered_by.name)}</span>` : ""
          }</span>`
        : `<span class="cl-row-contract cl-muted">—</span>`;
      const end = k && k.ends_on ? `<span class="cl-row-end">do ${clDate(k.ends_on)}</span>` : `<span class="cl-row-end"></span>`;
      return `
      <a class="cl-row" href="/klient.html?id=${c.id}">
        <span class="cl-row-main">
          <span class="cl-row-name">${escapeHtml(c.name)}</span>
          ${sub ? `<span class="cl-row-sub">${sub}</span>` : ""}
        </span>
        ${contract}
        ${end}
        <span class="cl-row-badge">${clCountdownHtml(c.countdown)}</span>
      </a>`;
    })
    .join("");
}

async function load() {
  try {
    const [m, d] = await Promise.all([meta ? Promise.resolve(meta) : api.get("/api/meta"), api.get("/api/clients")]);
    meta = m;
    candidates = d.candidates;
    renderSummary(d);
    renderTodo(d.todo);
    renderCandidates();
    renderList(d.clients);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

candidatesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add-lead]");
  if (!btn) return;
  const lead = candidates.find((l) => l.id === Number(btn.dataset.addLead));
  if (lead) openClientModal({ lead, nicheName: lead.niche_name, onSaved: load });
});

document.getElementById("client-new").addEventListener("click", () => openClientModal({ onSaved: load }));

// ---------- Moje dane ----------

const contractorModal = document.getElementById("contractor-modal");
const contractorForm = document.getElementById("contractor-form");
const CONTRACTOR_FIELDS = ["full_name", "address", "pesel", "id_card", "bank_account", "phone", "email", "issue_city", "student_until"];

document.getElementById("contractor-open").addEventListener("click", async () => {
  document.getElementById("contractor-error").style.display = "none";
  try {
    const c = await api.get("/api/clients/contractor");
    for (const f of CONTRACTOR_FIELDS) document.getElementById(`ct-${f}`).value = c[f] || "";
    contractorModal.classList.remove("hidden");
    document.getElementById("ct-full_name").focus();
  } catch (err) {
    alert("Nie udało się wczytać danych: " + err.message);
  }
});

const closeContractor = () => contractorModal.classList.add("hidden");
document.getElementById("contractor-cancel").addEventListener("click", closeContractor);
contractorModal.addEventListener("click", (e) => {
  if (e.target === contractorModal) closeContractor();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeContractor();
});

contractorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("contractor-error");
  errEl.style.display = "none";
  const body = Object.fromEntries(CONTRACTOR_FIELDS.map((f) => [f, document.getElementById(`ct-${f}`).value]));
  try {
    await api.put("/api/clients/contractor", body);
    closeContractor();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
});

load();
