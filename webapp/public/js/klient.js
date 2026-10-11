// Karta klienta (modul "Klienci i umowy"): umowy (aktualna + historia), rachunki z opłacony /
// nieopłacony, wystawianie rachunku (typ -> podglad -> zapis -> druk) i dane klienta.
// Kazda zmiana na serwerze oddaje cala karte (GET /api/clients/:id), wiec po prostu przerysowujemy.

initParticles();

const clientId = Number(new URLSearchParams(location.search).get("id"));
const contractsEl = document.getElementById("cl-contracts");
const billsEl = document.getElementById("cl-bills");
const clientForm = document.getElementById("client-form");
let meta = null;
let card = null;

const optLabel = (options, value) => (options || []).find((o) => o.value === value)?.label || "";
const plainNum = (n) => (n == null ? "" : String(Number(n)).replace(".", ","));

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

// ---------- render ----------

function siteText(s, ownerId) {
  const text =
    s.name && s.domain ? `${escapeHtml(s.name)} <span class="cl-muted">(${escapeHtml(s.domain)})</span>` : escapeHtml(s.domain || s.name);
  // strona innego klienta w tej umowie - odnosnik do jego karty (na jego wlasnej karcie: "ten klient")
  if (!s.client_id || s.client_id === ownerId) return text;
  if (s.client_id === clientId) return `${text} <span class="cl-muted">— ten klient</span>`;
  const other = (card.clientOptions || []).find((c) => c.id === s.client_id);
  return `${text} <span class="cl-muted">→</span> <a class="cl-link" href="/klient.html?id=${s.client_id}">${escapeHtml(other ? other.name : "klient")}</a>`;
}

function renderHeader() {
  const c = card.client;
  document.title = `${c.name || c.legal_name} — Klienci`;
  document.getElementById("cl-title").textContent = c.name || c.legal_name || "Klient";
  const bits = [c.city, c.niche].filter(Boolean).map(escapeHtml);
  if (card.lead) bits.push(`lead: <a class="cl-link" href="/niche.html?id=${card.lead.niche_id}">${escapeHtml(card.lead.niche_name)}</a>`);
  document.getElementById("cl-sub").innerHTML = bits.join(" · ");
}

function renderContracts() {
  if (!card.contracts.length) {
    contractsEl.innerHTML = `<div class="cl-empty">Brak umowy — dodaj pierwszą, żeby wystawiać rachunki.</div>`;
    return;
  }
  const billed = new Set(card.bills.map((b) => b.contract_id));
  contractsEl.innerHTML = card.contracts
    .map((k) => {
      const current = k.id === card.currentContractId;
      const rows = [
        ["Zawarta", k.signed_on ? clDate(k.signed_on) : "<span class='cl-missing'>brak daty</span>"],
        ["Okres", `${k.starts_on ? clDate(k.starts_on) : "?"} – ${k.ends_on ? clDate(k.ends_on) : "bez daty końca"}`],
        ["Typ", [optLabel(meta.contractKindOptions, k.kind), optLabel(meta.contractVariantOptions, k.variant)].filter(Boolean).join(" · ")],
      ];
      if (k.kind !== "abonament") rows.push(["Wykonanie", k.onetime != null ? clZl(k.onetime) : "<span class='cl-missing'>brak kwoty</span>"]);
      rows.push(["Abonament", k.monthly != null ? `${clZl(k.monthly)} / mies.` : "<span class='cl-missing'>brak kwoty</span>"]);
      rows.push(["Strony", k.sites.length ? k.sites.map((s) => siteText(s, k.client_id)).join("<br>") : "—"]);
      rows.push(["Wykup", `${clZl(k.buyout)}${k.bought_out_on ? ` · <span class="cl-ok">wykupiona ${clDate(k.bought_out_on)}</span>` : ""}`]);
      rows.push([
        "Podpisana umowa",
        // cudza umowa (strona tego klienta jest w umowie kogos innego) - PDF tylko do odczytu
        k.covered_by
          ? k.has_pdf
            ? `<a class="cl-link" href="/api/clients/contracts/${k.id}/pdf" target="_blank">📎 Otwórz PDF</a>`
            : "—"
          : k.has_pdf
            ? `<a class="cl-link" href="/api/clients/contracts/${k.id}/pdf" target="_blank">📎 Otwórz PDF</a> · <button type="button" class="cl-linkbtn" data-pdf-up="${k.id}">podmień</button> · <button type="button" class="cl-linkbtn" data-pdf-del="${k.id}">usuń</button>`
            : `<button type="button" class="cl-linkbtn" data-pdf-up="${k.id}">📎 Wgraj PDF</button>`,
      ]);
      return `
      <div class="cl-contract${current ? " is-current" : ""}">
        <div class="cl-contract-head">
          <span class="cl-contract-no">Umowa ${escapeHtml(k.number)}</span>
          ${clStatusChip(meta.contractStatusOptions, k.status)}
          ${current ? `<span class="cl-tag">aktualna</span>` : ""}
          <span class="cl-contract-badge">${clCountdownHtml(k.countdown)}</span>
        </div>
        ${
          k.covered_by
            ? `<div class="cl-cover-note">Strona tego klienta jest w umowie <b>${escapeHtml(k.covered_by.name)}</b> — tam są rachunki i opłaty (Kasa nie liczy jej tutaj osobno).
               <a class="cl-link" href="/klient.html?id=${k.covered_by.client_id}">Otwórz kartę ${escapeHtml(k.covered_by.name)} →</a></div>`
            : ""
        }
        <dl class="cl-dl">${rows.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>
        ${k.notes ? `<div class="cl-notes">${escapeHtml(k.notes)}</div>` : ""}
        ${k.covered_by ? "" : `<div class="cl-contract-actions">
          <button type="button" class="btn primary prices-btn" data-bill="${k.id}">Wystaw rachunek</button>
          <button type="button" class="btn prices-btn" data-edit="${k.id}">Edytuj</button>
          ${billed.has(k.id) ? "" : `<button type="button" class="btn danger prices-btn" data-del-contract="${k.id}">Usuń</button>`}
        </div>`}
      </div>`;
    })
    .join("");
}

// wystawiony -> wyslany -> oplacony (po terminie wygrywa z "wyslany", bo to pilniejsze)
function billStatusHtml(b) {
  if (b.status === "oplacony") return `<span class="cl-badge cl-badge--ok">opłacony ${clDate(b.paid_on)}</span>`;
  const sent = b.sent_on ? ` · wysłany ${clDate(b.sent_on)}` : " · niewysłany";
  if (b.overdue) return `<span class="cl-badge cl-badge--urgent">po terminie (${clDate(b.due_on)})${sent}</span>`;
  if (!b.sent_on) return `<span class="cl-badge cl-badge--open">niewysłany · do ${clDate(b.due_on)}</span>`;
  return `<span class="cl-badge cl-badge--soon">wysłany ${clDate(b.sent_on)} · do ${clDate(b.due_on)}</span>`;
}

function renderBills() {
  if (!card.bills.length) {
    billsEl.innerHTML = `<div class="cl-empty">Brak rachunków.</div>`;
    return;
  }
  const numbers = new Map(card.contracts.map((k) => [k.id, k.number]));
  billsEl.innerHTML = card.bills
    .map(
      (b) => `
      <div class="cl-bill">
        <span class="cl-bill-main">
          <span class="cl-bill-no">Rachunek ${escapeHtml(b.number)}</span>
          <span class="cl-bill-what">${escapeHtml(optLabel(meta.billKindOptions, b.kind))}${b.period_label ? ` · ${escapeHtml(b.period_label)}` : ""} · ${clDate(b.issued_on)} · umowa ${escapeHtml(numbers.get(b.contract_id) || "")}</span>
        </span>
        <span class="cl-bill-amount">${clZl(b.total)}</span>
        <span class="cl-bill-status">${billStatusHtml(b)}</span>
        <span class="cl-bill-actions">
          <a class="btn prices-btn" href="/rachunek.html?id=${b.id}" target="_blank" title="Podgląd / druk">🖨️</a>
          ${
            b.status === "oplacony"
              ? ""
              : b.sent_on
                ? `<button type="button" class="tx-del" data-unsent="${b.id}" title="Cofnij „wysłany”">↺</button>`
                : `<button type="button" class="btn prices-btn" data-sent="${b.id}">Wysłany</button>`
          }
          ${
            b.status === "oplacony"
              ? `<button type="button" class="btn prices-btn" data-unpaid="${b.id}">Cofnij</button>`
              : `<button type="button" class="btn primary prices-btn" data-paid="${b.id}">Opłacony</button>`
          }
          ${b.deletable ? `<button type="button" class="tx-del" data-del-bill="${b.id}" title="Usuń (tylko ostatni w roku)">✕</button>` : ""}
        </span>
      </div>`
    )
    .join("");
}

function fillClientForm() {
  for (const input of clientForm.querySelectorAll("[data-f]")) input.value = card.client[input.dataset.f] || "";
}

function applyCard(c) {
  card = c;
  renderHeader();
  renderContracts();
  renderBills();
}

async function load() {
  if (!clientId) {
    contractsEl.innerHTML = `<div class="empty-state">Brak id klienta w adresie.</div>`;
    return;
  }
  try {
    const [m, c] = await Promise.all([api.get("/api/meta"), api.get(`/api/clients/${clientId}`)]);
    meta = m;
    applyCard(c);
    fillClientForm();
    // przyjscie z przypominajki ("Wystaw" na klienci.html): od razu okienko rachunku
    const q = new URLSearchParams(location.search);
    const preset = card.contracts.find((k) => k.id === Number(q.get("wystaw")) && !k.covered_by);
    if (preset) {
      openBillModal(preset, { kind: q.get("kind"), period: q.get("period") });
      history.replaceState(null, "", `/klient.html?id=${clientId}`);
    }
  } catch (err) {
    contractsEl.innerHTML = `<div class="empty-state">Nie udało się wczytać: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- dane klienta ----------

clientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("client-error");
  const savedEl = document.getElementById("client-saved");
  showError(errEl, "");
  const body = Object.fromEntries([...clientForm.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, i.value]));
  try {
    applyCard(await api.patch(`/api/clients/${clientId}`, body));
    savedEl.textContent = "Zapisano ✓";
    setTimeout(() => (savedEl.textContent = ""), 2500);
  } catch (err) {
    showError(errEl, err.message);
  }
});

document.getElementById("client-delete").addEventListener("click", async () => {
  if (!confirm(`Usunąć klienta „${card.client.name}” razem z umowami? Tej operacji nie da się cofnąć.`)) return;
  try {
    await api.del(`/api/clients/${clientId}`);
    location.href = "/klienci.html";
  } catch (err) {
    alert(err.message);
  }
});

// ---------- umowa: dodaj / edytuj ----------

const contractModal = document.getElementById("contract-modal");
const sitesEl = document.getElementById("ck-sites");
let editingContractId = null;

function fillSelect(id, options, value, emptyLabel) {
  const el = document.getElementById(id);
  el.innerHTML =
    (emptyLabel != null ? `<option value="">${emptyLabel}</option>` : "") +
    options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  el.value = value ?? "";
}

// strona + czyja jest: domyslnie ten klient; inny klient = jego strona jest w tej umowie (np. Uslugi
// Ogrodnicze w umowie Atelier) - wtedy Kasa nie liczy mu osobnych oplat
function siteRowHtml(s = { name: "", domain: "", client_id: null }) {
  const owner = s.client_id || clientId;
  const options = (card.clientOptions || [])
    .map((c) => `<option value="${c.id}"${c.id === owner ? " selected" : ""}>${escapeHtml(c.id === clientId ? `${c.name} (ten klient)` : c.name)}</option>`)
    .join("");
  return `
    <div class="cl-site-row">
      <input type="text" class="cl-site-name" placeholder="Nazwa strony" value="${escapeHtml(s.name)}">
      <input type="text" class="cl-site-domain" placeholder="domena.pl" value="${escapeHtml(s.domain)}">
      <button type="button" class="tx-del" data-site-del title="Usuń stronę">✕</button>
      <select class="cl-site-client" title="Czyja to strona">${options}</select>
    </div>`;
}

function openContractModal(k = null) {
  editingContractId = k ? k.id : null;
  document.getElementById("contract-modal-title").textContent = k ? `Umowa ${k.number}` : "Nowa umowa";
  document.getElementById("ck-number").value = k ? k.number : card.suggestedNumber;
  fillSelect("ck-status", meta.contractStatusOptions, k ? k.status : "szkic");
  fillSelect("ck-kind", meta.contractKindOptions, k ? k.kind : "wykonanie_abonament");
  fillSelect("ck-variant", meta.contractVariantOptions, k ? k.variant : "", "—");
  document.getElementById("ck-signed_on").value = k ? k.signed_on : "";
  document.getElementById("ck-starts_on").value = k ? k.starts_on : "";
  document.getElementById("ck-ends_on").value = k ? k.ends_on : "";
  document.getElementById("ck-onetime").value = k ? plainNum(k.onetime) : "300";
  document.getElementById("ck-monthly").value = k ? plainNum(k.monthly) : "100";
  document.getElementById("ck-buyout").value = plainNum(k ? k.buyout : meta.buyoutDefault);
  document.getElementById("ck-notes").value = k ? k.notes : "";
  const sites = k && k.sites.length ? k.sites : [{ name: card.client.name || "", domain: "" }];
  sitesEl.innerHTML = sites.map(siteRowHtml).join("");
  showError(document.getElementById("contract-error"), "");
  contractModal.classList.remove("hidden");
}

document.getElementById("contract-add").addEventListener("click", () => openContractModal());
document.getElementById("ck-site-add").addEventListener("click", () => sitesEl.insertAdjacentHTML("beforeend", siteRowHtml()));
sitesEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-site-del]")) e.target.closest(".cl-site-row").remove();
});
document.getElementById("contract-cancel").addEventListener("click", () => contractModal.classList.add("hidden"));

document.getElementById("contract-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = (id) => document.getElementById(id).value;
  const body = {
    number: v("ck-number"),
    status: v("ck-status"),
    kind: v("ck-kind"),
    variant: v("ck-variant"),
    signed_on: v("ck-signed_on"),
    starts_on: v("ck-starts_on"),
    ends_on: v("ck-ends_on"),
    onetime: v("ck-onetime"),
    monthly: v("ck-monthly"),
    buyout: v("ck-buyout"),
    notes: v("ck-notes"),
    sites: [...sitesEl.querySelectorAll(".cl-site-row")].map((r) => {
      const owner = Number(r.querySelector(".cl-site-client").value);
      return {
        name: r.querySelector(".cl-site-name").value,
        domain: r.querySelector(".cl-site-domain").value,
        ...(owner && owner !== clientId ? { client_id: owner } : {}),
      };
    }),
  };
  try {
    applyCard(
      editingContractId
        ? await api.patch(`/api/clients/contracts/${editingContractId}`, body)
        : await api.post(`/api/clients/${clientId}/contracts`, body)
    );
    contractModal.classList.add("hidden");
  } catch (err) {
    showError(document.getElementById("contract-error"), err.message);
  }
});

// ---------- umowa: akcje na karcie (rachunek / edycja / usun / PDF) ----------

const pdfInput = document.getElementById("pdf-input");
let pdfContractId = null;

contractsEl.addEventListener("click", async (e) => {
  const t = (sel) => e.target.closest(sel);
  if (t("[data-edit]")) return openContractModal(card.contracts.find((k) => k.id === Number(t("[data-edit]").dataset.edit)));
  if (t("[data-bill]")) return openBillModal(card.contracts.find((k) => k.id === Number(t("[data-bill]").dataset.bill)));
  if (t("[data-pdf-up]")) {
    pdfContractId = Number(t("[data-pdf-up]").dataset.pdfUp);
    pdfInput.value = "";
    return pdfInput.click();
  }
  try {
    if (t("[data-pdf-del]")) {
      if (!confirm("Usunąć wgrany PDF umowy?")) return;
      applyCard(await api.del(`/api/clients/contracts/${t("[data-pdf-del]").dataset.pdfDel}/pdf`));
    } else if (t("[data-del-contract]")) {
      if (!confirm("Usunąć tę umowę?")) return;
      applyCard(await api.del(`/api/clients/contracts/${t("[data-del-contract]").dataset.delContract}`));
    }
  } catch (err) {
    alert(err.message);
  }
});

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files[0];
  if (!file || !pdfContractId) return;
  const fd = new FormData();
  fd.append("file", file);
  try {
    applyCard(await api.postForm(`/api/clients/contracts/${pdfContractId}/pdf`, fd));
  } catch (err) {
    alert("Nie udało się wgrać: " + err.message);
  }
});

// ---------- wystawianie rachunku: typ -> podglad -> zapis ----------

const billModal = document.getElementById("bill-modal");
let billContract = null;
let billItems = null; // pozycje poprawione recznie w podgladzie (null = wyliczone z umowy)
let lastPreview = null;

function billStep(n) {
  for (const i of [1, 2, 3]) document.getElementById(`bill-step${i}`).classList.toggle("hidden", i !== n);
}

function nextUnbilledMonth(k) {
  const billed = new Set(card.bills.filter((b) => b.contract_id === k.id && b.kind === "abonament").map((b) => b.period));
  const d = new Date();
  for (let i = 0; i < 36; i++) {
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!billed.has(p)) return p;
    d.setMonth(d.getMonth() + 1);
  }
  return "";
}

// preset = { kind, period } z przypominajki na klienci.html
function openBillModal(k, preset = {}) {
  billContract = k;
  billItems = null;
  document.getElementById("bill-modal-title").textContent = `Wystaw rachunek — umowa ${k.number}`;
  const existing = (kind) => card.bills.find((b) => b.contract_id === k.id && b.kind === kind);
  const kinds = meta.billKindOptions.map((o) => {
    const done = o.value !== "abonament" && existing(o.value);
    const notApplicable = o.value === "wykonanie" && k.kind === "abonament";
    const note = done ? ` <span class="cl-muted">— już jest (nr ${escapeHtml(done.number)})</span>` : notApplicable ? ` <span class="cl-muted">— umowa tylko abonament</span>` : "";
    return `<label class="cl-kind${done || notApplicable ? " is-disabled" : ""}"><input type="radio" name="bill-kind" value="${o.value}"${done || notApplicable ? " disabled" : ""}> ${escapeHtml(o.value === "abonament" ? "Abonament za miesiąc" : o.label)}${note}</label>`;
  });
  document.getElementById("bill-kinds").innerHTML = kinds.join("");
  const first =
    (preset.kind && document.querySelector(`#bill-kinds input:not(:disabled)[value="${preset.kind}"]`)) ||
    document.querySelector('#bill-kinds input:not(:disabled)[value="abonament"]') ||
    document.querySelector("#bill-kinds input:not(:disabled)");
  if (first) first.checked = true;
  document.getElementById("bill-period").value = /^\d{4}-\d{2}$/.test(preset.period || "") ? preset.period : nextUnbilledMonth(k);
  document.getElementById("bill-issued").value = clToday();
  syncPeriodVisibility();
  showError(document.getElementById("bill-error1"), "");
  billStep(1);
  billModal.classList.remove("hidden");
}

const billKind = () => document.querySelector('#bill-kinds input[name="bill-kind"]:checked')?.value || "";
function syncPeriodVisibility() {
  document.getElementById("bill-period-wrap").classList.toggle("hidden", billKind() !== "abonament");
}
document.getElementById("bill-kinds").addEventListener("change", () => {
  billItems = null;
  syncPeriodVisibility();
});

function billRequest() {
  return {
    kind: billKind(),
    period: document.getElementById("bill-period").value,
    issued_on: document.getElementById("bill-issued").value,
    ...(billItems ? { items: billItems } : {}),
  };
}

function renderPreview(p) {
  lastPreview = p;
  const errBox = document.getElementById("bill-errors");
  const warnBox = document.getElementById("bill-warnings");
  errBox.classList.toggle("hidden", !p.errors.length);
  errBox.innerHTML = p.errors.length
    ? `<b>Uzupełnij przed wystawieniem:</b><ul>${p.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
    : "";
  warnBox.classList.toggle("hidden", !p.warnings.length);
  warnBox.innerHTML = p.warnings.map((x) => `<div>⚠️ ${escapeHtml(x)}</div>`).join("");
  document.getElementById("bill-items").innerHTML = p.bill.items
    .map(
      (it, i) => `
      <div class="cl-item" data-i="${i}">
        <textarea class="cl-item-desc" rows="2">${escapeHtml(it.description)}</textarea>
        <label class="prices-field"><input type="text" class="cl-item-amount" inputmode="decimal" value="${plainNum(it.amount)}"> zł</label>
      </div>`
    )
    .join("");
  document.getElementById("bill-preview").innerHTML = renderBillHtml(p.bill);
  document.getElementById("bill-save").disabled = p.errors.length > 0;
}

async function preview(errId) {
  const errEl = document.getElementById(errId);
  showError(errEl, "");
  try {
    renderPreview(await api.post(`/api/clients/contracts/${billContract.id}/bills/preview`, billRequest()));
    return true;
  } catch (err) {
    showError(errEl, err.message);
    return false;
  }
}

document.getElementById("bill-preview-btn").addEventListener("click", async () => {
  if (!billKind()) return showError(document.getElementById("bill-error1"), "Wybierz, za co jest rachunek");
  if (await preview("bill-error1")) billStep(2);
});

// poprawka pozycji -> przeliczenie podgladu (sume i kwote slownie liczy serwer)
document.getElementById("bill-items").addEventListener("change", () => {
  billItems = [...document.querySelectorAll("#bill-items .cl-item")].map((row) => ({
    description: row.querySelector(".cl-item-desc").value,
    amount: row.querySelector(".cl-item-amount").value,
  }));
  preview("bill-error2");
});

document.getElementById("bill-back").addEventListener("click", () => billStep(1));

document.getElementById("bill-save").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  showError(document.getElementById("bill-error2"), "");
  try {
    const { id } = await api.post(`/api/clients/contracts/${billContract.id}/bills`, billRequest());
    applyCard(await api.get(`/api/clients/${clientId}`));
    const saved = card.bills.find((b) => b.id === id);
    document.getElementById("bill-done-text").textContent = `✅ Wystawiono rachunek nr ${saved ? saved.number : ""} na ${saved ? clZl(saved.total) : ""}.`;
    document.getElementById("bill-print-link").href = `/rachunek.html?id=${id}`;
    const sentBtn = document.getElementById("bill-sent-now");
    sentBtn.dataset.id = id;
    sentBtn.disabled = false;
    sentBtn.textContent = "✉️ Oznacz jako wysłany";
    billStep(3);
  } catch (err) {
    showError(document.getElementById("bill-error2"), err.message);
    btn.disabled = false;
  }
});

for (const b of billModal.querySelectorAll("[data-bill-close]")) b.addEventListener("click", () => billModal.classList.add("hidden"));

document.getElementById("bill-sent-now").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    applyCard(await api.post(`/api/clients/bills/${btn.dataset.id}/sent`, {}));
    btn.textContent = "✅ Oznaczony jako wysłany";
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
});

// ---------- rachunki: oplacony / cofnij / usun ----------

const paidModal = document.getElementById("paid-modal");
let paidBillId = null;

billsEl.addEventListener("click", async (e) => {
  const paid = e.target.closest("[data-paid]");
  const unpaid = e.target.closest("[data-unpaid]");
  const del = e.target.closest("[data-del-bill]");
  const sent = e.target.closest("[data-sent]");
  const unsent = e.target.closest("[data-unsent]");
  if (paid) {
    paidBillId = Number(paid.dataset.paid);
    const b = card.bills.find((x) => x.id === paidBillId);
    document.getElementById("paid-title").textContent = `Rachunek ${b.number} — opłacony`;
    document.getElementById("paid-date").value = clToday();
    showError(document.getElementById("paid-error"), "");
    paidModal.classList.remove("hidden");
    return;
  }
  try {
    if (sent) {
      applyCard(await api.post(`/api/clients/bills/${sent.dataset.sent}/sent`, {}));
    } else if (unsent) {
      applyCard(await api.post(`/api/clients/bills/${unsent.dataset.unsent}/sent`, { sent_on: "" }));
    } else if (unpaid) {
      if (!confirm("Cofnąć „opłacony”? Wpis przychodu zniknie z Kasy.")) return;
      applyCard(await api.post(`/api/clients/bills/${unpaid.dataset.unpaid}/unpaid`, {}));
    } else if (del) {
      if (!confirm("Usunąć ten rachunek? Numer wróci do puli.")) return;
      applyCard(await api.del(`/api/clients/bills/${del.dataset.delBill}`));
    }
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("paid-cancel").addEventListener("click", () => paidModal.classList.add("hidden"));
document.getElementById("paid-save").addEventListener("click", async () => {
  try {
    applyCard(await api.post(`/api/clients/bills/${paidBillId}/paid`, { paid_on: document.getElementById("paid-date").value }));
    paidModal.classList.add("hidden");
  } catch (err) {
    showError(document.getElementById("paid-error"), err.message);
  }
});

for (const m of [contractModal, billModal, paidModal]) {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.add("hidden");
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") for (const m of [contractModal, billModal, paidModal]) m.classList.add("hidden");
});

load();
