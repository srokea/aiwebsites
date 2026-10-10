// Rachunek do druku: window.print() na A4 (w oknie druku "Zapisz jako PDF" daje plik PDF).
// Tytul strony = numer rachunku, wiec PDF zapisuje sie od razu z sensowna nazwa.

const billId = Number(new URLSearchParams(location.search).get("id"));
const root = document.getElementById("bill-root");

document.getElementById("bill-print").addEventListener("click", () => window.print());

async function load() {
  if (!billId) {
    root.innerHTML = `<div class="bill-msg">Brak numeru rachunku w adresie.</div>`;
    return;
  }
  try {
    const b = await api.get(`/api/clients/bills/${billId}`);
    document.title = `Rachunek ${b.number.replace(/\//g, "-")}`;
    if (b.client) document.getElementById("bill-back").href = `/klient.html?id=${b.client.id}`;
    root.innerHTML = renderBillHtml(b);
  } catch (err) {
    root.innerHTML = `<div class="bill-msg">Nie udało się wczytać rachunku: ${billEsc(err.message)}</div>`;
  }
}

load();
