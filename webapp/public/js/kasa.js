// #6 - Historia transakcji (Kasa). Jedno miejsce na finanse:
//   - naleznosci klientow DO POTWIERDZENIA (300 zl wdrozenie + 100 zl/mies. abonament),
//   - reczne wpisy (przychod / wydatek),
//   - auto-koszty subskrypcji (dopisywane same, bez potwierdzania).
// Podsumowanie (przychod / koszty / bilans) = te same liczby co panel na dashboardzie.

initParticles();

const listEl = document.getElementById("tx-list");
const summaryEl = document.getElementById("ledger-summary");
const duesSection = document.getElementById("dues-section");
const duesListEl = document.getElementById("dues-list");
const form = document.getElementById("tx-form");
const errEl = document.getElementById("tx-error");
const dateInput = document.getElementById("tx-date");

const zl = (n) => `${Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtPeriod(period) {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function renderSummary(s) {
  summaryEl.innerHTML = `
    <div class="ledger-summary-item"><span class="ledger-lbl">Łączny przychód</span><span class="ledger-val pos">${zl(s.income)}</span></div>
    <div class="ledger-summary-item"><span class="ledger-lbl">Łączne koszty</span><span class="ledger-val neg">${zl(s.expense)}</span></div>
    <div class="ledger-summary-item"><span class="ledger-lbl">Bilans</span><span class="ledger-val ${s.balance >= 0 ? "pos" : "neg"}">${zl(s.balance)}</span></div>`;
}

function renderDues(dues) {
  if (!dues || !dues.length) {
    duesSection.hidden = true;
    duesListEl.innerHTML = "";
    return;
  }
  duesSection.hidden = false;
  duesListEl.innerHTML = dues
    .map(
      (d) => `
      <div class="dues-row">
        <span class="dues-company">${escapeHtml(d.company)}</span>
        <span class="dues-what">${escapeHtml(d.label)}${d.kind === "monthly" ? ` · ${escapeHtml(fmtPeriod(d.period))}` : ""}</span>
        <span class="dues-amount">${zl(d.amount)}</span>
        <span class="dues-actions">
          <button type="button" class="btn primary dues-confirm" data-confirm="${d.id}">Potwierdź</button>
          <button type="button" class="btn dues-skip" data-skip="${d.id}">Pomiń</button>
        </span>
      </div>`
    )
    .join("");
}

function renderList(rows) {
  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">Brak wpisów — dodaj pierwszy albo potwierdź należność powyżej.</div>`;
    return;
  }
  listEl.innerHTML = rows
    .map((t) => {
      const income = t.category === "przychod";
      return `
      <div class="tx-row ${t.auto ? "tx-row--auto" : ""}">
        <span class="tx-date">${fmtDate(t.occurred_on)}</span>
        <span class="tx-desc">${escapeHtml(t.description || "—")}${t.auto ? ' <span class="tx-tag">auto</span>' : ""}</span>
        <span class="tx-by">${escapeHtml(t.created_by || "")}</span>
        <span class="tx-amount ${income ? "pos" : "neg"}">${income ? "+" : "−"}${zl(t.amount)}</span>
        ${t.auto ? '<span class="tx-del-slot"></span>' : `<button type="button" class="tx-del" data-del="${t.id}" title="Usuń wpis">✕</button>`}
      </div>`;
    })
    .join("");
}

function applyBundle(b) {
  renderSummary(b.summary);
  renderDues(b.pendingDues);
  renderList(b.transactions);
}

async function load() {
  try {
    applyBundle(await api.get("/api/transactions"));
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errEl.style.display = "none";
  const body = {
    occurred_on: dateInput.value,
    description: document.getElementById("tx-desc").value,
    amount: document.getElementById("tx-amount").value,
    category: form.querySelector('input[name="tx-cat"]:checked').value,
  };
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    applyBundle(await api.post("/api/transactions", body));
    document.getElementById("tx-desc").value = "";
    document.getElementById("tx-amount").value = "";
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
  }
});

listEl.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  if (!confirm("Usunąć ten wpis?")) return;
  try {
    applyBundle(await api.del(`/api/transactions/${del.dataset.del}`));
  } catch (err) {
    alert("Blad usuwania: " + err.message);
  }
});

duesListEl.addEventListener("click", async (e) => {
  const confirmBtn = e.target.closest("[data-confirm]");
  const skipBtn = e.target.closest("[data-skip]");
  if (!confirmBtn && !skipBtn) return;
  const id = (confirmBtn || skipBtn).dataset.confirm || skipBtn.dataset.skip;
  const action = confirmBtn ? "confirm" : "skip";
  if (action === "skip" && !confirm("Pominąć tę należność? Nie wróci na listę.")) return;
  try {
    applyBundle(await api.post(`/api/finance/dues/${id}/${action}`, {}));
  } catch (err) {
    alert("Blad: " + err.message);
  }
});

// domyslna data = dzis (lokalnie)
(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  dateInput.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

load();
