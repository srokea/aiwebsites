// Modul "Klienci i umowy" - wspolne kawalki dla klienci.html, klient.html i niche.html:
// formatowanie, znaczek licznika dni do konca umowy i okienko "Dodac do klientow?" (budowane
// samo przy pierwszym uzyciu, jak modal profilu w auth-widget.js - bez duplikowania w HTML-ach).

const clZl = (n) => `${Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function clDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || "")) return iso || "";
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function clToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// licznik dni do konca umowy: zielony > 60, zolty 30-60, czerwony < 30, szary "zakonczona"
function clCountdownHtml(cd) {
  if (!cd) return "";
  if (cd.state === "none") return `<span class="cl-badge cl-badge--none">brak umowy</span>`;
  if (cd.state === "ended") return `<span class="cl-badge cl-badge--ended">zakończona</span>`;
  if (cd.state === "open") return `<span class="cl-badge cl-badge--open">bez daty końca</span>`;
  const label = cd.days === 0 ? "kończy się dziś" : cd.days === 1 ? "1 dzień" : `${cd.days} dni`;
  return `<span class="cl-badge cl-badge--${cd.state}">${label}</span>`;
}

function clStatusChip(options, value) {
  const o = (options || []).find((x) => x.value === value);
  if (!o) return "";
  return `<span class="cl-chip" style="--chip:${escapeHtml(o.color || "#888")}">${escapeHtml(o.label)}</span>`;
}

// ---------- okienko "Dodac do klientow?" / "Nowy klient" ----------

let clientModalEl = null;
let clientModalState = null;

function buildClientModal() {
  const el = document.createElement("div");
  el.className = "modal-overlay hidden";
  el.id = "client-offer-modal";
  el.innerHTML = `
    <div class="modal">
      <h3 id="co-title">Dodać do klientów?</h3>
      <div class="co-sub" id="co-sub"></div>
      <form id="co-form">
        <label for="co-name">Nazwa (na listę)</label>
        <input type="text" id="co-name" required>
        <label for="co-phone">Telefon</label>
        <input type="text" id="co-phone" inputmode="tel">
        <label for="co-city">Miasto</label>
        <input type="text" id="co-city">
        <label for="co-niche">Nisza</label>
        <input type="text" id="co-niche">
        <div class="hint">Firmę jak na fakturach, NIP i adres siedziby uzupełnisz w karcie klienta — bez nich nie wystawisz rachunku.</div>
        <div class="error" id="co-error" style="display:none;"></div>
        <div class="actions">
          <button type="button" class="btn" id="co-cancel">Nie teraz</button>
          <button type="submit" class="btn primary" id="co-submit">Dodaj do klientów</button>
        </div>
      </form>
      <div class="co-done hidden" id="co-done">
        <p>✅ Dodano do klientów.</p>
        <div class="actions">
          <button type="button" class="btn" id="co-close">Zamknij</button>
          <a class="btn primary" id="co-open" href="#">Otwórz kartę klienta</a>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const close = () => el.classList.add("hidden");
  el.addEventListener("click", (e) => {
    if (e.target === el) close();
  });
  el.querySelector("#co-cancel").addEventListener("click", close);
  el.querySelector("#co-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.classList.contains("hidden")) close();
  });
  el.querySelector("#co-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = el.querySelector("#co-error");
    errEl.style.display = "none";
    const btn = el.querySelector("#co-submit");
    btn.disabled = true;
    try {
      const { id } = await api.post("/api/clients", {
        lead_id: clientModalState.leadId,
        name: el.querySelector("#co-name").value,
        phone: el.querySelector("#co-phone").value,
        city: el.querySelector("#co-city").value,
        niche: el.querySelector("#co-niche").value,
      });
      el.querySelector("#co-form").classList.add("hidden");
      el.querySelector("#co-done").classList.remove("hidden");
      el.querySelector("#co-open").href = `/klient.html?id=${id}`;
      clientModalState.onSaved?.(id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "block";
    } finally {
      btn.disabled = false;
    }
  });
  return el;
}

// lead = { id, company_name, phone, city }, nicheName - tekst niszy do przepisania.
// Bez leada (lead = null) to zwykly formularz "Nowy klient".
function openClientModal({ lead = null, nicheName = "", onSaved = null } = {}) {
  if (!clientModalEl) clientModalEl = buildClientModal();
  clientModalState = { leadId: lead ? lead.id : null, onSaved };
  const el = clientModalEl;
  el.querySelector("#co-title").textContent = lead ? "Dodać do klientów?" : "Nowy klient";
  el.querySelector("#co-sub").textContent = lead ? `Dopięte: ${lead.company_name}. Dane przepisane z leada — popraw, jeśli trzeba.` : "";
  el.querySelector("#co-cancel").textContent = lead ? "Nie teraz" : "Anuluj";
  el.querySelector("#co-name").value = lead ? lead.company_name || "" : "";
  el.querySelector("#co-phone").value = lead ? lead.phone || "" : "";
  el.querySelector("#co-city").value = lead ? lead.city || "" : "";
  el.querySelector("#co-niche").value = nicheName || "";
  el.querySelector("#co-error").style.display = "none";
  el.querySelector("#co-form").classList.remove("hidden");
  el.querySelector("#co-done").classList.add("hidden");
  el.classList.remove("hidden");
  el.querySelector("#co-name").focus();
}

// Po ustawieniu "Dopiete" w tabeli leadow - pytamy tylko, gdy lead nie ma jeszcze karty klienta
async function offerAddClient(lead, nicheName) {
  try {
    const { client } = await api.get(`/api/clients/lead/${lead.id}`);
    if (!client) openClientModal({ lead, nicheName });
  } catch {
    /* brak okienka nie moze zepsuc zapisu statusu */
  }
}
