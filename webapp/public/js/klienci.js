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

// ---------- podpis (Moje dane) ----------
// Zapisujemy PNG z przezroczystym tlem, przyciety do samego podpisu i zmniejszony (max 600x200) -
// tak samo dla narysowanego i dla zdjecia z kartki, zeby na rachunku wygladal jak odreczny.

const sigBox = document.getElementById("ct-sig-box");
const sigImg = document.getElementById("ct-sig-img");
const sigPad = document.getElementById("ct-sig-pad");
const SIG_INK = "#1b2a6b"; // dlugopis
const SIG_MAX_W = 600;
const SIG_MAX_H = 200;
const SIG_MAX_LEN = 90000; // express.json przyjmuje do 100 kB
let signature = "";

function renderSignature(drawing = false) {
  sigBox.classList.toggle("is-drawing", drawing);
  sigPad.hidden = !drawing;
  sigImg.hidden = drawing || !signature;
  if (signature) sigImg.src = signature;
  document.getElementById("ct-sig-empty").hidden = drawing || !!signature;
  document.getElementById("ct-sig-remove").hidden = !signature;
  document.getElementById("ct-sig-view-actions").hidden = drawing;
  document.getElementById("ct-sig-draw-actions").hidden = !drawing;
}

// obraz podpisu na jasnym tle -> data URL PNG: tlo przezroczyste, tusz w jednym kolorze (sredni
// kolor kresek - niebieski dlugopis zostaje niebieski), krycie wg tego, jak ciemny jest piksel
function signatureFromCanvas(src) {
  const { width: w, height: h } = src;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const lum = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) {
    const l = Math.round(0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]);
    lum[i] = l;
    hist[l]++;
  }
  // jasnosc kartki = 85. percentyl (podpis to drobna czesc zdjecia); tusz = wyraznie ciemniejsze
  let paper = 255;
  for (let l = 0, acc = 0; l < 256; l++) {
    acc += hist[l];
    if (acc >= w * h * 0.85) {
      paper = l;
      break;
    }
  }
  const hi = paper * 0.78;
  const lo = paper * 0.5;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let r = 0, g = 0, b = 0, n = 0;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = Math.max(0, Math.min(1, (hi - lum[i]) / (hi - lo)));
      if (a < 0.08) continue;
      alpha[i] = Math.round(a * 255);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (a > 0.6) {
        r += px[i * 4];
        g += px[i * 4 + 1];
        b += px[i * 4 + 2];
        n++;
      }
    }
  }
  if (maxX < 0 || !n) return null;
  const ink = [r / n, g / n, b / n];
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = alpha[i] ? ink[0] : 0;
    px[i * 4 + 1] = alpha[i] ? ink[1] : 0;
    px[i * 4 + 2] = alpha[i] ? ink[2] : 0;
    px[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  const pad = 4;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(w, maxX + pad + 1) - sx;
  const sh = Math.min(h, maxY + pad + 1) - sy;
  const scale = Math.min(1, SIG_MAX_W / sw, SIG_MAX_H / sh);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  out.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function setSignature(dataUrl) {
  const errEl = document.getElementById("contractor-error");
  if (!dataUrl) {
    errEl.textContent = "Nie widać podpisu — spróbuj jeszcze raz (na zdjęciu: ciemny długopis, biała kartka, bez cienia).";
    errEl.style.display = "block";
    return false;
  }
  if (dataUrl.length > SIG_MAX_LEN) {
    errEl.textContent = "Podpis wyszedł za duży — zrób zdjęcie bliżej, samej linijki z podpisem.";
    errEl.style.display = "block";
    return false;
  }
  errEl.style.display = "none";
  signature = dataUrl;
  return true;
}

// rysowanie palcem / myszka / rysikiem
let padCtx = null;
let padDirty = false;

function startPad() {
  renderSignature(true);
  const dpr = window.devicePixelRatio || 1;
  sigPad.width = Math.round(sigPad.clientWidth * dpr);
  sigPad.height = Math.round(sigPad.clientHeight * dpr);
  padCtx = sigPad.getContext("2d", { willReadFrequently: true });
  padCtx.fillStyle = "#fff";
  padCtx.fillRect(0, 0, sigPad.width, sigPad.height);
  padCtx.strokeStyle = SIG_INK;
  padCtx.fillStyle = SIG_INK;
  padCtx.lineWidth = 2.6 * dpr;
  padCtx.lineCap = "round";
  padCtx.lineJoin = "round";
  padDirty = false;
}

let last = null;
const padPoint = (e) => {
  const r = sigPad.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * sigPad.width, y: ((e.clientY - r.top) / r.height) * sigPad.height };
};
sigPad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  sigPad.setPointerCapture(e.pointerId);
  last = padPoint(e);
  padCtx.beginPath();
  padCtx.arc(last.x, last.y, padCtx.lineWidth / 2, 0, Math.PI * 2);
  padCtx.fill();
  padCtx.beginPath();
  padCtx.moveTo(last.x, last.y);
  padDirty = true;
});
sigPad.addEventListener("pointermove", (e) => {
  if (!last) return;
  const p = padPoint(e);
  // wygladzanie: krzywa przez srodki kolejnych odcinkow zamiast kanciastych linii
  const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
  padCtx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
  padCtx.stroke();
  padCtx.beginPath();
  padCtx.moveTo(mid.x, mid.y);
  last = p;
});
const endStroke = () => {
  if (!last) return;
  padCtx.lineTo(last.x, last.y);
  padCtx.stroke();
  last = null;
};
sigPad.addEventListener("pointerup", endStroke);
sigPad.addEventListener("pointercancel", endStroke);

document.getElementById("ct-sig-draw").addEventListener("click", startPad);
document.getElementById("ct-sig-pad-clear").addEventListener("click", startPad);
document.getElementById("ct-sig-pad-cancel").addEventListener("click", () => renderSignature());
document.getElementById("ct-sig-pad-done").addEventListener("click", () => {
  if (!padDirty) return renderSignature();
  if (setSignature(signatureFromCanvas(sigPad))) renderSignature();
  else startPad();
});
document.getElementById("ct-sig-remove").addEventListener("click", () => {
  signature = "";
  renderSignature();
});

// zdjecie podpisu: zmniejszone do 1400 px, zeby 12-Mpx zdjecie z telefonu nie mielilo sie dlugo
const sigFile = document.getElementById("ct-sig-file");
document.getElementById("ct-sig-upload").addEventListener("click", () => sigFile.click());
sigFile.addEventListener("change", () => {
  const file = sigFile.files[0];
  sigFile.value = "";
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
    if (setSignature(signatureFromCanvas(c))) renderSignature();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setSignature(null);
  };
  img.src = url;
});

document.getElementById("contractor-open").addEventListener("click", async () => {
  document.getElementById("contractor-error").style.display = "none";
  try {
    const c = await api.get("/api/clients/contractor");
    for (const f of CONTRACTOR_FIELDS) document.getElementById(`ct-${f}`).value = c[f] || "";
    signature = c.signature || "";
    contractorModal.classList.remove("hidden");
    renderSignature();
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
  body.signature = signature;
  try {
    await api.put("/api/clients/contractor", body);
    closeContractor();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
});

load();
