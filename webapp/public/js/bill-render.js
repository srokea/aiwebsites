// Tresc rachunku jako HTML - jedno zrodlo dla podgladu w karcie klienta (klient.js) i strony do
// druku (rachunek.js). Rysuje WYLACZNIE z migawki (b.snapshot) zapisanej przy wystawieniu, wiec
// pozniejsza zmiana danych klienta czy Moich danych nie zmienia starego rachunku.

function billEsc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const billZl = (n) => `${Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function billDate(iso) {
  return /^\d{4}-\d{2}-\d{2}/.test(iso || "") ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : billEsc(iso || "…");
}

// "ul. 1 Maja 21a, 97-300 Piotrków" -> ulica i kod+miasto w dwoch liniach
function billAddress(a) {
  return billEsc(a || "").replace(/,\s*(?=\d{2}-\d{3})/, "<br>");
}

// 26 cyfr NRB -> "12 3456 7890 1234 5678 9012 3456" (z prefiksem PL, jesli byl)
function billAccount(raw) {
  const s = String(raw || "").toUpperCase().replace(/\s/g, "");
  const pl = s.startsWith("PL") ? "PL " : "";
  const d = s.replace(/\D/g, "");
  if (d.length !== 26) return billEsc(raw || "");
  return pl + [d.slice(0, 2), ...d.slice(2).match(/.{4}/g)].join(" ");
}

function renderBillHtml(b) {
  const s = b.snapshot || {};
  const me = s.contractor || {};
  const cl = s.client || {};
  const k = s.contract || {};
  const rows = (b.items || [])
    .map(
      (it, i) => `
      <tr>
        <td class="bill-lp">${i + 1}</td>
        <td>${billEsc(it.description)}</td>
        <td class="bill-amt">${billZl(it.amount ?? it.amount_grosze / 100)}</td>
      </tr>`
    )
    .join("");
  return `
  <article class="bill-paper">
    <div class="bill-place">${billEsc(me.issue_city)}, ${billDate(b.issued_on)}</div>
    <h1 class="bill-title">RACHUNEK nr ${billEsc(b.number)}</h1>
    <div class="bill-sub">do umowy zlecenia nr ${billEsc(k.number)} z dnia ${billDate(k.signed_on)}</div>
    <div class="bill-parties">
      <div>
        <div class="bill-label">Zleceniobiorca:</div>
        <div>${billEsc(me.full_name)}</div>
        <div>${billAddress(me.address)}</div>
        ${me.pesel !== undefined ? `<div>PESEL: ${billEsc(me.pesel)}</div>` : ""}
      </div>
      <div>
        <div class="bill-label">Zleceniodawca:</div>
        <div>${billEsc(cl.legal_name)}</div>
        <div>${billAddress(cl.address)}</div>
        <div>NIP: ${billEsc(cl.nip)}</div>
      </div>
    </div>
    <table class="bill-items">
      <thead><tr><th class="bill-lp">Lp.</th><th>Opis</th><th class="bill-amt">Kwota</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="bill-total">Razem do wypłaty: <b>${billZl(b.total ?? b.total_grosze / 100)}</b></div>
    <div class="bill-words">Słownie: ${billEsc(b.words)}</div>
    <p class="bill-pay">Płatne przelewem na rachunek nr ${me.bank_account !== undefined ? billAccount(me.bank_account) : "…"} w terminie do ${billDate(b.due_on)}.</p>
    ${
      s.clause
        ? `<p class="bill-clause">Wynagrodzenie zwolnione z podatku dochodowego (art. 21 ust. 1 pkt 148 ustawy o PIT) i nie podlega składkom ZUS (art. 6 ust. 4 ustawy o systemie ubezpieczeń społecznych) — Zleceniobiorca jest studentem przed ukończeniem 26. roku życia.</p>`
        : ""
    }
    <div class="bill-sign">
      <div class="bill-sign-line">........................................</div>
      <div>podpis Zleceniobiorcy</div>
    </div>
  </article>`;
}
